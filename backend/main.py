from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.database import init_db, close_db
from backend.vector_store import init_milvus
from backend.routes import upload, history, chat, session

@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    init_milvus()
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
app.include_router(history.router)
app.include_router(chat.router)
app.include_router(session.router)