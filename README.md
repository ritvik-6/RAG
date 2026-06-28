# Multi-User RAG Agent with Persistent Memory

A Retrieval-Augmented Generation (RAG) application that allows users to upload PDF documents, ask questions, receive AI-generated answers with source citations, and maintain persistent chat history across multiple sessions.

![Stack](https://img.shields.io/badge/FastAPI-backend-009688?style=flat-square)
![Stack](https://img.shields.io/badge/LangChain-AI-1C3C3C?style=flat-square)
![Stack](https://img.shields.io/badge/Groq-LLM-F55036?style=flat-square)
![Stack](https://img.shields.io/badge/Milvus-vector%20db-00A1EA?style=flat-square)
![Stack](https://img.shields.io/badge/PostgreSQL-database-336791?style=flat-square)
![Stack](https://img.shields.io/badge/React%2018-frontend-61DAFB?style=flat-square)

---

## Features

- Upload and index one or more PDF documents
- AI chat with real-time streaming responses via WebSockets
- Source citations with filename and page number
- Built-in PDF viewer for cited pages
- Persistent chat sessions stored in PostgreSQL
- Document upload, listing, and deletion
- Semantic search powered by Milvus

---

## Architecture

```text
Frontend
    │
REST + WebSocket
    │
FastAPI Backend
    │
├── Orchestrator Agent
│   ├── RAG Worker → Milvus
│   └── Catalog Worker → PostgreSQL
└── Static File Server
```

---

## Quick Start

Create a `.env` file:

```env
GROQ_API_KEY=your_api_key
```

Run the application:

```bash
docker compose up -d --build
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8000 |
| API Docs | http://localhost:8000/docs |

---

## Project Structure

```
rag-agent-app/
├── backend/
│   ├── agents/          # Orchestrator, RAG worker, Catalog worker
│   ├── routes/          # upload, chat, documents, history, session, admin
│   ├── documents/       # Uploaded PDFs (served as static files)
│   ├── config.py        # Environment + shared models
│   ├── database.py      # PostgreSQL connection pool
│   ├── vector_store.py  # Milvus client
│   ├── prompts.py       # LLM system prompts
│   └── main.py          # FastAPI entry point
├── frontend/
│   ├── src/
│   │   ├── App.jsx              # Entry assembly
│   │   ├── main.jsx
│   │   ├── services/            # apiService, websocketService, chatService
│   │   ├── stores/              # Zustand: session, document, pdf, ui
│   │   ├── hooks/               # useWebSocket
│   │   ├── utils/               # renderMarkdown, parseCitations
│   │   └── components/          # layout, chat, documents, sessions, pdf
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
├── database/
│   └── schema.sql
├── Dockerfile
└── docker-compose.yml
```

---

## API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/upload` | Upload a PDF |
| `GET` | `/documents/{user_id}` | List uploaded documents |
| `DELETE` | `/documents/{document_id}` | Delete a document |
| `GET` | `/history/{user_id}` | Retrieve chat history |
| `DELETE` | `/session/{session_id}` | Delete a chat session |
| `WS` | `/ws/chat` | Streaming chat endpoint |
| `GET` | `/files/{filename}` | Serve PDF files |

---

## Stop

```bash
docker compose down
```