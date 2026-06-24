from backend.database import get_db
from backend.prompts import get_catalog_agent_prompt
from backend.config import MODEL

async def run_catalog_sub_agent(user_id: str) -> str:
    """Isolated metadata ledger audit agent runner."""
    pool = get_db()
    async with pool.acquire() as conn:
        records = await conn.fetch(
            """
            SELECT filename, timezone('Asia/Kolkata', upload_time) AS upload_time_ist, page_count 
            FROM documents 
            WHERE user_id = $1 
            ORDER BY upload_time DESC
            """,
            user_id
        )
        
        if not records:
            return "No documents found in your active storage account database workspace catalog matrix."

        catalog_data = "\n".join([
            f"- File: {r['filename']} | Pages: {r['page_count']} | Uploaded (IST): {r['upload_time_ist']}"
            for r in records
        ])

        messages = [
            {"role": "system", "content": get_catalog_agent_prompt()},
            {"role": "user", "content": f"Raw relational records data:\n{catalog_data}"}
        ]
        
        response = MODEL.invoke(messages)
        return response.content