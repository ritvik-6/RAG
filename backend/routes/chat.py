import json
import time
import uuid
import re
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from backend.database import get_db
from backend.services.agents.orchestrator import create_orchestrator_agent
from backend.config import PromptContainer, worker_prompt_var

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
            start_time = time.perf_counter()
            
            # Initialize PromptContainer for this turn
            container = PromptContainer()
            worker_prompt_var.set(container)
            
            payload = json.loads(raw)
            
            user_id = payload.get("user_id")
            session_id = payload.get("session_id")
            message = payload.get("message", "").strip()
            
            if not message:
                continue
                
            collection_name = f"user_{user_id.replace('-', '_')}"
            
            # Record historical chains to PostgreSQL and retrieve/create session
            async with pool.acquire() as conn:
                # Fetch the thread_id
                row = await conn.fetchrow(
                    "SELECT thread_id FROM chat_sessions WHERE session_id = $1",
                    session_id
                )
                thread_id = row["thread_id"] if row else None
                
                if not thread_id:
                    # Determine the next sequential default session name
                    existing_rows = await conn.fetch(
                        "SELECT session_name FROM chat_sessions WHERE user_id = $1",
                        user_id
                    )
                    
                    max_num = 0
                    for r in existing_rows:
                        name = r["session_name"]
                        if not name:
                            continue
                        if name == "New Conversation":
                            max_num = max(max_num, 1)
                        else:
                            match = re.match(r"^New Conversation (\d+)$", name)
                            if match:
                                max_num = max(max_num, int(match.group(1)))
                                
                    if max_num == 0:
                        new_name = "New Conversation"
                    else:
                        new_name = f"New Conversation {max_num + 1}"
                        
                    thread_id = uuid.uuid4()
                    await conn.execute(
                        """
                        INSERT INTO chat_sessions (session_id, user_id, session_name, thread_id)
                        VALUES ($1, $2, $3, $4)
                        ON CONFLICT (session_id) DO NOTHING
                        """,
                        session_id, user_id, new_name, thread_id
                    )

                rows = await conn.fetch(
                    "SELECT sender, message_text FROM chat_messages WHERE session_id = $1 ORDER BY created_at ASC",
                    session_id
                )
                await conn.execute(
                    "INSERT INTO chat_messages (session_id, sender, message_text) VALUES ($1, $2, $3)",
                    session_id, "user", message
                )

            formatted_history = [
                {"role": "user" if r["sender"] == "user" else "assistant", "content": r["message_text"]}
                for r in rows
            ]

            # Instantiating modern hierarchical supervisor agent
            agent = create_orchestrator_agent(user_id, collection_name)
            
            await websocket.send_text(json.dumps({
                "type": "start",
                "thread_id": str(thread_id)
            }))
            full_response = ""
            active_tool = None

            input_messages = formatted_history + [{"role": "user", "content": message}]
            async for event in agent.astream_events({"messages": input_messages}, version="v2"):
                event_name = event.get("event")

                if event_name == "on_tool_start":
                    active_tool = event.get("name")
                elif event_name == "on_tool_end":
                    active_tool = None
                elif event_name == "on_chat_model_stream" and active_tool is not None:
                    chunk = event.get("data", {}).get("chunk")
                    if chunk and hasattr(chunk, "content") and chunk.content:
                        token = chunk.content
                        full_response += token
                        await websocket.send_text(json.dumps({"type": "token", "data": token}))
                            
            # Stop timing immediately after the final token message is sent
            end_time = time.perf_counter()
            latency_ms = round((end_time - start_time) * 1000)
            
            await websocket.send_text(json.dumps({
                "type": "end",
                "latency_ms": latency_ms
            }))
            
            prompt_str = container.value

            async with pool.acquire() as conn:
                # Capture the message_id using RETURNING
                row = await conn.fetchrow(
                    """
                    INSERT INTO chat_messages (session_id, sender, message_text) 
                    VALUES ($1, $2, $3) 
                    RETURNING message_id
                    """,
                    session_id, "ai", full_response
                )
                ai_message_id = row["message_id"] if row else None
                
                # Persist to thread_messages with error tolerance
                try:
                    await conn.execute(
                        """
                        INSERT INTO thread_messages (thread_id, session_id, message_id, user_id, user_query, prompt, response, latency_ms)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                        """,
                        thread_id, session_id, ai_message_id, user_id, message, prompt_str, full_response, latency_ms
                    )
                except Exception as db_err:
                    # Log the error but continue normally (do not crash the websocket)
                    print(f"Error persisting thread message: {db_err}")
                
    except WebSocketDisconnect:
        print("WebSocket tracking session closed down smoothly.")
    except Exception as runtime_fault:
        print(f"Orchestration Error: {str(runtime_fault)}")
