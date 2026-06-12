import os
import shutil
import asyncpg
from contextlib import asynccontextmanager
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from langchain_groq import ChatGroq
from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_core.vectorstores import InMemoryVectorStore
from langchain_core.tools import tool
from langchain_groq import ChatGroq
from langchain.agents import create_agent

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL environment variable is missing from your .env profile.")

MODEL = ChatGroq(model="qwen/qwen3-32b", reasoning_format="parsed")
EMBEDDINGS = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")

db_pool = None
USER_VECTOR_STORES = {}

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "documents")
os.makedirs(UPLOAD_DIR, exist_ok=True)


async def rebuild_vector_stores():
    """On startup, re-index any PDFs saved to disk so memory survives restarts."""
    for filename in os.listdir(UPLOAD_DIR):
        if filename.endswith(".pdf"):
            user_id = filename.split("_")[0]
            file_path = os.path.join(UPLOAD_DIR, filename)
            try:
                loader = PyPDFLoader(file_path)
                docs = loader.load()
                splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
                splits = splitter.split_documents(docs)
                USER_VECTOR_STORES[user_id] = InMemoryVectorStore.from_documents(splits, EMBEDDINGS)
                print(f"✅ Re-indexed PDF for user: {user_id}")
            except Exception as e:
                print(f"❌ Failed to re-index {filename}: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    global db_pool
    try:
        db_pool = await asyncpg.create_pool(DATABASE_URL, min_size=2, max_size=15)
        print("✅ PostgreSQL connection pool established.")
        await rebuild_vector_stores()
    except Exception as e:
        print(f"❌ Startup failure: {str(e)}")
        raise e
    yield
    if db_pool:
        await db_pool.close()
        print("🔒 PostgreSQL connection pool closed.")


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/upload")
async def upload_pdf(
    file: UploadFile = File(...),
    user_id: str = Form(...)
):
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    # Keep the file on disk so it can be re-indexed on restart
    file_path = os.path.join(UPLOAD_DIR, f"{user_id}_{file.filename}")
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    try:
        loader = PyPDFLoader(file_path)
        docs = loader.load()
        splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
        splits = splitter.split_documents(docs)
        USER_VECTOR_STORES[user_id] = InMemoryVectorStore.from_documents(splits, EMBEDDINGS)
        return {"status": "success", "message": f"Indexed: {file.filename}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/history/{user_id}")
async def get_user_sessions(user_id: str):
    """Returns all sessions and their messages for a given user on page load."""
    if not db_pool:
        raise HTTPException(status_code=500, detail="Database pool unavailable.")

    async with db_pool.acquire() as conn:
        sessions = await conn.fetch(
            "SELECT session_id FROM chat_sessions WHERE user_id = $1 ORDER BY created_at ASC",
            user_id
        )
        result = {}
        for s in sessions:
            sid = str(s["session_id"])
            messages = await conn.fetch(
                """
                SELECT sender, message_text 
                FROM chat_messages 
                WHERE session_id = $1 
                ORDER BY created_at ASC
                """,
                sid
            )
            result[sid] = [{"sender": r["sender"], "text": r["message_text"]} for r in messages]
        return {"sessions": result, "has_pdf": user_id in USER_VECTOR_STORES}


@app.post("/chat")
async def chat(
    message: str = Form(...),
    user_id: str = Form(...),
    session_id: str = Form(...)
):
    if user_id not in USER_VECTOR_STORES:
        raise HTTPException(status_code=400, detail="No document found. Please upload a PDF first.")

    if not db_pool:
        raise HTTPException(status_code=500, detail="Database pool unavailable.")

    async with db_pool.acquire() as conn:
        try:
            await conn.execute(
                "INSERT INTO chat_sessions (session_id, user_id) VALUES ($1, $2) ON CONFLICT (session_id) DO NOTHING",
                session_id, user_id
            )
            await conn.execute(
                "INSERT INTO chat_messages (session_id, sender, message_text) VALUES ($1, $2, $3)",
                session_id, "user", message
            )

            rows = await conn.fetch(
                "SELECT sender, message_text FROM chat_messages WHERE session_id = $1 ORDER BY created_at ASC",
                session_id
            )

            formatted_history = [
                {"role": "user" if r["sender"] == "user" else "assistant", "content": r["message_text"]}
                for r in rows
            ]

            @tool(response_format="content_and_artifact")
            def retrieve_context(query: str):
                """Retrieves relevant context from the uploaded PDF document."""
                store = USER_VECTOR_STORES[user_id]
                docs = store.similarity_search(query, k=3)
                serialized = "\n\n".join(
                    f"Content: {d.page_content}\nSource: {d.metadata.get('source', 'unknown')}"
                    for d in docs
                )
                return serialized, docs

            client_prompt = (
                "You are a document assistant. You ONLY answer questions using the context "
                "retrieved from the uploaded PDF document via your tool. "
                "If the retrieved context does not contain the answer, respond with: "
                "'I could not find relevant information about this in the uploaded document.' "
                "Do NOT use your own knowledge or training data under any circumstance. "
                "Treat retrieved context as the only source of truth."
            )

            agent = create_agent(MODEL, [retrieve_context], system_prompt=client_prompt)
            response = agent.invoke({"messages": formatted_history})
            ai_message = response["messages"][-1].content

            await conn.execute(
                "INSERT INTO chat_messages (session_id, sender, message_text) VALUES ($1, $2, $3)",
                session_id, "ai", ai_message
            )

            return {"response": ai_message}

        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

@app.delete("/session/{session_id}")
async def delete_session(session_id: str):
    if not db_pool:
        raise HTTPException(status_code=500, detail="Database pool unavailable.")
    
    async with db_pool.acquire() as conn:
        try:
            # Delete messages first (foreign key constraint)
            await conn.execute(
                "DELETE FROM chat_messages WHERE session_id = $1",
                session_id
            )
            # Then delete the session
            await conn.execute(
                "DELETE FROM chat_sessions WHERE session_id = $1",
                session_id
            )
            return {"status": "success", "message": "Session deleted."}
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
