from pymilvus import MilvusClient
from backend.config import MILVUS_URI

milvus_client = None

def init_milvus():
    global milvus_client
    milvus_client = MilvusClient(uri=MILVUS_URI)
    print(" Milvus connection established.")

def get_milvus():
    return milvus_client