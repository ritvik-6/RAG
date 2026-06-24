import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from backend.database import get_db
from backend.services.agents.orchestrator import create_orchestrator_agent

router = APIRouter()

@router.websocket("/ws/chat")
async def websocket_chat(websocket: WebSocket):
    await websocket.accept()
    pool = get_db()
    
    if not pool:
        await websocket.send_text(json.dumps({"type": "error", "data": "Cluster singletons offline."}))
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
            
            # Record historical chains to PostgreSQL
            async with pool.acquire() as conn:
                await conn.execute(
                    "INSERT INTO chat_sessions (session_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
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
                {"role": "user" if r["sender"] == "user" else "assistant", "content": r["message_text"]}
                for r in rows
            ]

            # Instantiating modern hierarchical supervisor agent
            agent = create_orchestrator_agent(user_id, collection_name)
            
            await websocket.send_text(json.dumps({"type": "start"}))
            full_response = ""
            
            async for event in agent.astream_events({"messages": formatted_history}, version="v2"):
                if event.get("event") == "on_chat_model_stream":
                    chunk = event.get("data", {}).get("chunk")
                    if chunk and hasattr(chunk, "content") and chunk.content:
                        token = chunk.content
                        full_response += token
                        await websocket.send_text(json.dumps({"type": "token", "data": token}))
                            
            await websocket.send_text(json.dumps({"type": "end"}))
            
            async with pool.acquire() as conn:
                await conn.execute(
                    "INSERT INTO chat_messages (session_id, sender, message_text) VALUES ($1, $2, $3)",
                    session_id, "ai", full_response
                )
                
    except WebSocketDisconnect:
        print("WebSocket tracking session closed down smoothly.")
    except Exception as runtime_fault:
        print(f"Orchestration Error: {str(runtime_fault)}")