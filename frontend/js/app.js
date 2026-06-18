const HOST = "http://localhost:8000";
const WS_HOST = "ws://localhost:8000";
const viewport = document.getElementById("messages-viewport");
const queryInput = document.getElementById("queryConsole");
const submitBtn = document.getElementById("submitBtn");
const statusDisplay = document.getElementById("runtimeStatus");
const sessionsListContainer = document.getElementById("sessionsList");

function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

if (!localStorage.getItem("RAG_USER_ID")) {
    localStorage.setItem("RAG_USER_ID", "user_" + Math.random().toString(36).substr(2, 9));
}
const CURRENT_USER_ID = localStorage.getItem("RAG_USER_ID");

let activeSessionId = null;
let chatSessionsMemory = {};

// Single persistent WebSocket for the lifetime of the page
let chatSocket = null;
let isStreaming = false;

function connectWebSocket() {
    chatSocket = new WebSocket(`${WS_HOST}/ws/chat`);

    chatSocket.onopen = () => {
        console.log("WebSocket connected.");
    };

    chatSocket.onmessage = (event) => {
        const msg = JSON.parse(event.data);

        if (msg.type === "start") {
            // Replace "Thinking..." bubble with an empty one ready for streaming

        } else if (msg.type === "token") {
            const node = document.getElementById("streaming-bubble");
            if (node) {
                // Clear loader on very first token only
                if (!node.dataset.raw) node.innerHTML = "";
                node.dataset.raw = (node.dataset.raw || "") + msg.data;
                node.innerHTML = node.dataset.raw
                    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                    .replace(/\n/g, '<br>');
                viewport.scrollTop = viewport.scrollHeight;
            }

        } else if (msg.type === "end") {
            const node = document.getElementById("streaming-bubble");
            if (node) {
                const finalText = node.dataset.raw || "";
                // Persist completed message into session memory
                chatSessionsMemory[activeSessionId].push({
                    text: finalText,
                    classType: "ai-align"
                });
                // Clean up streaming marker attributes
                node.removeAttribute("id");
                node.removeAttribute("data-raw");
            }
            isStreaming = false;
            submitBtn.disabled = false;
            queryInput.disabled = false;

        } else if (msg.type === "error") {
            const node = document.getElementById("streaming-bubble");
            if (node) {
                node.innerText = `Error: ${msg.data}`;
                node.removeAttribute("id");
            }
            chatSessionsMemory[activeSessionId].push({
                text: `Error: ${msg.data}`,
                classType: "ai-align"
            });
            isStreaming = false;
            submitBtn.disabled = false;
            queryInput.disabled = false;
        }
    };

    chatSocket.onerror = (err) => {
        console.error("WebSocket error:", err);
        const node = document.getElementById("streaming-bubble");
        if (node) {
            node.innerText = "Connection error.";
            node.removeAttribute("id");
        }
        isStreaming = false;
        submitBtn.disabled = false;
        queryInput.disabled = false;
    };

    chatSocket.onclose = () => {
        console.warn("WebSocket closed. Reconnecting in 2s...");
        // Auto-reconnect after a short delay
        setTimeout(connectWebSocket, 2000);
    };
}

async function restoreSessionsFromBackend() {
    statusDisplay.innerText = "Restoring your session...";
    try {
        const res = await fetch(`${HOST}/history/${CURRENT_USER_ID}`);
        const data = await res.json();

        if (data.has_pdf) {
            queryInput.disabled = false;
            submitBtn.disabled = false;
            statusDisplay.innerText = "✅ Document ready. Your session has been restored.";
        } else {
            statusDisplay.innerText = "Upload a PDF to get started.";
        }

        const sessions = data.sessions;

        if (Object.keys(sessions).length === 0) {
            activeSessionId = generateUUID();
            chatSessionsMemory[activeSessionId] = [
                { text: "Hello! Upload a PDF to get started.", classType: "ai-align" }
            ];
        } else {
            Object.entries(sessions).forEach(([sid, messages]) => {
                chatSessionsMemory[sid] = messages.map(m => ({
                    text: m.text,
                    classType: m.sender === "user" ? "user-align" : "ai-align"
                }));
            });
            activeSessionId = Object.keys(sessions)[Object.keys(sessions).length - 1];
        }

        renderSessionsSidebar();
        switchActiveSession(activeSessionId);

    } catch (err) {
        statusDisplay.innerText = "❌ Could not connect to backend.";
        activeSessionId = generateUUID();
        chatSessionsMemory[activeSessionId] = [
            { text: "Hello! Upload a PDF to get started.", classType: "ai-align" }
        ];
        renderSessionsSidebar();
        switchActiveSession(activeSessionId);
    }
}

function renderSessionsSidebar() {
    sessionsListContainer.innerHTML = "";
    Object.keys(chatSessionsMemory).forEach((sessionId, index) => {
        const item = document.createElement("div");
        item.className = `session-item ${sessionId === activeSessionId ? 'active-session' : ''}`;

        const label = document.createElement("span");
        label.innerText = `Chat Session ${index + 1}`;
        label.onclick = () => switchActiveSession(sessionId);

        const deleteBtn = document.createElement("button");
        deleteBtn.innerText = "✕";
        deleteBtn.className = "delete-session-btn";
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            deleteSession(sessionId);
        };

        item.appendChild(label);
        item.appendChild(deleteBtn);
        sessionsListContainer.appendChild(item);
    });
}

async function deleteSession(sessionId) {
    if (!confirm("Delete this session? This cannot be undone.")) return;

    try {
        const response = await fetch(`${HOST}/session/${sessionId}`, { method: "DELETE" });

        if (response.ok) {
            delete chatSessionsMemory[sessionId];

            if (activeSessionId === sessionId) {
                const remaining = Object.keys(chatSessionsMemory);
                if (remaining.length > 0) {
                    switchActiveSession(remaining[remaining.length - 1]);
                } else {
                    createNewSession();
                }
            } else {
                renderSessionsSidebar();
            }
        } else {
            alert("Failed to delete session.");
        }
    } catch (err) {
        alert("Connection error while deleting session.");
    }
}

function createNewSession() {
    const newId = generateUUID();
    chatSessionsMemory[newId] = [
        { text: "New session started. Ask away!", classType: "ai-align" }
    ];
    switchActiveSession(newId);
}

function switchActiveSession(sessionId) {
    activeSessionId = sessionId;
    renderSessionsSidebar();
    viewport.innerHTML = "";
    chatSessionsMemory[activeSessionId].forEach(msg => {
        const domNode = document.createElement("div");
        domNode.className = `chat-bubble ${msg.classType}`;
        domNode.innerHTML = msg.text
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\n/g, '<br>');
        viewport.appendChild(domNode);
    });
    viewport.scrollTop = viewport.scrollHeight;
}

async function processPDF() {
    const picker = document.getElementById("pdfFileInput");
    if (!picker.files[0]) return alert("Select a PDF file first.");

    statusDisplay.innerText = "Indexing document...";
    document.getElementById("uploadBtn").disabled = true;

    const packet = new FormData();
    packet.append("file", picker.files[0]);
    packet.append("user_id", CURRENT_USER_ID);

    try {
        const response = await fetch(`${HOST}/upload`, { method: "POST", body: packet });
        const meta = await response.json();

        if (response.ok) {
            statusDisplay.innerText = `✅ Loaded: ${picker.files[0].name}`;
            queryInput.disabled = false;
            submitBtn.disabled = false;
        } else {
            statusDisplay.innerText = `❌ Upload failed: ${meta.detail}`;
        }
    } catch (err) {
        statusDisplay.innerText = "❌ Could not reach backend.";
    } finally {
        document.getElementById("uploadBtn").disabled = false;
    }
}

async function handleQuerySubmission() {
    if (isStreaming) return;

    const text = queryInput.value.trim();
    if (!text) return;

    // Guard: block if WebSocket isn't open
    if (!chatSocket || chatSocket.readyState !== WebSocket.OPEN) {
        alert("Connection not ready. Please wait a moment and try again.");
        return;
    }

    isStreaming = true;
    submitBtn.disabled = true;
    queryInput.disabled = true;

    // Render user bubble immediately
    chatSessionsMemory[activeSessionId].push({ text, classType: "user-align" });
    appendBubble(text, "user-align", null);
    queryInput.value = "";

    // Create a placeholder streaming bubble with a fixed ID
    const streamNode = document.createElement("div");
    streamNode.className = "chat-bubble ai-align";
    streamNode.id = "streaming-bubble";
    streamNode.dataset.raw = "";
    streamNode.innerHTML = "Thinking...";
    viewport.appendChild(streamNode);
    viewport.scrollTop = viewport.scrollHeight;

    // Send payload over the persistent WebSocket
    chatSocket.send(JSON.stringify({
        user_id: CURRENT_USER_ID,
        session_id: activeSessionId,
        message: text
    }));
}

function appendBubble(messageText, sideTokenClass, customId) {
    const domNode = document.createElement("div");
    domNode.className = `chat-bubble ${sideTokenClass}`;
    if (customId) domNode.id = customId;
    domNode.innerHTML = messageText
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\n/g, '<br>');
    viewport.appendChild(domNode);
    viewport.scrollTop = viewport.scrollHeight;
}

// Boot
connectWebSocket();
restoreSessionsFromBackend();