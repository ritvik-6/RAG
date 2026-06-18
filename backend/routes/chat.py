import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from langchain_core.tools import tool
from langchain.agents import create_agent
from backend.config import MODEL, EMBEDDINGS
from backend.database import get_db
from backend.vector_store import get_milvus
from backend.prompts import DOCUMENT_ASSISTANT_PROMPT

router = APIRouter()

@router.websocket("/ws/chat")
async def websocket_chat(websocket: WebSocket):
    await websocket.accept()

    db = get_db()
    if not db:
        await websocket.send_text(json.dumps({"type": "error", "data": "Database pool unavailable."}))
        await websocket.close()
        return

    try:
        while True:
            raw = await websocket.receive_text()
            payload = json.loads(raw)

            user_id = payload.get("user_id")
            session_id = payload.get("session_id")
            message = payload.get("message", "").strip()

            if not message:
                continue

            collection_name = f"user_{user_id.replace('-', '_')}"
            client = get_milvus()

            if not client.has_collection(collection_name):
                await websocket.send_text(json.dumps({
                    "type": "error",
                    "data": "No document found. Please upload a PDF first."
                }))
                continue

            async with db.acquire() as conn:
                await conn.execute(
                    "INSERT INTO chat_sessions (session_id, user_id) VALUES ($1, $2) ON CONFLICT (session_id) DO NOTHING",
                    session_id, user_id
                )
                await conn.execute(
                    "INSERT INTO chat_messages (session_id, sender, message_text) VALUES ($1, $2, $3)",
                    session_id, "user", message
                )
                rows = await conn.fetch(
                    "SELECT sender, message_text FROM chat_messages WHERE session_id = $1 ORDER BY created_at ASC",
                    session_id
                )

            formatted_history = [
                {
                    "role": "user" if r["sender"] == "user" else "assistant",
                    "content": r["message_text"]
                }
                for r in rows
            ]

            @tool(response_format="content_and_artifact")
            def retrieve_context(query: str):
                """Retrieves relevant context from the uploaded PDF document."""
                query_vector = EMBEDDINGS.embed_query(query)
                results = client.search(
                    collection_name=collection_name,
                    data=[query_vector],
                    limit=3,
                    output_fields=["text", "source"]
                )
                if not results or not results[0]:
                    return "NO_RELEVANT_CONTEXT", []

                hits = results[0]
                serialized = "\n\n".join(
                    f"Content: {hit['entity']['text']}\nSource: {hit['entity']['source']}"
                    for hit in hits
                )
                return serialized, hits


            agent = create_agent(MODEL, [retrieve_context], system_prompt=DOCUMENT_ASSISTANT_PROMPT)
            await websocket.send_text(json.dumps({"type": "start"}))

            full_response = ""
            async for event in agent.astream_events({"messages": formatted_history}, version="v2"):
                if event.get("event") == "on_chat_model_stream":
                    chunk = event.get("data", {}).get("chunk")
                    if chunk and hasattr(chunk, "content") and isinstance(chunk.content, str):
                        token = chunk.content
                        if token:
                            full_response += token
                            await websocket.send_text(json.dumps({"type": "token", "data": token}))

            await websocket.send_text(json.dumps({"type": "end"}))

            async with db.acquire() as conn:
                await conn.execute(
                    "INSERT INTO chat_messages (session_id, sender, message_text) VALUES ($1, $2, $3)",
                    session_id, "ai", full_response
                )

    except WebSocketDisconnect:
        print("WebSocket client disconnected.")
    except Exception as e:
        try:
            await websocket.send_text(json.dumps({"type": "error", "data": str(e)}))
        except Exception:
            pass