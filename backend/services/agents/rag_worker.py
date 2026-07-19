import asyncio
import json
import re
from backend.config import EMBEDDINGS, MODEL, ROUTER_MODEL, USE_SHARED_COLLECTION, RERANKER
from backend.vector_store import get_milvus
from backend.prompts import get_rag_agent_prompt, get_query_decomposition_prompt
from backend.config import worker_prompt_var, status_emitter_var
from rank_bm25 import BM25Okapi

async def _emit_stage(stage: str, **kwargs):
    cb = status_emitter_var.get(None)
    if cb:
        await cb(stage, **kwargs)


# ── history-aware query rewrite ─────────────────────────────────────────

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

RETRIEVAL_REWRITE_PROMPT = """
You are a retrieval query reformulation assistant for a Retrieval-Augmented Generation (RAG) system.

Your ONLY job is to improve retrieval from the user's uploaded document.

Rules:
- Preserve the user's original intent.
- Rewrite only if it makes the query easier to match against the document.
- Expand abbreviations only when they are obvious from the query.
- Clarify vague wording only using the user's own words.
- Resolve simple wording issues such as singular/plural or grammatical variations.
- Do NOT answer the question.
- Do NOT add outside knowledge.
- Do NOT guess what the user meant.
- Do NOT replace names with famous people.
- Do NOT expand partial names using world knowledge.
- Do NOT introduce entities that were not mentioned by the user.
- If the query cannot be safely improved, return it EXACTLY unchanged.

Output ONLY the rewritten query.
"""

_FOLLOWUP_SIGNAL = re.compile(
    r'^(and|also|what about|more on|further)\b|\b(it|that|this|those|these|he|she|they|the (above|previous|same))\b',
    re.IGNORECASE
)


def _needs_rewrite(query: str) -> bool:
    """Only rewrite when the query actually references prior context."""
    return bool(_FOLLOWUP_SIGNAL.search(query))


async def _rewrite_for_retrieval(query: str) -> str:
    try:
        res = await ROUTER_MODEL.ainvoke([
            {"role": "system", "content": RETRIEVAL_REWRITE_PROMPT},
            {"role": "user", "content": query},
        ])
        rewritten = res.content.strip()
        print(f"[RETRIEVAL REWRITE] {query!r} -> {rewritten!r}")
        return rewritten
    except Exception:
        return query


async def _rewrite_from_history(query: str, history: list[dict]) -> str:
    history_text = "\n".join(f"{h['role']}: {h['content']}" for h in history)
    try:
        rewrite_res = await ROUTER_MODEL.ainvoke([
            {"role": "system", "content": REWRITE_PROMPT.format(history_text=history_text, query=query)}
        ])
        rewritten = rewrite_res.content.strip()
        for prefix in ("Standalone question:", "Rewritten question:", "Standalone:"):
            if rewritten.lower().startswith(prefix.lower()):
                rewritten = rewritten[len(prefix):].strip()
        print(f"[REWRITE] {query!r} -> {rewritten!r}")
        return rewritten
    except Exception as e:
        print(f"[REWRITE] failed, using original query: {e}")
        return query


_MULTI_Q_SIGNAL = re.compile(
    r'\?.+\?|'
    r'\b(and|also|along with|as well as)\b.*\b(explain|what|describe|tell|define|compare|list)\b|'
    r'\b(compare|difference between)\b',
    re.IGNORECASE,
)


def _needs_decomposition(query: str) -> bool:
    return bool(_MULTI_Q_SIGNAL.search(query))


async def decompose_query(query: str) -> list[str]:
    """Splits a compound query into independent sub-questions. Falls back to
    the original query unchanged if parsing fails or it's already atomic."""
    messages = [
        {"role": "system", "content": get_query_decomposition_prompt()},
        {"role": "user", "content": query}
    ]
    try:
        response = await ROUTER_MODEL.ainvoke(messages)
        sub_questions = json.loads(response.content)
        if isinstance(sub_questions, list) and sub_questions:
            return sub_questions
    except Exception as e:
        print(f"[DECOMPOSE] failed, using original query: {e}")
    return [query]


# ── BM25 hybrid retrieval ────────────────────────────────────────────────

_bm25_cache = {}  # key: (user_id, document_id) -> (bm25, corpus)


async def _build_bm25_index(client, target_collection, filter_expr, cache_key=None):
    """Fetch the filtered corpus once and build a BM25 index. Cached per
    (user_id, document_id) so it's not rebuilt on every message."""
    if cache_key is not None and cache_key in _bm25_cache:
        return _bm25_cache[cache_key]

    def _run():
        results = client.query(
            collection_name=target_collection,
            filter=filter_expr if filter_expr else "",
            output_fields=["text", "source", "page_number"],
            limit=500,
        )
        if not results:
            return None, []
        tokenized_corpus = [r["text"].lower().split() for r in results]
        bm25 = BM25Okapi(tokenized_corpus)
        return bm25, results

    result = await asyncio.to_thread(_run)
    if cache_key is not None:
        _bm25_cache[cache_key] = result
    return result


def _bm25_score(bm25, corpus, sub_query: str, top_k: int = 15):
    """Score a single sub-question against an already-built index."""
    if bm25 is None or not corpus:
        return []
    scores = bm25.get_scores(sub_query.lower().split())
    scored = [{**r, "bm25_score": float(s)} for r, s in zip(corpus, scores)]
    return sorted(scored, key=lambda r: r["bm25_score"], reverse=True)[:top_k]


def _reciprocal_rank_fusion(dense_results: list[dict], bm25_results: list[dict], k: int = 60) -> list[dict]:
    """Fuses two ranked lists using RRF."""
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


async def _rerank_per_subquestion(sub_questions: list[str], deduped_chunks: list[dict], per_q_k: int = 5) -> list[dict]:
    """Reranks the shared candidate pool once per sub-question so each topic
    gets scored against its own wording, then merges + dedupes the results."""
    results = await asyncio.gather(*[
        asyncio.to_thread(_rerank, sq, deduped_chunks, per_q_k)
        for sq in sub_questions
    ])
    seen = set()
    merged = []
    for chunk_list in results:
        for c in chunk_list:
            key = (c["source"], c["page_number"], c["text"][:100])
            if key in seen:
                continue
            seen.add(key)
            merged.append(c)
    return merged


# ── "no result" handling ─────────────────────────────────────────────────

_NO_RESULT_MSG = "I could not find relevant information about this in the uploaded document."


def _no_result(msg: str = _NO_RESULT_MSG) -> str:
    return json.dumps({"answer": msg, "citations": {}})


# Detects whether the LLM's synthesized answer is effectively a "not found" response.
# This is the decision point in the diagram: "Did LLM say 'I couldn't find...'?"
_NO_RESULT_SIGNAL = re.compile(
    r"\b(could not find|couldn't find|cannot find|can't find|"
    r"no relevant information|not (?:mentioned|found|available) in (?:the )?"
    r"(?:document|uploaded document|provided context))\b",
    re.IGNORECASE,
)


def _looks_like_no_result(answer_text: str) -> bool:
    return bool(_NO_RESULT_SIGNAL.search(answer_text or ""))


# ── retrieve + rerank (one pass) ─────────────────────────────────────────

async def _retrieve_and_rerank(client, target_collection, filter_expr, query, bm25_index, bm25_corpus):
    """Decompose (if needed) -> hybrid retrieve per sub-question -> dedupe -> rerank.
    Returns (sub_questions, top_chunks). top_chunks == [] means nothing was found."""
    if _needs_decomposition(query):
        await _emit_stage("query_decomposition")
        sub_questions = await decompose_query(query)
        if len(sub_questions) > 1:
            # Emit sequentially for each sub-question
            for idx, sq in enumerate(sub_questions):
                await _emit_stage("multi_part_progress", n=idx + 1, total=len(sub_questions))
                await _emit_stage("sub_question_search", query=sq)
    else:
        sub_questions = [query]

    all_hits = await asyncio.gather(*[
        _search_one(client, target_collection, filter_expr, sq, bm25_index, bm25_corpus)
        for sq in sub_questions
    ])

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
        return sub_questions, []

    top_chunks = await _rerank_per_subquestion(sub_questions, deduped_chunks, per_q_k=5)
    return sub_questions, top_chunks


# ── LLM synthesis (one pass) ─────────────────────────────────────────────

async def _synthesize_answer(query: str, sub_questions: list[str], top_chunks: list[dict]) -> tuple[str, dict]:
    """Builds context from top_chunks, calls MODEL, returns (answer_text, flat_citations)."""
    context_parts = []
    citation_chunks = {}
    for c in top_chunks:
        context_parts.append(f"[Source: {c['source']} | Page: {c['page_number']}]\n{c['text']}")
        key = f"{c['source']}:{c['page_number']}"
        citation_chunks.setdefault(key, []).append(c["text"])

    context_str = "\n\n---\n\n".join(context_parts)
    sub_q_list = "\n".join(f"- {sq}" for sq in sub_questions)

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
    return response.content, flat_citations


# ── main entry point ─────────────────────────────────────────────────────

async def run_rag_sub_agent(
    query: str,
    collection_name: str,
    user_id: str = None,
    document_id: str = None,
    history: list[dict] = None,
) -> str:
    """
    Flow (matches diagram):
      Retrieve -> Rerank -> LLM Answer -> did LLM say "I couldn't find..."?
        No  -> return answer
        Yes -> Rewrite Query -> Retrieve Again -> Rerank Again -> LLM Again -> return answer
    """
    client = get_milvus()
    if not client:
        return _no_result()

    if USE_SHARED_COLLECTION:
        if not user_id:
            return _no_result()
        target_collection = "rag_shared_collection"

        def _escape(v: str) -> str:
            return v.replace('"', '\\"')

        filter_expr = f'user_id == "{_escape(user_id)}"'
        if document_id:
            filter_expr += f' and document_id == "{_escape(document_id)}"'
    else:
        target_collection = collection_name
        filter_expr = None

    has_col = await asyncio.to_thread(client.has_collection, target_collection)
    if not has_col:
        return _no_result()

    cache_key = (user_id, document_id)
    bm25_index, bm25_corpus = await _build_bm25_index(client, target_collection, filter_expr, cache_key)

    # ── 1st pass: Retrieve -> Rerank -> LLM Answer ──
    await _emit_stage("sub_question_search", query=query)

    sub_questions, top_chunks = await _retrieve_and_rerank(
        client, target_collection, filter_expr, query, bm25_index, bm25_corpus
    )

    if not top_chunks:
        answer_text, flat_citations = _NO_RESULT_MSG, {}
    else:
        answer_text, flat_citations = await _synthesize_answer(query, sub_questions, top_chunks)

    # ── Decision point: did LLM say "I couldn't find..."? ──
    if not _looks_like_no_result(answer_text):
        return json.dumps({"answer": answer_text, "citations": flat_citations})

    # ── Retry path: Rewrite Query -> Retrieve Again -> Rerank Again -> LLM Again ──
    await _emit_stage("query_rewrite")
    if history and _needs_rewrite(query):
        retry_query = await _rewrite_from_history(query, history)
    else:
        retry_query = await _rewrite_for_retrieval(query)

    if retry_query == query:
        # Rewrite produced nothing new — retrying would just repeat the same search.
        return json.dumps({"answer": answer_text, "citations": flat_citations})

    print(f"[RETRY] LLM reported no result -> retrying with rewritten query: {retry_query!r}")

    await _emit_stage("sub_question_search", query=retry_query)

    retry_sub_questions, retry_top_chunks = await _retrieve_and_rerank(
        client, target_collection, filter_expr, retry_query, bm25_index, bm25_corpus
    )

    if not retry_top_chunks:
        return _no_result()

    retry_answer_text, retry_citations = await _synthesize_answer(
        retry_query, retry_sub_questions, retry_top_chunks
    )

    return json.dumps({"answer": retry_answer_text, "citations": retry_citations})