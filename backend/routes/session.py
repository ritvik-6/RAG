from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from backend.database import get_db

router = APIRouter()

class RenameSessionRequest(BaseModel):
    session_name: str = Field(..., max_length=255)

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

@router.patch("/session/{session_id}/rename")
async def rename_session(session_id: str, request: RenameSessionRequest):
    db = get_db()
    if not db:
        raise HTTPException(status_code=500, detail="Database pool unavailable.")

    session_name = request.session_name.strip()
    if not session_name:
        raise HTTPException(status_code=400, detail="Session name cannot be empty")
    if len(session_name) > 255:
        raise HTTPException(status_code=400, detail="Session name cannot exceed 255 characters")

    async with db.acquire() as conn:
        try:
            row = await conn.fetchrow(
                """
                UPDATE chat_sessions 
                SET session_name = $1 
                WHERE session_id = $2 
                RETURNING session_id, user_id, session_name, thread_id
                """,
                session_name, session_id
            )
            if not row:
                raise HTTPException(status_code=404, detail="Session not found")
            return {
                "session_id": str(row["session_id"]),
                "user_id": row["user_id"],
                "session_name": row["session_name"],
                "thread_id": str(row["thread_id"])
            }
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))