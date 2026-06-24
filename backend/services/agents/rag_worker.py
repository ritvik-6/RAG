from backend.config import EMBEDDINGS, MODEL
from backend.vector_store import get_milvus
from backend.prompts import get_rag_agent_prompt

def run_rag_sub_agent(query: str, collection_name: str) -> str:
    """Isolated RAG specialist agent runner."""
    client = get_milvus()
    if not client or not client.has_collection(collection_name):
        return "I could not find relevant information about this in the uploaded document."

    # Vector lookup
    query_vector = EMBEDDINGS.embed_query(query)
    results = client.search(
        collection_name=collection_name,
        data=[query_vector],
        limit=3,
        output_fields=["text", "source"]
    )
    
    if not results or not results[0]:
        return "I could not find relevant information about this in the uploaded document."

    # Feed retrieved data through the specialized prompt
    context_str = "\n\n".join(
        f"Content: {hit['entity']['text']}\nSource: {hit['entity']['source']}"
        for hit in results[0]
    )
    
    messages = [
        {"role": "system", "content": get_rag_agent_prompt()},
        {"role": "user", "content": f"Context:\n{context_str}\n\nUser Question: {query}"}
    ]
    
    response = MODEL.invoke(messages)
    return response.content