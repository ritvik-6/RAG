# backend/routes/history.py
from fastapi import APIRouter, HTTPException
import asyncio
from backend.database import get_db
from backend.vector_store import get_milvus

router = APIRouter()

@router.get("/history/{user_id}")
async def get_user_sessions(user_id: str):
    pool = get_db()
    client = get_milvus()
    
    if not pool:
        raise HTTPException(status_code=500, detail="Database pool unavailable.")
    if not client:
        raise HTTPException(status_code=500, detail="Milvus client unavailable.")

    async with pool.acquire() as conn:
        # Optimized query using LEFT JOIN to avoid N+1 queries
        # and joining thread_messages on message_id to retrieve latency_ms
        rows = await conn.fetch(
            """
            SELECT s.session_id, s.session_name, s.thread_id, 
                   m.sender, m.message_text, m.created_at, t.latency_ms
            FROM chat_sessions s
            LEFT JOIN chat_messages m ON s.session_id = m.session_id
            LEFT JOIN thread_messages t ON m.message_id = t.message_id
            WHERE s.user_id = $1
            ORDER BY s.created_at ASC, m.created_at ASC
            """,
            user_id
        )

    result = {}
    session_meta = {}
    for r in rows:
        sid = str(r["session_id"])
        if sid not in result:
            result[sid] = []
            session_meta[sid] = {
                "session_name": r["session_name"],
                "thread_id": str(r["thread_id"]) if r["thread_id"] else None
            }
        if r["sender"] is not None:
            result[sid].append({
                "sender": r["sender"],
                "text": r["message_text"],
                "created_at": r["created_at"].isoformat() if r["created_at"] else None,
                "latency_ms": r["latency_ms"]
            })

    collection_name = f"user_{user_id.replace('-', '_')}"
    has_pdf = await asyncio.to_thread(client.has_collection, collection_name)
    
    return {"sessions": result, "session_meta": session_meta, "has_pdf": has_pdf}
