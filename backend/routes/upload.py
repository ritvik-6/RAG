import os
import shutil
import uuid
import json
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter

from backend.config import EMBEDDINGS, UPLOAD_DIR
from backend.database import get_db
from backend.vector_store import get_milvus

router = APIRouter()

@router.post("/upload")
async def upload_pdf(
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

    file_path = os.path.join(UPLOAD_DIR, f"{user_id}_{file.filename}")
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    try:
        loader = PyPDFLoader(file_path)
        docs = loader.load()

        if not docs or not isinstance(docs, list):
            raise HTTPException(status_code=400, detail="Failed to parse PDF. File may be corrupt.")

        page_count = len(docs)
        extracted_text = "".join(doc.page_content.strip() for doc in docs)

        if not extracted_text or len(extracted_text) < 50:
            raise HTTPException(status_code=400, detail="PDF contains insufficient text content.")

        splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
        splits = splitter.split_documents(docs)

        collection_name = f"user_{user_id.replace('-', '_')}"

        if not client.has_collection(collection_name):
            client.create_collection(
                collection_name=collection_name,
                dimension=384,
                id_type="string",
                max_length=64
            )

        vectors = EMBEDDINGS.embed_documents([s.page_content for s in splits])

        data = []
        for i, split in enumerate(splits):
            # PyPDFLoader stores the 0-based page index in metadata["page"]
            # We store it as 1-based so citations show human-readable page numbers
            raw_page = split.metadata.get("page", 0)
            page_number = int(raw_page) + 1

            data.append({
                "id": str(uuid.uuid4()),
                "vector": vectors[i],
                "text": split.page_content,
                "source": file.filename,      # e.g. "report.pdf"
                "page_number": page_number    # e.g. 1, 2, 3 ...
            })

        client.insert(collection_name=collection_name, data=data)

        document_uuid = str(uuid.uuid4())
        metadata_payload = json.dumps({
            "file_size_bytes": os.path.getsize(file_path),
            "vector_engine_wrapper": "MilvusClient"
        })

        async with pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO documents (document_id, user_id, filename, page_count, metadata)
                VALUES ($1, $2, $3, $4, $5::jsonb);
                """,
                document_uuid, user_id, file.filename, page_count, metadata_payload
            )

        return {"status": "success", "message": f"Successfully cataloged: {file.filename}"}

    except Exception as e:
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(status_code=500, detail=str(e))