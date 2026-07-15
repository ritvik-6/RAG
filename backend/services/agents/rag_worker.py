import asyncio
import json
import re
from backend.config import EMBEDDINGS, MODEL, ROUTER_MODEL, USE_SHARED_COLLECTION, RERANKER
from backend.vector_store import get_milvus
from backend.prompts import get_rag_agent_prompt, get_query_decomposition_prompt
from backend.config import worker_prompt_var
from rank_bm25 import BM25Okapi


# ── NEW: history-aware query rewrite ────────────────────────────────────

REWRITE_PROMPT = """Given this recent conversation and a follow-up question, determine if the
follow-up is a continuation of the SAME topic as the conversation, or a NEW, unrelated topic.

- If it's a continuation (uses pronouns, refers to "it"/"that", or is clearly building on the
  previous topic), rewrite it as a standalone question containing the necessary context.
- If it's a NEW topic unrelated to the conversation, return the follow-up EXACTLY as written,
  unchanged. Do NOT force unrelated context onto it.

Output ONLY the resulting question. No preamble, no explanation, no markdown.

Conversation:
{history_text}

Follow-up: {query}
Standalone question:"""

_FOLLOWUP_SIGNAL = re.compile(
    r'\b(it|that|this|those|these|he|she|they|the (above|previous|same))\b',
    re.IGNORECASE
)


def _needs_rewrite(query: str) -> bool:
    """Cheap heuristic gate — only pay for a rewrite call when the query
    looks short or pronoun/reference-heavy. Skips the LLM call for
    already-standalone questions."""
    return len(query.split()) <= 6 or bool(_FOLLOWUP_SIGNAL.search(query))


async def _rewrite_query(query: str, history: list[dict]) -> str:
    history_text = "\n".join(f"{h['role']}: {h['content']}" for h in history)
    try:
        rewrite_res = await ROUTER_MODEL.ainvoke([
            {"role": "system", "content": REWRITE_PROMPT.format(history_text=history_text, query=query)}
        ])
        rewritten = rewrite_res.content.strip()
        # Defensive: strip label the model sometimes echoes back
        for prefix in ("Standalone question:", "Rewritten question:", "Standalone:"):
            if rewritten.lower().startswith(prefix.lower()):
                rewritten = rewritten[len(prefix):].strip()
        print(f"[REWRITE] {query!r} -> {rewritten!r}")
        return rewritten
    except Exception as e:
        print(f"[REWRITE] failed, using original query: {e}")
        return query


async def decompose_query(query: str) -> list[str]:
    """Splits a compound query into independent sub-questions. Falls back to
    the original query unchanged if parsing fails or it's already atomic."""
    messages = [
        {"role": "system", "content": get_query_decomposition_prompt()},
        {"role": "user", "content": query}
    ]
    response = await ROUTER_MODEL.ainvoke(messages)
    try:
        sub_questions = json.loads(response.content)
        if isinstance(sub_questions, list) and sub_questions:
            return sub_questions
    except Exception:
        pass
    return [query]


async def _build_bm25_index(client, target_collection, filter_expr):
    """Fetch the filtered corpus once and build a BM25 index. Called once per turn."""
    def _run():
        results = client.query(
            collection_name=target_collection,
            filter=filter_expr if filter_expr else "",
            output_fields=["text", "source", "page_number"],
        )
        if not results:
            return None, []
        tokenized_corpus = [r["text"].lower().split() for r in results]
        bm25 = BM25Okapi(tokenized_corpus)
        return bm25, results

    return await asyncio.to_thread(_run)


def _bm25_score(bm25, corpus, sub_query: str, top_k: int = 15):
    """Score a single sub-question against an already-built index. Cheap, no I/O.
    Returns NEW dicts — never mutates the shared corpus list, since multiple
    sub-questions score against it concurrently."""
    if bm25 is None or not corpus:
        return []
    scores = bm25.get_scores(sub_query.lower().split())
    scored = [{**r, "bm25_score": float(s)} for r, s in zip(corpus, scores)]
    return sorted(scored, key=lambda r: r["bm25_score"], reverse=True)[:top_k]


def _reciprocal_rank_fusion(dense_results: list[dict], bm25_results: list[dict], k: int = 60) -> list[dict]:
    """Fuses two ranked lists using RRF. Keys chunks by (source, page_number, text)
    since Milvus dense results don't carry a stable 'id' field in your current schema."""
    def _key(r):
        return (r.get("source"), r.get("page_number"), r.get("text", "")[:100])

    scores = {}
    chunk_map = {}

    for rank, r in enumerate(dense_results):
        key = _key(r)
        scores[key] = scores.get(key, 0) + 1 / (k + rank + 1)
        chunk_map[key] = r

    for rank, r in enumerate(bm25_results):
        key = _key(r)
        scores[key] = scores.get(key, 0) + 1 / (k + rank + 1)
        chunk_map[key] = r

    return sorted(chunk_map.values(), key=lambda r: scores[_key(r)], reverse=True)

async def _search_one(client, target_collection, filter_expr, sub_query: str, bm25, bm25_corpus):
    """Hybrid search for a single sub-question: dense + BM25 (index reused), fused via RRF."""
    query_vector = await asyncio.to_thread(EMBEDDINGS.embed_query, sub_query)
    dense_results_raw = await asyncio.to_thread(
        client.search,
        collection_name=target_collection,
        data=[query_vector],
        limit=15,
        filter=filter_expr,
        output_fields=["text", "source", "page_number"]
    )
    dense_hits = dense_results_raw[0] if dense_results_raw and dense_results_raw[0] else []
    dense_flat = [hit["entity"] for hit in dense_hits]

    bm25_flat = await asyncio.to_thread(_bm25_score, bm25, bm25_corpus, sub_query)

    fused = _reciprocal_rank_fusion(dense_flat, bm25_flat)
    return [{"entity": r} for r in fused[:15]]

def _rerank(query: str, chunks: list[dict], top_k: int = 5) -> list[dict]:
    """chunks: list of {"text", "source", "page_number"}"""
    if not chunks:
        return chunks
    pairs = [(query, c["text"]) for c in chunks]
    scores = RERANKER.predict(pairs)
    for c, s in zip(chunks, scores):
        c["rerank_score"] = float(s)
    return sorted(chunks, key=lambda c: c["rerank_score"], reverse=True)[:top_k]

# ── MODIFIED: new `history` param + rewrite step added at the top ───────

async def run_rag_sub_agent(
    query: str,
    collection_name: str,
    user_id: str = None,
    document_id: str = None,
    history: list[dict] = None,   # NEW
) -> str:
    """RAG specialist with query decomposition: splits compound questions into
    sub-questions, retrieves for each independently, merges context, answers once."""
    client = get_milvus()
    if not client:
        return "I could not find relevant information about this in the uploaded document."

    working_query = query
    if history and _needs_rewrite(query):
        working_query = await _rewrite_query(query, history)

    if USE_SHARED_COLLECTION:
        if not user_id:
            return "I could not find relevant information about this in the uploaded document."
        target_collection = "rag_shared_collection"
        filter_expr = f'user_id == "{user_id}"'
        if document_id:
            filter_expr += f' and document_id == "{document_id}"'
    else:
        target_collection = collection_name
        filter_expr = None

    has_col = await asyncio.to_thread(client.has_collection, target_collection)
    if not has_col:
        return "I could not find relevant information about this in the uploaded document."

    # 1. Decompose the (possibly rewritten) query into sub-questions
    sub_questions = await decompose_query(working_query)

    # 1b. Build BM25 index ONCE for this turn, reused across all sub-questions
    bm25_index, bm25_corpus = await _build_bm25_index(client, target_collection, filter_expr)

    # 2. Retrieve independently for each sub-question, in parallel
    all_hits = await asyncio.gather(*[
        _search_one(client, target_collection, filter_expr, sq, bm25_index, bm25_corpus)
        for sq in sub_questions
    ])

    # 3. Merge + dedupe chunks across all sub-question retrievals
    seen_texts = set()
    deduped_chunks = []
    for hits in all_hits:
        for hit in hits:
            entity = hit["entity"]
            text = entity.get("text", "").strip()
            if not text or text in seen_texts:
                continue
            seen_texts.add(text)
            deduped_chunks.append({
                "text": text,
                "source": entity.get("source", "unknown.pdf"),
                "page_number": entity.get("page_number", 1),
            })

    if not deduped_chunks:
        return json.dumps({
            "answer": "I could not find relevant information about this in the uploaded document.",
            "citations": {}
        })

    # 3b. Rerank against the (possibly rewritten) query, keep top 5
    top_chunks = await asyncio.to_thread(_rerank, working_query, deduped_chunks, 5)
    print(f"[RERANK] {len(deduped_chunks)} candidates -> top {len(top_chunks)}, scores: {[round(c['rerank_score'], 2) for c in top_chunks]}")
    context_parts = []
    citation_chunks = {}
    for c in top_chunks:
        context_parts.append(f"[Source: {c['source']} | Page: {c['page_number']}]\n{c['text']}")
        key = f"{c['source']}:{c['page_number']}"
        citation_chunks.setdefault(key, []).append(c["text"])

    context_str = "\n\n---\n\n".join(context_parts)
    sub_q_list = "\n".join(f"- {sq}" for sq in sub_questions)

    # 4. Single final synthesis call, told to address every sub-question
    messages = [
        {"role": "system", "content": get_rag_agent_prompt()},
        {
            "role": "user",
            "content": (
                f"Context chunks (each labeled with source filename and page number):\n\n"
                f"{context_str}\n\n"
                f"Original user question: {query}\n\n"  
                f"This question contains the following sub-questions — answer EVERY one "
                f"of them, even if their supporting evidence comes from different pages "
                f"or sources:\n{sub_q_list}\n\n"
                f"Remember: cite every factual claim using [[cite:filename:page:\"verbatim evidence quote\"]] "
                f"exactly as shown in the source labels above."
            )
        }
    ]

    container = worker_prompt_var.get()
    if container is not None:
        formatted_prompt = "\n".join([f"[{msg['role'].upper()}]: {msg['content']}" for msg in messages])
        container.value = formatted_prompt

    response = await MODEL.ainvoke(messages)
    flat_citations = {k: " ... ".join(v) for k, v in citation_chunks.items()}
    return json.dumps({"answer": response.content, "citations": flat_citations})