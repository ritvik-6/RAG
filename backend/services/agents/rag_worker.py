import asyncio
from backend.config import EMBEDDINGS, MODEL
from backend.vector_store import get_milvus
from backend.prompts import get_rag_agent_prompt


async def run_rag_sub_agent(query: str, collection_name: str) -> str:
    """Isolated RAG specialist: retrieves chunks with page numbers and returns cited answer."""
    client = get_milvus()
    if not client:
        return "I could not find relevant information about this in the uploaded document."

    has_col = await asyncio.to_thread(client.has_collection, collection_name)
    if not has_col:
        return "I could not find relevant information about this in the uploaded document."

    query_vector = await asyncio.to_thread(EMBEDDINGS.embed_query, query)

    results = await asyncio.to_thread(
        client.search,
        collection_name=collection_name,
        data=[query_vector],
        limit=5,
        output_fields=["text", "source", "page_number"]
    )

    if not results or not results[0]:
        return "I could not find relevant information about this in the uploaded document."

    context_parts = []
    for hit in results[0]:
        entity = hit["entity"]
        text = entity.get("text", "").strip()
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

    response = MODEL.invoke(messages)
    return response.content