-- 1. Add status column without a default first
ALTER TABLE documents ADD COLUMN IF NOT EXISTS status TEXT;

-- 2. Explicitly backfill existing records
UPDATE documents SET status = 'complete' WHERE status IS NULL;

-- 3. Set the default to 'pending' for future inserts
ALTER TABLE documents ALTER COLUMN status SET DEFAULT 'pending';

-- 4. Create missing indexes
CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_filename ON documents(filename);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_id ON chat_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_thread_id ON chat_sessions(thread_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON chat_messages(session_id);
