# backend/routes/chat.py
import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from backend.database import get_db
from backend.services.agent import get_user_agent # Import your new factory service

router = APIRouter()

@router.websocket("/ws/chat")
async def websocket_chat(websocket: WebSocket):
    await websocket.accept()

    pool = get_db()
    if not pool:
        await websocket.send_text(json.dumps({"type": "error", "data": "Database singletons unavailable."}))
        await websocket.close()
        return

    try:
        while True:
            raw = await websocket.receive_text()

            try:
                payload = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_text(json.dumps({"type": "error", "data": "Inbound payload must be valid JSON."}))
                continue

            user_id = payload.get("user_id")
            session_id = payload.get("session_id")
            message = payload.get("message", "").strip()

            if not message:
                continue

            collection_name = f"user_{user_id.replace('-', '_')}"

            # Persist and fetch message history matrices via asyncpg pool handles
            async with pool.acquire() as conn:
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

            # Fetch the modular isolated agent dynamically via the service factory
            agent = get_user_agent(user_id=user_id, collection_name=collection_name)

            # Initiate streaming pipelines token-by-token
            await websocket.send_text(json.dumps({"type": "start"}))
            full_response = ""

            async for event in agent.astream_events({"messages": formatted_history}, version="v2"):
                kind = event.get("event")
                if kind == "on_chat_model_stream":
                    chunk = event.get("data", {}).get("chunk")
                    if chunk and hasattr(chunk, "content") and isinstance(chunk.content, str):
                        token = chunk.content
                        if token:
                            full_response += token
                            await websocket.send_text(json.dumps({"type": "token", "data": token}))

            await websocket.send_text(json.dumps({"type": "end"}))

            async with pool.acquire() as conn:
                await conn.execute(
                    "INSERT INTO chat_messages (session_id, sender, message_text) VALUES ($1, $2, $3)",
                    session_id, "ai", full_response
                )

    except WebSocketDisconnect:
        print("WebSocket channel terminated smoothly.")
    except Exception as runtime_fault:
        print(f"CRITICAL FAULT DETECTED: {str(runtime_fault)}")
        try:
            await websocket.send_text(json.dumps({"type": "error", "data": str(runtime_fault)}))
        except Exception:
            pass