# backend/main.py
import os
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.database import init_db, close_db
from backend.vector_store import init_milvus # Import the initializer helper
from backend.routes import upload, chat, documents, history, session

@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        await init_db()
        
        # Initialize Milvus cleanly inside its module namespace
        init_milvus()
        
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