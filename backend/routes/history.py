from fastapi import APIRouter, HTTPException
from backend.database import get_db

router = APIRouter()


@router.get("/history/{user_id}")
async def get_user_sessions(user_id: str):
    pool = get_db()

    if not pool:
        raise HTTPException(status_code=500, detail="Database pool unavailable.")

    async with pool.acquire() as conn:
        # Optimized query using LEFT JOIN to avoid N+1 queries
        # and joining thread_messages on message_id to retrieve latency_ms
        rows = await conn.fetch(
            """
            SELECT s.session_id, s.session_name, s.thread_id,
                   m.sender, m.message_text, m.created_at, m.citation_chunks, t.latency_ms
            FROM chat_sessions s
            LEFT JOIN chat_messages m ON s.session_id = m.session_id
            LEFT JOIN thread_messages t ON m.message_id = t.message_id
            WHERE s.user_id = $1
            ORDER BY s.created_at ASC, m.created_at ASC
            """,
            user_id
        )

        # Source of truth for "does this user have any documents" —
        # the same `documents` table that upload/delete endpoints maintain.
        # Replaces the old Milvus has_collection() check, which stayed True
        # even after all vectors for a user were deleted (collection existed,
        # just empty).
        doc_count = await conn.fetchval(
            "SELECT COUNT(*) FROM documents WHERE user_id = $1 AND status = 'complete'",
            user_id
        )

    result = {}
    session_meta = {}
    import json
    for r in rows:
        sid = str(r["session_id"])
        if sid not in result:
            result[sid] = []
            session_meta[sid] = {
                "session_name": r["session_name"],
                "thread_id": str(r["thread_id"]) if r["thread_id"] else None
            }
        if r["sender"] is not None:
            # Parse json / dict for citation_chunks
            cit_raw = r["citation_chunks"]
            cit_dict = {}
            if cit_raw:
                if isinstance(cit_raw, str):
                    try:
                        cit_dict = json.loads(cit_raw)
                    except Exception:
                        pass
                elif isinstance(cit_raw, dict):
                    cit_dict = cit_raw

            result[sid].append({
                "sender": r["sender"],
                "text": r["message_text"],
                "created_at": r["created_at"].isoformat() if r["created_at"] else None,
                "latency_ms": r["latency_ms"],
                "citation_chunks": cit_dict
            })

    return {
        "sessions": result,
        "session_meta": session_meta,
        "has_pdf": doc_count > 0
    }