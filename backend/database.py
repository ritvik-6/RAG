# backend/database.py
import asyncpg
from backend.config import DATABASE_URL

db_pool = None

async def init_db():
    global db_pool
    db_pool = await asyncpg.create_pool(DATABASE_URL, min_size=2, max_size=15)
    print(" PostgreSQL connection pool established.")

async def close_db():
    global db_pool
    if db_pool:
        await db_pool.close()
        print(" PostgreSQL connection pool closed.")

def get_db():
    # Dynamically returning the active state prevents reference caching bugs
    return db_pool