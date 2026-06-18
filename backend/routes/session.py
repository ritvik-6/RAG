from fastapi import APIRouter, HTTPException
from backend.database import get_db

router = APIRouter()

@router.delete("/session/{session_id}")
async def delete_session(session_id: str):
    db = get_db()
    if not db:
        raise HTTPException(status_code=500, detail="Database pool unavailable.")

    async with db.acquire() as conn:
        try:
            await conn.execute("DELETE FROM chat_messages WHERE session_id = $1", session_id)
            await conn.execute("DELETE FROM chat_sessions WHERE session_id = $1", session_id)
            return {"status": "success", "message": "Session deleted."}
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))