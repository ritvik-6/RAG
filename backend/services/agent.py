# backend/services/agent.py
from langchain_core.tools import tool
from langchain.agents import create_agent

from backend.config import EMBEDDINGS, MODEL
from backend.database import get_db
from backend.vector_store import get_milvus
# Import your centralized prompt generator helper function
from backend.prompts import get_system_coordinator_prompt 

def get_user_agent(user_id: str, collection_name: str):
    """Factory function that initializes a request-scoped LangChain agent 
    with strictly isolated data boundaries for the specified user context."""

    @tool(response_format="content_and_artifact")
    def retrieve_context(query: str):
        """Retrieves factual text contexts from the active user's uploaded PDF document space."""
        active_client = get_milvus()
        if not active_client or not active_client.has_collection(collection_name):
            return "NO_ACTIVE_DOCUMENT_UPLOADED", []
            
        query_vector = EMBEDDINGS.embed_query(query)
        results = active_client.search(
            collection_name=collection_name,
            data=[query_vector],
            limit=3,
            output_fields=["text", "source"]
        )
        if not results or not results[0]:
            return "NO_RELEVANT_CONTEXT", []

        hits = results[0]
        serialized = "\n\n".join(
            f"Content: {hit['entity']['text']}\nSource: {hit['entity']['source']}"
            for hit in hits
        )
        return serialized, hits

    @tool
    async def query_user_document_catalog() -> str:
        """Useful strictly when asked meta-level administrative metrics or statistics about the active user's 
        own uploaded files, such as tracking counts, discovering filenames, or looking up upload times."""
        active_pool = get_db()
        async with active_pool.acquire() as conn:
            records = await conn.fetch(
                """
                SELECT document_id, filename, 
                       timezone('Asia/Kolkata', upload_time) AS upload_time_ist, 
                       page_count 
                FROM documents 
                WHERE user_id = $1
                ORDER BY upload_time DESC
                """,
                user_id
            )
            if not records:
                return "You have not uploaded any documents to this workspace yet."
            
            catalog_matrix = []
            for r in records:
                line = f"DocID: {r['document_id']} | File: {r['filename']} | Pages: {r['page_count']} | Uploaded (IST): {r['upload_time_ist']}"
                catalog_matrix.append(line)
            return "\n".join(catalog_matrix)

    # Clean execution pass: pulling layout strings directly out of prompts.py
    system_prompt = get_system_coordinator_prompt(user_id=user_id)
    tools = [retrieve_context, query_user_document_catalog]
    
    return create_agent(MODEL, tools, system_prompt=system_prompt)