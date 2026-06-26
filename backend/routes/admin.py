from fastapi import APIRouter, HTTPException
from backend.vector_store import drop_user_collection

router = APIRouter()

@router.delete("/admin/reset-collection/{user_id}")
async def reset_user_collection(user_id: str):
    """
    Drops the user's Milvus vector collection so it gets recreated
    with the new schema (including page_number) on next upload.

    Call this ONCE after deploying the upload.py schema change,
    then re-upload your PDFs.
    """
    success = drop_user_collection(user_id)
    if not success:
        raise HTTPException(status_code=500, detail="Milvus client not available.")
    return {"status": "ok", "message": f"Collection for user '{user_id}' dropped. Re-upload your PDFs."}