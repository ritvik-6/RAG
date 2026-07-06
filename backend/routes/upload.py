import os
import shutil
import asyncio
import uuid
import json
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, BackgroundTasks
from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter

from backend.config import EMBEDDINGS, UPLOAD_DIR, USE_SHARED_COLLECTION
from backend.database import get_db
from backend.vector_store import get_milvus

router = APIRouter()


async def process_pdf_upload_task(document_id: str, file_path: str, filename: str, user_id: str):
    pool = get_db()
    client = get_milvus()
    if not pool or not client:
        return

    async def update_status(status: str, metadata_updates: dict = None):
        async with pool.acquire() as conn:
            if metadata_updates:
                await conn.execute(
                    """
                    UPDATE documents 
                    SET status = $1, 
                        metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb
                    WHERE document_id = $3
                    """,
                    status, json.dumps(metadata_updates), document_id
                )
            else:
                await conn.execute(
                    "UPDATE documents SET status = $1 WHERE document_id = $2",
                    status, document_id
                )

    try:
        # 1. Parsing Phase
        await update_status("parsing")
        loader = PyPDFLoader(file_path)
        docs = await asyncio.to_thread(loader.load)

        if not docs or not isinstance(docs, list):
            raise ValueError("Failed to parse PDF. File may be corrupt.")

        page_count = len(docs)
        extracted_text = "".join(doc.page_content.strip() for doc in docs)

        if not extracted_text or len(extracted_text) < 50:
            raise ValueError("PDF contains insufficient text content.")

        # 2. Text Splitting
        splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
        splits = await asyncio.to_thread(splitter.split_documents, docs)

        # 3. Embedding Generation (batched in size 128)
        await update_status("embedding")
        batch_size = 128
        vectors = []
        for i in range(0, len(splits), batch_size):
            batch = [s.page_content for s in splits[i:i + batch_size]]
            batch_vectors = await asyncio.to_thread(EMBEDDINGS.embed_documents, batch)
            vectors.extend(batch_vectors)

        # 4. Vector DB Indexing
        await update_status("indexing")

        if USE_SHARED_COLLECTION:
            collection_name = "rag_shared_collection"
        else:
            collection_name = f"user_{user_id.replace('-', '_')}"

        # Ensure collection exists
        has_col = await asyncio.to_thread(client.has_collection, collection_name)
        if not has_col:
            if USE_SHARED_COLLECTION:
                await asyncio.to_thread(
                    client.create_collection,
                    collection_name=collection_name,
                    dimension=384,
                    id_type="string",
                    max_length=256
                )
            else:
                await asyncio.to_thread(
                    client.create_collection,
                    collection_name=collection_name,
                    dimension=384,
                    id_type="string",
                    max_length=64
                )

        data = []
        for i, split in enumerate(splits):
            raw_page = split.metadata.get("page", 0)
            page_number = int(raw_page) + 1

            item = {
                "id": str(uuid.uuid4()),
                "vector": vectors[i],
                "text": split.page_content,
                "source": filename,
                "page_number": page_number
            }
            if USE_SHARED_COLLECTION:
                item["user_id"] = user_id
                item["document_id"] = document_id

            data.append(item)

        await asyncio.to_thread(client.insert, collection_name=collection_name, data=data)

        # 5. Mark Complete
        file_size = os.path.getsize(file_path)
        async with pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE documents 
                SET status = 'complete', 
                    page_count = $1,
                    metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb
                WHERE document_id = $3
                """,
                page_count,
                json.dumps({
                    "file_size_bytes": file_size,
                    "vector_engine_wrapper": "MilvusClient"
                }),
                document_id
            )

    except Exception as e:
        error_msg = str(e)
        print(f"Error processing document {document_id}: {error_msg}")

        # Cleanup physical file on failure
        if os.path.exists(file_path):
            try:
                os.remove(file_path)
            except Exception:
                pass

        # Cleanup Milvus vectors on failure to prevent orphaned index entries
        try:
            if USE_SHARED_COLLECTION:
                await asyncio.to_thread(
                    client.delete,
                    collection_name="rag_shared_collection",
                    filter=f'document_id == "{document_id}"'
                )
            else:
                collection_name = f"user_{user_id.replace('-', '_')}"
                if await asyncio.to_thread(client.has_collection, collection_name):
                    await asyncio.to_thread(
                        client.delete,
                        collection_name=collection_name,
                        filter=f'source == "{filename}"'
                    )
        except Exception as milvus_err:
            print(f"Failed to cleanup partial Milvus vectors: {milvus_err}")

        # Log failure status & stack description
        await update_status("failed", {"error_message": error_msg})


@router.post("/upload")
async def upload_pdf(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    user_id: str = Form(...)
):
    pool = get_db()
    client = get_milvus()

    if not pool:
        raise HTTPException(status_code=500, detail="Database connection pool is uninitialized.")
    if not client:
        raise HTTPException(status_code=500, detail="Milvus client is uninitialized.")
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    document_uuid = str(uuid.uuid4())
    file_path = os.path.join(UPLOAD_DIR, f"{user_id}_{file.filename}")
    contents = await file.read()
    await asyncio.to_thread(lambda: open(file_path, "wb").write(contents))

    # Pre-register document row in the SQL tracking ledger with status='pending'
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO documents (document_id, user_id, filename, page_count, status, metadata)
            VALUES ($1, $2, $3, 0, 'pending', $4::jsonb);
            """,
            document_uuid, user_id, file.filename, json.dumps({"file_size_bytes": len(contents)})
        )

    # Dispatch CPU-intensive parsing and embedding steps to background tasks
    background_tasks.add_task(
        process_pdf_upload_task,
        document_uuid,
        file_path,
        file.filename,
        user_id
    )

    return {"document_id": document_uuid, "status": "pending"}


@router.get("/documents/{document_id}/status")
async def get_document_status(document_id: str):
    pool = get_db()
    if not pool:
        raise HTTPException(status_code=500, detail="Database pool is offline.")

    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT status, metadata FROM documents WHERE document_id = $1",
            document_id
        )

    if not row:
        raise HTTPException(status_code=404, detail="Document not found.")

    status = row["status"]
    meta = row["metadata"]
    if isinstance(meta, str):
        try:
            meta = json.loads(meta)
        except Exception:
            meta = {}
    elif not isinstance(meta, dict):
        meta = {}

    error_message = meta.get("error_message") if meta else None

    return {
        "document_id": document_id,
        "status": status,
        "error_message": error_message
    }