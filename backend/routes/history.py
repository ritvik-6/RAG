# backend/routes/history.py
from fastapi import APIRouter, HTTPException
from backend.database import get_db
from backend.vector_store import get_milvus # Import the getter function

router = APIRouter()

@router.get("/history/{user_id}")
async def get_user_sessions(user_id: str):
    pool = get_db()
    client = get_milvus() # Dynamically pull the active instance
    
    if not pool:
        raise HTTPException(status_code=500, detail="Database pool unavailable.")
    if not client:
        raise HTTPException(status_code=500, detail="Milvus client unavailable.")

    async with pool.acquire() as conn:
        sessions = await conn.fetch(
            "SELECT session_id FROM chat_sessions WHERE user_id = $1 ORDER BY created_at ASC",
            user_id
        )
        result = {}
        for s in sessions:
            sid = str(s["session_id"])
            messages = await conn.fetch(
                """
                SELECT sender, message_text 
                FROM chat_messages 
                WHERE session_id = $1 
                ORDER BY created_at ASC
                """,
                sid
            )
            result[sid] = [{"sender": r["sender"], "text": r["message_text"]} for r in messages]
            
        collection_name = f"user_{user_id.replace('-', '_')}"
        has_pdf = client.has_collection(collection_name)
        return {"sessions": result, "has_pdf": has_pdf}