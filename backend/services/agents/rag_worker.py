import asyncio
import json
import re
from backend.config import EMBEDDINGS, MODEL, ROUTER_MODEL, USE_SHARED_COLLECTION
from backend.vector_store import get_milvus
from backend.prompts import get_rag_agent_prompt, get_query_decomposition_prompt
from backend.config import worker_prompt_var


# ── NEW: history-aware query rewrite ────────────────────────────────────

REWRITE_PROMPT = """Given this recent conversation and a follow-up question, rewrite the
follow-up as a standalone question containing all necessary context from the conversation.
If the follow-up is already standalone and doesn't rely on the conversation, return it
unchanged. Output ONLY the rewritten question. No preamble, no explanation, no markdown.

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
    """Best-effort rewrite. Falls back to the original query on any failure
    so a bad rewrite can never break retrieval outright."""
    history_text = "\n".join(f"{h['role']}: {h['content']}" for h in history)
    try:
        rewrite_res = await ROUTER_MODEL.ainvoke([
            {"role": "system", "content": REWRITE_PROMPT.format(history_text=history_text, query=query)}
        ])
        rewritten = rewrite_res.content.strip()
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


async def _search_one(client, target_collection, filter_expr, sub_query: str):
    """Dense search for a single sub-question."""
    query_vector = await asyncio.to_thread(EMBEDDINGS.embed_query, sub_query)
    results = await asyncio.to_thread(
        client.search,
        collection_name=target_collection,
        data=[query_vector],
        limit=5,
        filter=filter_expr,
        output_fields=["text", "source", "page_number"]
    )
    return results[0] if results and results[0] else []


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

    # 2. Retrieve independently for each sub-question, in parallel
    all_hits = await asyncio.gather(*[
        _search_one(client, target_collection, filter_expr, sq)
        for sq in sub_questions
    ])

    # 3. Merge + dedupe chunks across all sub-question retrievals
    seen_texts = set()
    context_parts = []
    citation_chunks = {}
    for hits in all_hits:
        for hit in hits:
            entity = hit["entity"]
            text = entity.get("text", "").strip()
            if not text or text in seen_texts:
                continue
            seen_texts.add(text)
            source = entity.get("source", "unknown.pdf")
            page = entity.get("page_number", 1)
            context_parts.append(f"[Source: {source} | Page: {page}]\n{text}")
            key = f"{source}:{page}"
            citation_chunks.setdefault(key, []).append(text)

    if not context_parts:
        return json.dumps({
            "answer": "I could not find relevant information about this in the uploaded document.",
            "citations": {}
        })

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