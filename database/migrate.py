import asyncio
import os
from dotenv import load_dotenv
import asyncpg

# Load environment variables
load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    # If not found, try connecting to localhost default
    DATABASE_URL = "postgresql://postgres:Admin@localhost:5432/postgres"

async def migrate():
    print(f"Connecting to database at: {DATABASE_URL}")
    try:
        conn = await asyncpg.connect(DATABASE_URL)
    except Exception as e:
        print(f"Failed to connect to database: {e}")
        print("Retrying with localhost connection...")
        try:
            conn = await asyncpg.connect("postgresql://postgres:Admin@localhost:5432/postgres")
        except Exception as e2:
            print(f"Failed to connect to localhost database: {e2}")
            return

    print("Connection established. Running migrations...")

    async with conn.transaction():
        # 1. Add session_name column if it does not exist
        await conn.execute("""
            ALTER TABLE chat_sessions 
            ADD COLUMN IF NOT EXISTS session_name VARCHAR(255) DEFAULT 'New Conversation';
        """)
        print("Column 'session_name' checked/added to 'chat_sessions'.")

        # 2. Add thread_id column if it does not exist
        await conn.execute("""
            ALTER TABLE chat_sessions 
            ADD COLUMN IF NOT EXISTS thread_id UUID DEFAULT gen_random_uuid();
        """)
        print("Column 'thread_id' checked/added to 'chat_sessions'.")

        # 3. Create thread_messages table
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS thread_messages (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                thread_id UUID NOT NULL,
                session_id UUID NOT NULL REFERENCES chat_sessions(session_id) ON DELETE CASCADE,
                user_id VARCHAR(100) NOT NULL,
                user_query TEXT NOT NULL,
                prompt TEXT NOT NULL,
                response TEXT NOT NULL,
                latency_ms INTEGER NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        """)
        print("Table 'thread_messages' checked/created.")

        # 4. Create indexes on thread_messages
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_thread_messages_thread_id ON thread_messages(thread_id);")
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_thread_messages_session_id ON thread_messages(session_id);")
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_thread_messages_user_id ON thread_messages(user_id);")
        print("Indexes checked/created on 'thread_messages'.")

    await conn.close()
    print("Migration completed successfully!")

if __name__ == "__main__":
    asyncio.run(migrate())
