import os
from dotenv import load_dotenv
from langchain_groq import ChatGroq
from langchain_huggingface import HuggingFaceEmbeddings

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL environment variable is missing.")

MILVUS_URI = os.getenv("MILVUS_URI", "http://localhost:19530")
UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "documents")
os.makedirs(UPLOAD_DIR, exist_ok=True)

MODEL = ChatGroq(model="qwen/qwen3-32b", reasoning_format="parsed")
EMBEDDINGS = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")