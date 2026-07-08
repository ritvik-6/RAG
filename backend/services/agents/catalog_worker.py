from backend.database import get_db
from backend.prompts import get_catalog_agent_prompt
from backend.config import MODEL

async def run_catalog_sub_agent(user_id: str) -> str:
    """Isolated metadata ledger audit agent runner."""
    pool = get_db()
    async with pool.acquire() as conn:
        records = await conn.fetch(
            """
            SELECT filename, upload_time, page_count 
            FROM documents 
            WHERE user_id = $1 AND status = 'complete'
            ORDER BY upload_time DESC
            """,
            user_id
        )
        
        if not records:
            return "You haven't uploaded any documents yet."

        catalog_data = "\n".join([
            f"- File: {r['filename']} | Pages: {r['page_count']} | Uploaded: {r['upload_time'].isoformat() if r['upload_time'] else 'unknown'}"
            for r in records
        ])

        messages = [
            {"role": "system", "content": get_catalog_agent_prompt()},
            {"role": "user", "content": f"Raw relational records data:\n{catalog_data}"}
        ]
        
        # Format and store the final prompt in the context variable container
        from backend.config import worker_prompt_var
        container = worker_prompt_var.get()
        if container is not None:
            formatted_prompt = "\n".join([f"[{msg['role'].upper()}]: {msg['content']}" for msg in messages])
            container.value = formatted_prompt

        response =await MODEL.ainvoke(messages)
        return response.content