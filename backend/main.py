import os
from contextlib import asynccontextmanager
from fastapi import FastAPI,HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from backend.database import init_db, close_db, get_db
from backend.vector_store import init_milvus
from backend.routes import upload, chat, documents, history, session
from backend.routes import admin

DOCUMENTS_DIR = os.path.join(os.path.dirname(__file__), "documents")
os.makedirs(DOCUMENTS_DIR, exist_ok=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        await init_db()
        init_milvus()

        # Startup recovery: fail any documents stuck in non-terminal processing states due to a server restart
        pool = get_db()
        if pool:
            async with pool.acquire() as conn:
                await conn.execute(
                    """
                    UPDATE documents 
                    SET status = 'failed', 
                        metadata = jsonb_set(
                            COALESCE(metadata, '{}'::jsonb), 
                            '{error_message}', 
                            '"Processing interrupted by server restart."'
                        )
                    WHERE status IN ('pending', 'parsing', 'embedding', 'indexing');
                    """
                )
                print("Startup recovery: Reset stuck processing documents to 'failed'.")

        print("Application initialization completed successfully.")
    except Exception as e:
        print(f"Startup failure: {str(e)}")
        raise e
    yield
    await close_db()


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(upload.router)
app.include_router(chat.router)
app.include_router(documents.router)
app.include_router(history.router)
app.include_router(session.router)
app.include_router(admin.router)