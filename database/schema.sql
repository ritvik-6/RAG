-- Use these to create tables

-- Create the Sessions Table
CREATE TABLE IF NOT EXISTS chat_sessions (
    session_id UUID PRIMARY KEY,
    user_id VARCHAR(100) NOT NULL,
    session_title VARCHAR(255) DEFAULT 'New Conversation',
    session_name VARCHAR(255) DEFAULT 'New Conversation',
    thread_id UUID DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create the Messages Table
CREATE TABLE IF NOT EXISTS chat_messages (
    message_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES chat_sessions(session_id) ON DELETE CASCADE,
    sender VARCHAR(50) NOT NULL, -- 'user' or 'ai'
    message_text TEXT NOT NULL,
    citation_chunks JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create the Documents Table
CREATE TABLE IF NOT EXISTS documents (
    document_id UUID PRIMARY KEY,
    user_id TEXT NOT NULL,
    filename TEXT NOT NULL,
    upload_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    page_count INTEGER,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Create the Thread Messages Table
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

-- Create indexes on thread_messages for faster queries
CREATE INDEX IF NOT EXISTS idx_thread_messages_thread_id ON thread_messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_thread_messages_session_id ON thread_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_thread_messages_user_id ON thread_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_thread_messages_message_id ON thread_messages(message_id);