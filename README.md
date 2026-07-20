# Multi-Agent RAG Document Q&A System

A full-stack Retrieval-Augmented Generation (RAG) web application for interactive document question-answering featuring multi-agent orchestration, hybrid vector search, real-time WebSocket response streaming, and interactive PDF citation highlighting.

## Project Highlights

- **Multi-Agent RAG Architecture**: Hierarchical router supervisor with specialized worker sub-agents.
- **Hybrid Retrieval**: Milvus dense vector search + BM25 sparse keyword ranking combined via Reciprocal Rank Fusion (RRF).
- **Cross-Encoder Reranking**: Re-scores candidate context passages using Cross-Encoder models for high precision context assembly.
- **Real-Time WebSocket Streaming**: Streamed token delivery, sub-task progress tracking, and latency metrics over `/ws/chat`.
- **Interactive PDF Citation Highlighting**: Dynamic PDF rendering with side-by-side jump-to-page citation highlighting.
- **React + FastAPI Full-Stack Architecture**: Modern single-page frontend paired with an asynchronous Python FastAPI backend.

## Key Features

- **Multi-Agent Orchestration**: Supervisor agent built with LangChain & LangGraph (using Groq `openai/gpt-oss-120b`) routes queries to `rag_sub_agent` for document Q&A or `catalog_sub_agent` for document metadata audits.
- **Hybrid Retrieval & Reranking**: Combines Milvus dense vector search and Rank-BM25 keyword search using Reciprocal Rank Fusion (RRF), followed by Cross-Encoder reranking (`ms-marco-MiniLM-L-6-v2`) and query decomposition.
- **Interactive PDF Viewer & Citation Highlighting**: Side-by-side PDF preview using `react-pdf` with instant page jumping and text highlighting for inline citations.
- **Asynchronous PDF Processing**: Background PDF text extraction (PyMuPDF), chunking (1000 chars, 200 overlap), batch embedding (`all-MiniLM-L6-v2`), and status tracking (`pending` → `parsing` → `embedding` → `indexing` → `complete`).
- **Real-Time WebSocket Streaming**: `/ws/chat` endpoint broadcasting agent thinking steps, status updates, word-level token streaming, citations, and latency metrics.
- **Session Management & Auto-Titling**: Chat history stored in PostgreSQL with automated LLM session title generation, renaming, and session deletion.
- **Self-Healing Startup Recovery**: Automatic recovery hooks reset interrupted processing tasks to `failed` state on server restarts.

## Tech Stack

| Layer | Technology | Version / Model | Role |
| :--- | :--- | :--- | :--- |
| **Frontend** | React, Vite, Tailwind CSS | React `18.3`, Vite `6.0`, Tailwind `3.4` | Single-page UI & styling |
| **State & PDF** | Zustand, React-PDF | Zustand `5.0`, React-PDF `10.4` | State management & PDF rendering |
| **Backend API** | Python, FastAPI, Uvicorn | Python `3.14` (`uv`), FastAPI `0.136` | Asynchronous REST & WebSocket backend |
| **Agent Framework** | LangChain, LangGraph | LangChain `1.3`, LangGraph `1.2` | Orchestrator graph & sub-agent execution |
| **LLM & Reranker** | ChatGroq, CrossEncoder | Groq `gpt-oss-120b`, `ms-marco-MiniLM-L-6-v2` | Answer synthesis, routing & reranking |
| **Embeddings & BM25**| Sentence-Transformers, Rank-BM25 | `all-MiniLM-L6-v2`, Rank-BM25 `0.2` | Vector & sparse text indexing |
| **Database** | PostgreSQL, asyncpg | PostgreSQL `16-alpine`, asyncpg `0.31` | Relational chat history & document metadata |
| **Vector Store** | Milvus, etcd, MinIO | Milvus `v2.4.0` (`pymilvus` `2.6`) | Standalone vector database |

## Architecture Overview

The system receives client requests over WebSockets (`/ws/chat`). The Orchestrator Agent routes queries to either the `catalog_sub_agent` for metadata lookup in PostgreSQL, or the `rag_sub_agent` for hybrid retrieval and LLM answer generation.

```mermaid
flowchart TD
    A[React Frontend] -->|HTTP / WS| B[FastAPI Backend]
    B --> C[Orchestrator Agent]
    C -->|Metadata Query| D[Catalog Sub-Agent]
    C -->|Content Query| E[RAG Sub-Agent]
    D --> F[(PostgreSQL)]
    E --> G{Query Rewrite}
    G --> H[Hybrid Retrieval]
    H --> I[Milvus<br/>Dense Search]
    H --> J[BM25<br/>Sparse Search]
    I --> K[Reciprocal Rank<br/>Fusion RRF]
    J --> K
    K --> L[Cross-Encoder<br/>Reranker]
    L --> M[LLM Answer<br/>Synthesis]
    M --> N[Streaming Tokens<br/>+ Citations]
```

## Prerequisites

- **Docker & Docker Compose**: Docker Engine v20.10+ / Compose v2.0+
- **Node.js**: v20+ (for local frontend development)
- **Python & uv**: Python 3.14+ with `uv` package manager

## Environment Variables

Read from `.env` by `backend/config.py` and `docker-compose.yml`:

| Variable | Description | Default / Example | Required |
| :--- | :--- | :--- | :--- |
| `GROQ_API_KEY` | Groq API key for LLM reasoning models | `gsk_...` | **Yes** |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://postgres:Admin@localhost:5432/postgres` | **Yes** |
| `MILVUS_URI` | Milvus gRPC/HTTP endpoint | `http://localhost:19530` | No |
| `USE_SHARED_COLLECTION` | Use single shared collection (`rag_shared_collection`) | `true` | No |
| `VITE_API_HOST` | Frontend HTTP API base URL | `http://localhost:8000` | No |
| `VITE_WS_HOST` | Frontend WebSocket base URL | `ws://localhost:8000` | No |

## Database Setup

PostgreSQL runs via Docker (`my-postgres-db:5432`). On initial container setup, `database/schema.sql` initializes the database tables (`chat_sessions`, `chat_messages`, `documents`, `thread_messages`).

Detailed instructions for pgAdmin 4 connection, schema migrations, and volume persistence can be found in the [Database Setup Guide](docs/database_setup.md).

## Getting Started

### Full Docker Stack (Production Mode)

1. Create `.env` in root with your `GROQ_API_KEY`.
2. Launch all services:
   ```bash
   docker compose up -d --build
   ```
3. Access the web interface at `http://localhost:3000`.

### Local Development Mode

1. Start infrastructure services (PostgreSQL, Milvus, FastAPI backend):
   ```bash
   docker compose up -d --build
   ```
2. Run the React frontend locally:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
3. Access the dev interface at `http://localhost:3000`.

## Quick Reference

| Service | Protocol | Endpoint | Description |
| :--- | :--- | :--- | :--- |
| **Frontend UI** | HTTP | `http://localhost:3000` | Web application interface |
| **Backend REST API** | HTTP | `http://localhost:8000` | Core API server |
| **API Docs (Swagger)**| HTTP | `http://localhost:8000/docs` | Interactive OpenAPI documentation |
| **WebSocket Chat** | WS | `ws://localhost:8000/ws/chat` | Real-time chat & status stream |
| **PostgreSQL DB** | TCP | `localhost:5432` | Relational metadata store |
| **Milvus Vector DB** | HTTP | `http://localhost:19530` | Vector collection endpoint |

## Project Structure

```
rag-agent-app/
├── backend/                  # FastAPI app, routes, and multi-agent workers
│   ├── routes/               # REST API & WebSocket handlers (chat, upload, docs, history)
│   ├── services/agents/      # Orchestrator, RAG, and Catalog sub-agent implementations
│   ├── config.py             # App environment variables & model settings
│   ├── database.py           # PostgreSQL asyncpg connection pool
│   └── vector_store.py       # Milvus client manager
├── database/                 # Database schema definitions & migration scripts
│   ├── migrations/           # Incremental SQL migrations
│   ├── migrate.py            # Asyncpg migration runner script
│   └── schema.sql            # Table definitions (sessions, messages, documents)
├── docs/                     # Additional project documentation
│   └── database_setup.md     # Detailed PostgreSQL & pgAdmin setup guide
├── frontend/                 # React SPA (Vite, Tailwind, Zustand)
│   ├── src/                  # Components (chat, pdf, documents, layout), stores, services
│   └── nginx.conf            # Production Nginx reverse proxy config
├── scripts/                  # System inspection and maintenance scripts
├── docker-compose.yml        # Multi-container orchestration config
├── dockerfile                # Multi-stage container build definition
└── pyproject.toml            # Backend dependencies managed by uv
```

## API Reference

### REST Endpoints

| Method | Endpoint | Purpose |
| :--- | :--- | :--- |
| `POST` | `/upload` | Upload PDF file and queue background indexing |
| `GET` | `/documents/{document_id}/status` | Check document ingestion status |
| `GET` | `/documents/{user_id}` | List user uploaded documents |
| `DELETE` | `/documents/{document_id}` | Remove document and delete vector embeddings |
| `GET` | `/files/{filename}` | Serve raw PDF for side-by-side viewer |
| `GET` | `/history/{user_id}` | Load user sessions and chat history |
| `DELETE` | `/session/{session_id}` | Delete chat session |
| `PATCH` | `/session/{session_id}/rename` | Rename chat session |
| `DELETE` | `/admin/reset-collection/{user_id}` | Admin reset for user Milvus vector collection |

### WebSocket Protocol (`/ws/chat`)

Client connects to `/ws/chat` with `{ user_id, session_id, message }`. Server streams JSON frames:
- `start`: Transmission start with session metadata.
- `status`: Step progress (routing, query decomposition, sub-question search, synthesis).
- `citation_chunks`: Citation mappings (`source:page` to text snippet).
- `token`: Word-by-word response streaming.
- `session_renamed`: Emitted when an auto-generated title is assigned.
- `end`: Turn completion with latency metrics (`latency_ms`).
- `error`: Exception notification.

## Stop / Teardown

```bash
docker compose down       # Stop containers, preserve database and vector volumes
docker compose down -v    # Stop containers and wipe volumes (fresh database state)
```

## Future Improvements

- **JWT Authentication & Multi-User Support**: User registration, login, and tenant isolation.
- **Production Cloud Deployment**: Container deployment setup with SSL, auto-scaling, and managed databases.
- **OCR Document Processing**: Integration with Tesseract / Unstructured for scanned PDF parsing.
- **Multi-Format File Support**: Ingestion for DOCX, TXT, PPTX, and Markdown documents.
- **Smarter Query Rewriting & Routing**: Context-aware query reformulation using fine-tuned router prompts.
- **Observability & Tracing**: Integration with OpenTelemetry and LangSmith for agent trace monitoring.

## Known Limitations

- **Simulated Token Streaming**: LLM tool calls execute synchronously; WebSocket streams tokens with small artificial delays.
- **Wildcard CORS**: Backend enables permissive CORS (`*`), requiring restriction in production.
- **No In-Place Document Updates**: Updating a PDF requires deleting and re-uploading the file.
- **In-Memory BM25 Cache**: BM25 index is cached per process up to 500 chunks and resets on backend restarts.
- **Static Chunking**: PDF processing uses fixed character chunking (1000 chars, 200 overlap).
