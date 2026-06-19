# Multi-User RAG Agent with Persistent Memory

A chat application that lets users upload PDF documents, ask questions about them, and keeps a persistent history of chat conversations across multiple sessions.

## 🏗️ Tech Stack
* **Backend:** FastAPI & Uvicorn (Python 3.14 managed via `uv`)
* **AI Engine:** LangChain & ChatGroq (`qwen/qwen3-32b`)
* **Embeddings:** HuggingFace (`all-MiniLM-L6-v2`)
* **Vector Database:** Milvus (Standalone via Docker)
* **Database:** PostgreSQL 16 (Running inside a Docker container)
* **Real-time:** WebSockets (streaming token-by-token responses)
* **Frontend:** HTML5, CSS3, and Vanilla JavaScript

---

## 📁 Project Structure
```text
rag-agent-app/
├── backend/
│   ├── documents/          # Uploaded PDFs are stored here
│   ├── routes/
│   │   ├── __init__.py
│   │   ├── upload.py       # PDF ingestion endpoint
│   │   ├── history.py      # Session history endpoint
│   │   ├── chat.py         # WebSocket chat endpoint
│   │   └── session.py      # Session delete endpoint
│   ├── config.py           # Environment variables & shared models
│   ├── database.py         # PostgreSQL connection pool
│   ├── vector_store.py     # Milvus client setup
│   ├── prompts.py          # LLM system prompts
│   └── main.py             # FastAPI app entry point
├── frontend/
│   ├── css/style.css       # Chat styles & layout
│   ├── js/app.js           # Frontend logic & WebSocket client
│   └── index.html          # Chat interface
├── database/
│   ├── schema.sql          # Database tables setup file
│   └── queries.sql         # Test SQL queries
├── .env                    # Secret API keys (Keep hidden)
├── .dockerignore           # Tells Docker what to ignore
├── Dockerfile              # Blueprint for the Python container
└── docker-compose.yml      # Starts all services together
```

---

## 💾 Database Tables Setup
The system automatically manages your chats using two connected tables:

```sql
-- 1. Tracks Chat Sessions
CREATE TABLE IF NOT EXISTS chat_sessions (
    session_id UUID PRIMARY KEY,
    user_id VARCHAR(100) NOT NULL,
    session_title VARCHAR(255) DEFAULT 'New Conversation',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Tracks Messages Inside Sessions (Deletes automatically if session is deleted)
CREATE TABLE IF NOT EXISTS chat_messages (
    message_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES chat_sessions(session_id) ON DELETE CASCADE,
    sender VARCHAR(50) NOT NULL,
    message_text TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

---

## 🐳 Services Overview
All services are orchestrated via Docker Compose:

| Service | Description | Port |
|---|---|---|
| `db` | PostgreSQL 16 — stores chat sessions and messages | `5432` |
| `etcd` | Milvus metadata store | internal |
| `minio` | Milvus object storage (vector data on disk) | internal |
| `milvus` | Vector database — stores PDF embeddings per user | `19530` |
| `backend` | FastAPI + Uvicorn — REST & WebSocket API | `8000` |
| `frontend` | Nginx serving the HTML/JS/CSS chat UI | `3000` |

> `DATABASE_URL` and `MILVUS_URI` are set directly in `docker-compose.yml`. Only `GROQ_API_KEY` needs to be in your `.env` file.

---

## 🚀 How to Run the App

### 2. Configure Your Keys
Create a file named `.env` in the root folder:
```ini
GROQ_API_KEY=your_secret_groq_api_key_here
```
> Get your free Groq API key at https://console.groq.com

### 3. Start All Services
```bash
docker compose up -d --build
```
> First run takes a few minutes — Docker needs to pull Milvus, PostgreSQL, and MinIO images.

### 4. Open the Application
* **Chat UI:** http://localhost:3000
* **API Docs:** http://localhost:8000/docs

### 5. Start Chatting
1. Click **Choose File** and select a PDF
2. Click **Ingest File** and wait for the success message
3. Type your question and hit **Send**

---

## ⚙️ How It Works
1. Upload a PDF — it gets chunked, embedded, and indexed into Milvus
2. Ask a question — sent over a WebSocket connection
3. The backend retrieves relevant chunks from Milvus and streams the response token by token
4. Chat history is persisted in PostgreSQL and restored on page refresh

---

## 🔍 Inspecting Data with pgAdmin

### Connect to PostgreSQL
Open pgAdmin and create a new server connection with these details:

| Field | Value |
|---|---|
| Host | `localhost` |
| Port | `5432` |
| Database | `postgres` |
| Username | `postgres` |
| Password | `Admin` |

### View Chat Data
Open the Query Tool and run:
```sql
-- View all messages
SELECT
    s.user_id,
    m.session_id,
    m.sender,
    m.message_text,
    m.created_at
FROM public.chat_messages m
JOIN public.chat_sessions s ON m.session_id = s.session_id
ORDER BY m.created_at ASC;

-- View all sessions
SELECT session_id, user_id, created_at
FROM public.chat_sessions
ORDER BY created_at ASC;
```

---

## 🔒 How to Stop the App
```bash
docker compose down
```