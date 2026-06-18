import shutil
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from backend.config import UPLOAD_DIR, EMBEDDINGS
from backend.vector_store import get_milvus

router = APIRouter()

@router.post("/upload")
async def upload_pdf(
    file: UploadFile = File(...),
    user_id: str = Form(...)
):
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    file_path = f"{UPLOAD_DIR}/{user_id}_{file.filename}"
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    try:
        loader = PyPDFLoader(file_path)
        docs = loader.load()

        extracted_text = "".join(doc.page_content.strip() for doc in docs)
        if not extracted_text:
            raise HTTPException(status_code=400, detail="No extractable text found in PDF.")
        if len(extracted_text) < 50:
            raise HTTPException(status_code=400, detail="PDF contains insufficient text.")

        splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
        splits = splitter.split_documents(docs)
        collection_name = f"user_{user_id.replace('-', '_')}"
        client = get_milvus()

        if client.has_collection(collection_name):
            client.drop_collection(collection_name)

        client.create_collection(collection_name=collection_name, dimension=384)

        vectors = EMBEDDINGS.embed_documents([s.page_content for s in splits])
        data = [
            {
                "id": i,
                "vector": vectors[i],
                "text": splits[i].page_content,
                "source": splits[i].metadata.get("source", "unknown")
            }
            for i in range(len(splits))
        ]
        client.insert(collection_name=collection_name, data=data)
        return {"status": "success", "message": f"Indexed: {file.filename}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))