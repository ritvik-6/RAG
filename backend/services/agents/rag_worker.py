import asyncio
import json
from backend.config import EMBEDDINGS, MODEL, ROUTER_MODEL, USE_SHARED_COLLECTION
from backend.vector_store import get_milvus
from backend.prompts import get_rag_agent_prompt, get_query_decomposition_prompt
from backend.config import worker_prompt_var

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


async def run_rag_sub_agent(
    query: str,
    collection_name: str,
    user_id: str = None,
    document_id: str = None
) -> str:
    """RAG specialist with query decomposition: splits compound questions into
    sub-questions, retrieves for each independently, merges context, answers once."""
    client = get_milvus()
    if not client:
        return "I could not find relevant information about this in the uploaded document."

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

    # 1. Decompose the query into sub-questions
    sub_questions = await decompose_query(query)

    # 2. Retrieve independently for each sub-question, in parallel
    all_hits = await asyncio.gather(*[
        _search_one(client, target_collection, filter_expr, sq)
        for sq in sub_questions
    ])

    # 3. Merge + dedupe chunks across all sub-question retrievals
    seen_texts = set()
    context_parts = []
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

    if not context_parts:
        return "I could not find relevant information about this in the uploaded document."

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
                f"Remember: cite every factual claim using [[cite:filename:page]] "
                f"exactly as shown in the source labels above."
            )
        }
    ]

    
    container = worker_prompt_var.get()
    if container is not None:
        formatted_prompt = "\n".join([f"[{msg['role'].upper()}]: {msg['content']}" for msg in messages])
        container.value = formatted_prompt

    response = await MODEL.ainvoke(messages)
    return response.content