--Use these to create tables

-- Create the Sessions Table
CREATE TABLE IF NOT EXISTS chat_sessions (
    session_id UUID PRIMARY KEY,
    user_id VARCHAR(100) NOT NULL,
    session_title VARCHAR(255) DEFAULT 'New Conversation',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create the Messages Table
CREATE TABLE IF NOT EXISTS chat_messages (
    message_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES chat_sessions(session_id) ON DELETE CASCADE,
    sender VARCHAR(50) NOT NULL, -- 'user' or 'ai'
    message_text TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

--Create the Documents Table
CREATE TABLE IF NOT EXISTS documents (
    document_id UUID PRIMARY KEY,
    user_id TEXT NOT NULL,
    filename TEXT NOT NULL,
    upload_time TIMESTAMP DEFAULT NOW(),
    page_count INTEGER,
    metadata JSONB DEFAULT '{}'::jsonb
);