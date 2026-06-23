# backend/vector_store.py
from pymilvus import MilvusClient
import os

milvus_client = None
MILVUS_URI = os.getenv("MILVUS_URI", "http://milvus:19530")

def init_milvus():
    global milvus_client
    milvus_client = MilvusClient(uri=MILVUS_URI)
    print(" Milvus connection established via init_milvus.")

def get_milvus():
    global milvus_client
    return milvus_client