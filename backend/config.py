import os
import contextvars
from dotenv import load_dotenv
from langchain_groq import ChatGroq
from langchain_huggingface import HuggingFaceEmbeddings

load_dotenv()

# Container class to allow async-safe prompt propagation from child tasks back to parent task
class PromptContainer:
    def __init__(self):
        self.value = ""

# ContextVar to capture the PromptContainer instance
worker_prompt_var = contextvars.ContextVar("worker_prompt", default=None)


DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL environment variable is missing.")

MILVUS_URI = os.getenv("MILVUS_URI", "http://localhost:19530")
UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "documents")
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Generation model — used for actual answer synthesis (RAG answers, catalog tables).
# Slight temperature is fine here; wording variation doesn't change correctness.
MODEL = ChatGroq(model="qwen/qwen3-32b", reasoning_format="parsed", temperature=0.3)

# Router model — used ONLY for tool-selection / classification decisions.
# Temperature=0 so the same question always routes to the same tool.
ROUTER_MODEL = ChatGroq(model="qwen/qwen3-32b", reasoning_format="parsed", temperature=0)

EMBEDDINGS = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")
USE_SHARED_COLLECTION = os.getenv("USE_SHARED_COLLECTION", "true").lower() == "true"