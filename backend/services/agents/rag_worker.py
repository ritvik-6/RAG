from backend.config import EMBEDDINGS, MODEL
from backend.vector_store import get_milvus
from backend.prompts import get_rag_agent_prompt


def run_rag_sub_agent(query: str, collection_name: str) -> str:
    """Isolated RAG specialist: retrieves chunks with page numbers and returns cited answer."""
    client = get_milvus()
    if not client or not client.has_collection(collection_name):
        return "I could not find relevant information about this in the uploaded document."

    query_vector = EMBEDDINGS.embed_query(query)

    results = client.search(
        collection_name=collection_name,
        data=[query_vector],
        limit=5,
        output_fields=["text", "source", "page_number"]  # page_number now fetched
    )

    if not results or not results[0]:
        return "I could not find relevant information about this in the uploaded document."

    # Build context string with filename and page so the RAG agent
    # can emit [[cite:filename:page]] markers accurately
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

    response = MODEL.invoke(messages)
    return response.content