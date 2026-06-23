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
let chatSocket = null;
let isStreaming = false;

function connectWebSocket() {
    chatSocket = new WebSocket(`${WS_HOST}/ws/chat`);

    chatSocket.onopen = () => {
        console.log("WebSocket connected smoothly.");
    };

    chatSocket.onmessage = (event) => {
        const msg = JSON.parse(event.data);

        if (msg.type === "start") {
            const streamNode = document.getElementById("streaming-bubble");
            if (streamNode) {
                streamNode.innerHTML = "";
            }
        } else if (msg.type === "token") {
            const node = document.getElementById("streaming-bubble");
            if (node) {
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
                chatSessionsMemory[activeSessionId].push({
                    text: finalText,
                    classType: "ai-align"
                });
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
        console.error("WebSocket network fault encountered:", err);
        isStreaming = false;
        submitBtn.disabled = false;
        queryInput.disabled = false;
    };

    chatSocket.onclose = () => {
        console.warn("WebSocket dropped or closed by server. Reconnecting in 2s...");
        setTimeout(connectWebSocket, 2000);
    };
}

async function restoreSessionsFromBackend() {
    statusDisplay.innerText = "Restoring active conversation state...";
    try {
        const res = await fetch(`${HOST}/history/${CURRENT_USER_ID}`);
        if (!res.ok) throw new Error("Server configuration fault or history database trace crashed.");
        
        const data = await res.json();

        if (data.has_pdf) {
            queryInput.disabled = false;
            submitBtn.disabled = false;
            statusDisplay.innerText = "✅ System mapped. Your document stack is ready.";
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
        console.error("History restoration dropped:", err);
        statusDisplay.innerText = "❌ Offline mode. Cannot communicate with data layer nodes.";
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

async function fetchAndRenderDocumentCatalog() {
    const docContainer = document.getElementById("documentsList");
    if (!docContainer) return;

    try {
        const response = await fetch(`${HOST}/documents/${CURRENT_USER_ID}`);
        if (!response.ok) throw new Error("Could not fetch active workspace documents list mapping.");
        
        const documents = await response.json();
        docContainer.innerHTML = "";

        if (documents.length === 0) {
            docContainer.innerHTML = `<div style="font-size: 12px; color: #64748b; padding: 5px;">No active documents in workspace ledger.</div>`;
            return;
        }

        documents.forEach((doc) => {
            const rowItem = document.createElement("div");
            rowItem.className = "session-item"; 
            rowItem.style.display = "flex";
            rowItem.style.justifyContent = "space-between";
            rowItem.style.alignItems = "center";
            rowItem.style.padding = "6px 8px";
            rowItem.style.marginBottom = "4px";
            rowItem.style.background = "#f1f5f9";
            rowItem.style.borderRadius = "4px";

            const fileLabel = document.createElement("span");
            fileLabel.innerText = doc.filename;
            fileLabel.style.fontSize = "13px";
            fileLabel.style.whiteSpace = "nowrap";
            fileLabel.style.overflow = "hidden";
            fileLabel.style.textOverflow = "ellipsis";
            fileLabel.style.maxWidth = "80%";
            fileLabel.title = doc.filename; 

            const dropButton = document.createElement("button");
            dropButton.innerText = "✕";
            dropButton.className = "delete-session-btn";
            dropButton.style.border = "none";
            dropButton.style.background = "none";
            dropButton.style.color = "#ef4444";
            dropButton.style.cursor = "pointer";
            dropButton.onclick = async (e) => {
                e.stopPropagation();
                await executeDocumentPurgeSequence(doc.document_id);
            };

            rowItem.appendChild(fileLabel);
            rowItem.appendChild(dropButton);
            docContainer.appendChild(rowItem);
        });

    } catch (faultError) {
        console.error("Failed to build documents UI lists maps views:", faultError);
    }
}

async function executeDocumentPurgeSequence(documentId) {
    if (!confirm("Are you sure you want to permanently delete this document from the database, vector storage, and physical disk layers?")) return;

    try {
        const executionPass = await fetch(`${HOST}/documents/${documentId}`, { method: "DELETE" });
        if (executionPass.ok) {
            alert("Document asset completely purged from enterprise system boundaries.");
            await fetchAndRenderDocumentCatalog();
            
            // Re-verify if any documents remain to toggle input buttons safely without resetting session history
            const verifyRes = await fetch(`${HOST}/documents/${CURRENT_USER_ID}`);
            const remainingDocs = await verifyRes.json();
            if (remainingDocs.length === 0) {
                queryInput.disabled = true;
                submitBtn.disabled = true;
                statusDisplay.innerText = "Upload a PDF to get started.";
            }
        } else {
            alert("Administrative failure occurred while dropping database nodes.");
        }
    } catch (pipelineErr) {
        alert("Network processing fault during document removal sequence.");
    }
}

async function triggerBatchUploadSequence() {
    const selector = document.getElementById('batch-pdf-uploader');
    if (!selector) {
        console.error("CRITICAL ERROR: Input element 'batch-pdf-uploader' is missing from the page.");
        return;
    }
    
    const selectedFiles = selector.files;
    if (selectedFiles.length === 0) {
        alert("Please highlight or select at least one PDF file first.");
        return;
    }

    const uploadButton = document.querySelector(".upload-control-panel button");
    if (uploadButton) uploadButton.disabled = true;
    
    statusDisplay.innerText = `Ingesting block of ${selectedFiles.length} files...`;

    for (const activeFile of selectedFiles) {
        const structuralForm = new FormData();
        structuralForm.append("file", activeFile);
        structuralForm.append("user_id", CURRENT_USER_ID); 

        try {
            console.log(`Pushing asset payload: ${activeFile.name}`);
            const apiResponse = await fetch(`${HOST}/upload`, {
                method: "POST",
                body: structuralForm
            });

            if (!apiResponse.ok) {
                const structuralError = await apiResponse.json();
                console.error(`Fault data returned for ${activeFile.name}:`, structuralError.detail);
                alert(`Error uploading ${activeFile.name}: ${structuralError.detail}`);
                continue;
            }

            const feedbackData = await apiResponse.json();
            console.log(`Server catalog successfully resolved for: ${activeFile.name}`, feedbackData);
        } catch (networkError) {
            console.error(`Network communication bridge failed for ${activeFile.name}:`, networkError);
        }
    }

    alert("Batch metadata processing sequence completed successfully.");
    selector.value = ""; 
    if (uploadButton) uploadButton.disabled = false;
    
    // FIXED: Render the files list and unlock input controls directly WITHOUT resetting session views
    await fetchAndRenderDocumentCatalog();
    queryInput.disabled = false;
    submitBtn.disabled = false;
    statusDisplay.innerText = "✅ System mapped. Your document stack is ready.";
}

window.triggerBatchUploadSequence = triggerBatchUploadSequence;
window.createNewSession = createNewSession;
window.handleQuerySubmission = handleQuerySubmission;
window.fetchAndRenderDocumentCatalog = fetchAndRenderDocumentCatalog;
window.executeDocumentPurgeSequence = executeDocumentPurgeSequence;

async function handleQuerySubmission() {
    if (isStreaming) return;

    const text = queryInput.value.trim();
    if (!text) return;

    if (!chatSocket || chatSocket.readyState !== WebSocket.OPEN) {
        alert("Connection loop handshake is unready. Please allow a brief moment.");
        return;
    }

    isStreaming = true;
    submitBtn.disabled = true;
    queryInput.disabled = true;

    chatSessionsMemory[activeSessionId].push({ text, classType: "user-align" });
    appendBubble(text, "user-align", null);
    queryInput.value = "";

    const streamNode = document.createElement("div");
    streamNode.className = "chat-bubble ai-align";
    streamNode.id = "streaming-bubble";
    streamNode.dataset.raw = "";
    streamNode.innerHTML = "Thinking...";
    viewport.appendChild(streamNode);
    viewport.scrollTop = viewport.scrollHeight;

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

connectWebSocket();
restoreSessionsFromBackend();
fetchAndRenderDocumentCatalog();