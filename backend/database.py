# backend/database.py
import asyncpg
from backend.config import DATABASE_URL

db_pool = None

async def init_db():
    global db_pool
    db_pool = await asyncpg.create_pool(DATABASE_URL, min_size=2, max_size=15)
    print(" PostgreSQL connection pool established.")
    
    # Execute database migrations on startup
    async with db_pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute("""
                ALTER TABLE chat_sessions 
                ADD COLUMN IF NOT EXISTS session_name VARCHAR(255) DEFAULT 'New Conversation';
            """)
            await conn.execute("""
                ALTER TABLE chat_sessions 
                ADD COLUMN IF NOT EXISTS thread_id UUID DEFAULT gen_random_uuid();
            """)
            await conn.execute("""
                ALTER TABLE chat_messages 
                ADD COLUMN IF NOT EXISTS citation_chunks JSONB DEFAULT '{}'::jsonb;
            """)
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS thread_messages (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    thread_id UUID NOT NULL,
                    session_id UUID NOT NULL REFERENCES chat_sessions(session_id) ON DELETE CASCADE,
                    message_id UUID REFERENCES chat_messages(message_id) ON DELETE CASCADE,
                    user_id VARCHAR(100) NOT NULL,
                    user_query TEXT NOT NULL,
                    prompt TEXT NOT NULL,
                    response TEXT NOT NULL,
                    latency_ms INTEGER NOT NULL,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );
            """)
            # Backward compatibility check: Add message_id column if thread_messages already exists
            await conn.execute("""
                ALTER TABLE thread_messages 
                ADD COLUMN IF NOT EXISTS message_id UUID REFERENCES chat_messages(message_id) ON DELETE CASCADE;
            """)
            # Standardize documents.upload_time to TIMESTAMP WITH TIME ZONE
            await conn.execute("""
                ALTER TABLE documents 
                ALTER COLUMN upload_time TYPE TIMESTAMP WITH TIME ZONE;
            """)
            await conn.execute("CREATE INDEX IF NOT EXISTS idx_thread_messages_thread_id ON thread_messages(thread_id);")
            await conn.execute("CREATE INDEX IF NOT EXISTS idx_thread_messages_session_id ON thread_messages(session_id);")
            await conn.execute("CREATE INDEX IF NOT EXISTS idx_thread_messages_user_id ON thread_messages(user_id);")
            await conn.execute("CREATE INDEX IF NOT EXISTS idx_thread_messages_message_id ON thread_messages(message_id);")

            # Run index and status column migration
            import os
            migration_path = os.path.join(
                os.path.dirname(os.path.dirname(__file__)),
                "database",
                "migrations",
                "01_add_indexes_and_status.sql"
            )
            if os.path.exists(migration_path):
                with open(migration_path, "r", encoding="utf-8") as f:
                    migration_sql = f.read()
                await conn.execute(migration_sql)
                print(" Applied 01_add_indexes_and_status.sql indexes & status migration.")
    print(" PostgreSQL database migrations applied successfully.")


async def close_db():
    global db_pool
    if db_pool:
        await db_pool.close()
        print(" PostgreSQL connection pool closed.")

def get_db():
    # Dynamically returning the active state prevents reference caching bugs
    return db_pool