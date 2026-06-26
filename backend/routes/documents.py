import os
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from backend.database import get_db
from backend.vector_store import get_milvus
from backend.config import UPLOAD_DIR

router = APIRouter()

# Update the query inside get_documents() inside backend/routes/documents.py:
@router.get("/documents/{user_id}")
async def get_documents(user_id: str):
    pool = get_db()
    if not pool:
        raise HTTPException(status_code=500, detail="Relational database pool uninitialized.")
        
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT document_id, filename, timezone('Asia/Kolkata', upload_time) AS upload_time
            FROM documents
            WHERE user_id = $1
            ORDER BY upload_time DESC
            """,
            user_id
        )

    return [
        {
            "document_id": str(r["document_id"]),
            "filename": r["filename"],
            "upload_time": r["upload_time"].strftime("%Y-%m-%d %H:%M:%S") if r["upload_time"] else None
        }
        for r in rows
    ]

@router.delete("/documents/{document_id}")
async def delete_document(document_id: str):
    pool = get_db()
    client = get_milvus()
    
    if not pool or not client:
        raise HTTPException(status_code=500, detail="Database singletons are uninitialized.")

    async with pool.acquire() as conn:
        # 1. Fetch document attributes before deleting the row
        doc_record = await conn.fetchrow(
            "SELECT user_id, filename FROM documents WHERE document_id = $1",
            document_id
        )
        
        if not doc_record:
            raise HTTPException(status_code=404, detail="Document entry not found in tracking catalog.")

        user_id = doc_record["user_id"]
        filename = doc_record["filename"]
        collection_name = f"user_{user_id.replace('-', '_')}"

        # 2. Delete vectors matching this specific file out of Milvus using text expressions
        if client.has_collection(collection_name):
            # Using an expression to filter out rows containing the exact filename match
            client.delete(
                collection_name=collection_name,
                filter=f'source == "{filename}"'
            )

        # 3. Drop relational ledger record out of PostgreSQL
        await conn.execute("DELETE FROM documents WHERE document_id = $1", document_id)

    # 4. Safely purge physical file layout binary components off disk storage layers
    file_path = os.path.join(UPLOAD_DIR, f"{user_id}_{filename}")
    if os.path.exists(file_path):
        os.remove(file_path)

    return {"status": "success", "message": f"Successfully dropped document asset: {filename}"}


@router.get("/files/{filename}")
async def serve_document(filename: str):
    file_path = os.path.join(UPLOAD_DIR, filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found.")
    return FileResponse(file_path, media_type="application/pdf")