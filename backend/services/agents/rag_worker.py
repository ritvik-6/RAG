import asyncio
from backend.config import EMBEDDINGS, MODEL, USE_SHARED_COLLECTION
from backend.vector_store import get_milvus
from backend.prompts import get_rag_agent_prompt


async def run_rag_sub_agent(
    query: str,
    collection_name: str,
    user_id: str = None,
    document_id: str = None
) -> str:
    """Isolated RAG specialist: retrieves chunks with page numbers and returns cited answer."""
    client = get_milvus()
    if not client:
        return "I could not find relevant information about this in the uploaded document."

    # 1. Determine target collection name and filter expression based on USE_SHARED_COLLECTION toggle
    if USE_SHARED_COLLECTION:
        if not user_id:
            return "I could not find relevant information about this in the uploaded document."
        target_collection = "rag_shared_collection"
        # Security critical: Always scope search queries to the user's ID.
        filter_expr = f'user_id == "{user_id}"'
        if document_id:
            filter_expr += f' and document_id == "{document_id}"'
    else:
        target_collection = collection_name
        filter_expr = None

    has_col = await asyncio.to_thread(client.has_collection, target_collection)
    if not has_col:
        return "I could not find relevant information about this in the uploaded document."

    query_vector = await asyncio.to_thread(EMBEDDINGS.embed_query, query)

    results = await asyncio.to_thread(
        client.search,
        collection_name=target_collection,
        data=[query_vector],
        limit=5,
        filter=filter_expr,
        output_fields=["text", "source", "page_number"]
    )

    if not results or not results[0]:
        return "I could not find relevant information about this in the uploaded document."

    # 2. Extract and deduplicate context chunks by exact text content
    seen_texts = set()
    context_parts = []
    for hit in results[0]:
        entity = hit["entity"]
        text = entity.get("text", "").strip()
        if not text or text in seen_texts:
            continue
        seen_texts.add(text)

        source = entity.get("source", "unknown.pdf")
        page = entity.get("page_number", 1)
        context_parts.append(
            f"[Source: {source} | Page: {page}]\n{text}"
        )

    context_str = "\n\n---\n\n".join(context_parts)

    messages = [
        {"role": "system", "content": get_rag_agent_prompt()},
        {
            "role": "user",
            "content": (
                f"Context chunks (each labeled with source filename and page number):\n\n"
                f"{context_str}\n\n"
                f"User Question: {query}\n\n"
                f"Remember: cite every factual claim using [[cite:filename:page]] "
                f"exactly as shown in the source labels above."
            )
        }
    ]

    # Format and store the final prompt in the context variable container
    from backend.config import worker_prompt_var
    container = worker_prompt_var.get()
    if container is not None:
        formatted_prompt = "\n".join([f"[{msg['role'].upper()}]: {msg['content']}" for msg in messages])
        container.value = formatted_prompt

    response =await MODEL.ainvoke(messages)
    return response.content