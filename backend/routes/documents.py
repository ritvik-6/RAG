import os
import asyncio
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from backend.database import get_db
from backend.vector_store import get_milvus
from backend.config import UPLOAD_DIR

router = APIRouter()


@router.get("/documents/{user_id}")
async def get_documents(user_id: str):
    pool = get_db()
    if not pool:
        raise HTTPException(status_code=500, detail="Relational database pool uninitialized.")

    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT document_id, filename, upload_time
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
            "upload_time": r["upload_time"].isoformat() if r["upload_time"] else None
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
        has_col = await asyncio.to_thread(client.has_collection, collection_name)
        if has_col:
            await asyncio.to_thread(
                client.delete,
                collection_name=collection_name,
                filter=f'source == "{filename}"'
            )
            # Force the delete to commit immediately. Without this, Milvus can leave
            # deleted vectors visible to subsequent searches for an indeterminate time,
            # causing "deleted" documents to keep leaking into RAG answers.
            await asyncio.to_thread(client.flush, collection_name=collection_name)

            # Consistency check: confirm the delete actually took effect.
            # Logs loudly instead of failing silently if vectors survive.
            remaining = await asyncio.to_thread(
                client.query,
                collection_name=collection_name,
                filter=f'source == "{filename}"',
                output_fields=["id"]
            )
            if remaining:
                print(
                    f"WARNING: {len(remaining)} vectors for '{filename}' "
                    f"survived delete+flush in {collection_name}"
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
    # Reject path traversal attempts and separators outright
    if "/" in filename or "\\" in filename or ".." in filename:
        raise HTTPException(status_code=400, detail="Invalid filename.")

    file_path = os.path.realpath(os.path.join(UPLOAD_DIR, filename))
    upload_root = os.path.realpath(UPLOAD_DIR)

    # Defense in depth: confirm resolved path is still inside UPLOAD_DIR
    if not file_path.startswith(upload_root + os.sep):
        raise HTTPException(status_code=400, detail="Invalid filename.")

    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found.")

    return FileResponse(file_path, media_type="application/pdf")