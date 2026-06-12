const HOST = "http://127.0.0.1:8000";
const viewport = document.getElementById("messages-viewport");
const queryInput = document.getElementById("queryConsole");
const submitBtn = document.getElementById("submitBtn");
const statusDisplay = document.getElementById("runtimeStatus");
const sessionsListContainer = document.getElementById("sessionsList");

function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// Persist user ID across refreshes
if (!localStorage.getItem("RAG_USER_ID")) {
    localStorage.setItem("RAG_USER_ID", "user_" + Math.random().toString(36).substr(2, 9));
}
const CURRENT_USER_ID = localStorage.getItem("RAG_USER_ID");

let activeSessionId = null;
let chatSessionsMemory = {};

// On page load, restore sessions and history from the backend
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
            // No history — start fresh
            activeSessionId = generateUUID();
            chatSessionsMemory[activeSessionId] = [
                { text: "Hello! Upload a PDF to get started.", classType: "ai-align" }
            ];
        } else {
            // Restore all sessions from DB
            Object.entries(sessions).forEach(([sid, messages]) => {
                chatSessionsMemory[sid] = messages.map(m => ({
                    text: m.text,
                    classType: m.sender === "user" ? "user-align" : "ai-align"
                }));
            });
            // Set most recent session as active
            activeSessionId = Object.keys(sessions)[Object.keys(sessions).length - 1];
        }

        renderSessionsSidebar();
        switchActiveSession(activeSessionId);

    } catch (err) {
        statusDisplay.innerText = "❌ Could not connect to backend.";
        // Fallback: start a blank session
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
            e.stopPropagation(); // prevent switching session when clicking delete
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
        const response = await fetch(`${HOST}/session/${sessionId}`, {
            method: "DELETE"
        });

        if (response.ok) {
            // Remove from local memory
            delete chatSessionsMemory[sessionId];

            // If deleted session was active, switch to another or create new
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
    const text = queryInput.value.trim();
    if (!text) return;

    chatSessionsMemory[activeSessionId].push({ text, classType: "user-align" });
    appendBubble(text, "user-align");
    queryInput.value = "";

    const loaderToken = appendBubble("Thinking...", "ai-align");

    const packet = new FormData();
    packet.append("message", text);
    packet.append("user_id", CURRENT_USER_ID);
    packet.append("session_id", activeSessionId);

    try {
        const response = await fetch(`${HOST}/chat`, { method: "POST", body: packet });
        const data = await response.json();
        const node = document.getElementById(loaderToken);

        if (response.ok) {
            const formatted = data.response
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\n/g, '<br>');
            node.innerHTML = formatted;
            chatSessionsMemory[activeSessionId].push({ text: data.response, classType: "ai-align" });
        } else {
            node.innerText = `Error: ${data.detail}`;
            chatSessionsMemory[activeSessionId].push({ text: `Error: ${data.detail}`, classType: "ai-align" });
        }
    } catch (err) {
        const node = document.getElementById(loaderToken);
        node.innerText = "Connection failed.";
        chatSessionsMemory[activeSessionId].push({ text: "Connection failed.", classType: "ai-align" });
    }
}

function appendBubble(messageText, sideTokenClass) {
    const token = "bubble-" + Date.now() + Math.random().toString(36).substr(2, 4);
    const domNode = document.createElement("div");
    domNode.className = `chat-bubble ${sideTokenClass}`;
    domNode.id = token;
    domNode.innerHTML = messageText
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\n/g, '<br>');
    viewport.appendChild(domNode);
    viewport.scrollTop = viewport.scrollHeight;
    return token;
}

// Boot: restore from backend instead of starting blank
restoreSessionsFromBackend();