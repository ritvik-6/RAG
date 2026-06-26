from pymilvus import MilvusClient
import os

milvus_client = None
MILVUS_URI = os.getenv("MILVUS_URI", "http://milvus:19530")


def init_milvus():
    global milvus_client
    milvus_client = MilvusClient(uri=MILVUS_URI)
    print("Milvus connection established.")


def get_milvus():
    global milvus_client
    return milvus_client


def drop_user_collection(user_id: str) -> bool:
    """
    Drops the Milvus collection for a user so it can be recreated
    with the updated schema (now includes page_number field).
    Called once via the /admin/reset-collection/{user_id} endpoint.
    """
    client = get_milvus()
    if not client:
        return False
    collection_name = f"user_{user_id.replace('-', '_')}"
    if client.has_collection(collection_name):
        client.drop_collection(collection_name)
        print(f"Dropped collection: {collection_name}")
    return True