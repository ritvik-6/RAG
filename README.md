# Multi-User RAG Agent with Persistent Memory

A chat application that lets users upload PDF documents, asks questions about them, and keeps a persistent history of chat conversations across multiple sessions.

## 🏗️ Tech Stack
* **Backend:** FastAPI & Uvicorn (Python 3.14 managed via `uv`)
* **AI Engine:** LangChain & ChatGroq (`qwen/qwen3-32b`)
* **Embeddings:** HuggingFace (`all-MiniLM-L6-v2`)
* **Database:** PostgreSQL 16 (Running inside a Docker container)
* **Frontend:** HTML5, CSS3, and Vanilla JavaScript

---

## 📁 Project Structure
```text
rag-agent-app/
├── backend/
│   ├── documents/          # Uploaded PDFs are stored here
│   └── main.py             # FastAPI backend code
├── frontend/
│   ├── css/style.css       # Chat styles layout
│   ├── js/app.js           # Frontend logic & API calls
│   └── index.html          # Chat interface website
├── database/
│   ├── schema.sql          # Database tables setup file
│   └── queries.sql         # Test SQL queries
├── .env                    # Secret API keys (Keep hidden)
├── .dockerignore           # Tells Docker what to ignore
├── Dockerfile              # Blueprint for the Python container
└── docker-compose.yml      # Starts backend and database together
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

## 🚀 How to Run the App (Directly in Docker)

### 1. Configure Your Keys
Create a file named `.env` in the root folder (`rag-agent-app`) and add your Groq key:
```ini
GROQ_API_KEY=your_secret_groq_api_key_here
```

### 2. Start the App and Database
Open your terminal in the root folder and run:
```bash
docker compose up --build -d
```

### 3. Open the Application
* **Backend Check:** Go to **http://127.0.0** to view the live API docs.
* **Run Website:** Double-click `frontend/index.html` to open the chat interface.

---

## 🔒 How to Stop the App
```bash
docker compose down
```