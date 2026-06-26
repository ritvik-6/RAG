// sessions.js — Session CRUD, sidebar rendering, streaming state
import { renderMarkdown, parseCitations } from './utils.js';
import { renderCitationList } from './citations.js';

const HOST = "http://localhost:8000";

const viewport = document.getElementById('messages-viewport');
const queryInput = document.getElementById('queryConsole');
const submitBtn = document.getElementById('submitBtn');
const statusDisplay = document.getElementById('runtimeStatus');
const sessionsListContainer = document.getElementById('sessionsList');

export let activeSessionId = null;
export function getActiveSessionId() { return activeSessionId; }
export let chatSessionsMemory = {};
export let isStreaming = false;

// ─── Streaming Handlers ───────────────────────────────────────────────────────

export function onStreamStart() {
    // Reset is done when bubble is created in app.js before sending
}

export function onStreamToken(token) {
    const node = document.getElementById('streaming-bubble');
    if (!node) return;
    node.dataset.raw = (node.dataset.raw || '') + token;
    // Strip citation markers for live preview — they'll render on end
    const preview = node.dataset.raw.replace(/\[\[cite:[^\]]+\]\]/g, '');
    node.innerHTML = renderMarkdown(preview);
    viewport.scrollTop = viewport.scrollHeight;
}

export function onStreamEnd() {
    const node = document.getElementById('streaming-bubble');
    if (!node) return;

    const rawText = node.dataset.raw || '';
    const { cleanText, citations } = parseCitations(rawText);

    // Render final bubble content with inline citation superscripts
    node.innerHTML = renderMarkdown(cleanText);
    node.removeAttribute('id');
    node.removeAttribute('data-raw');

    // Render citation list below the bubble
    renderCitationList(citations, node);

    // Store in memory (raw text for persistence, clean for display)
    chatSessionsMemory[activeSessionId].push({
        text: rawText,
        classType: 'ai-align'
    });

    _unlockInput();
}

export function onStreamError(message) {
    const node = document.getElementById('streaming-bubble');
    if (node) {
        node.innerText = `Error: ${message}`;
        node.removeAttribute('id');
        node.removeAttribute('data-raw');
    }
    chatSessionsMemory[activeSessionId].push({
        text: `Error: ${message}`,
        classType: 'ai-align'
    });
    _unlockInput();
}

// ─── Session Management ───────────────────────────────────────────────────────

export function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

export async function restoreSessionsFromBackend(userId) {
    statusDisplay.innerText = 'Restoring conversation state...';
    try {
        const res = await fetch(`${HOST}/history/${userId}`);
        if (!res.ok) throw new Error('History fetch failed.');

        const data = await res.json();

        if (data.has_pdf) {
            queryInput.disabled = false;
            submitBtn.disabled = false;
            statusDisplay.innerText = '✅ Documents ready. Ask anything.';
        } else {
            statusDisplay.innerText = 'Upload a PDF to get started.';
        }

        const sessions = data.sessions;

        if (Object.keys(sessions).length === 0) {
            activeSessionId = generateUUID();
            chatSessionsMemory[activeSessionId] = [
                { text: 'Hello! Upload a PDF to get started.', classType: 'ai-align' }
            ];
        } else {
            Object.entries(sessions).forEach(([sid, messages]) => {
                chatSessionsMemory[sid] = messages.map(m => ({
                    text: m.text,
                    classType: m.sender === 'user' ? 'user-align' : 'ai-align'
                }));
            });
            activeSessionId = Object.keys(sessions)[Object.keys(sessions).length - 1];
        }

        renderSessionsSidebar();
        switchActiveSession(activeSessionId);

    } catch (err) {
        console.error('History restoration failed:', err);
        statusDisplay.innerText = '❌ Offline mode. Cannot reach backend.';
        activeSessionId = generateUUID();
        chatSessionsMemory[activeSessionId] = [
            { text: 'Hello! Upload a PDF to get started.', classType: 'ai-align' }
        ];
        renderSessionsSidebar();
        switchActiveSession(activeSessionId);
    }
}

export function createNewSession() {
    const newId = generateUUID();
    // Session is created locally — it will be persisted on first message sent
    chatSessionsMemory[newId] = [
        { text: 'New session started. Ask away!', classType: 'ai-align' }
    ];
    switchActiveSession(newId);
}

export function switchActiveSession(sessionId) {
    activeSessionId = sessionId;
    renderSessionsSidebar();
    viewport.innerHTML = '';

    chatSessionsMemory[activeSessionId].forEach(msg => {
        const bubble = _createBubble(msg.text, msg.classType);
        viewport.appendChild(bubble);

        // Re-render citations for restored AI messages
        if (msg.classType === 'ai-align') {
            const { citations } = parseCitations(msg.text);
            if (citations.length > 0) {
                renderCitationList(citations, bubble);
            }
        }
    });

    viewport.scrollTop = viewport.scrollHeight;
}

export async function deleteSession(sessionId) {
    if (!confirm('Delete this session? This cannot be undone.')) return;

    try {
        const response = await fetch(`${HOST}/session/${sessionId}`, { method: 'DELETE' });
        if (response.ok) {
            delete chatSessionsMemory[sessionId];
            const remaining = Object.keys(chatSessionsMemory);
            if (activeSessionId === sessionId) {
                if (remaining.length > 0) {
                    switchActiveSession(remaining[remaining.length - 1]);
                } else {
                    createNewSession();
                }
            } else {
                renderSessionsSidebar();
            }
        } else {
            alert('Failed to delete session.');
        }
    } catch {
        alert('Connection error while deleting session.');
    }
}

export function renderSessionsSidebar() {
    sessionsListContainer.innerHTML = '';
    Object.keys(chatSessionsMemory).forEach((sessionId, index) => {
        const item = document.createElement('div');
        item.className = `session-item ${sessionId === activeSessionId ? 'active-session' : ''}`;

        const label = document.createElement('span');
        label.innerText = `Chat Session ${index + 1}`;
        label.onclick = () => switchActiveSession(sessionId);

        const deleteBtn = document.createElement('button');
        deleteBtn.innerText = '✕';
        deleteBtn.className = 'delete-session-btn';
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            deleteSession(sessionId);
        };

        item.appendChild(label);
        item.appendChild(deleteBtn);
        sessionsListContainer.appendChild(item);
    });
}

// ─── Bubble Factory ───────────────────────────────────────────────────────────

export function createStreamingBubble() {
    const node = document.createElement('div');
    node.className = 'chat-bubble ai-align';
    node.id = 'streaming-bubble';
    node.dataset.raw = ''; // Always reset raw on creation
    node.innerHTML = '<span class="thinking-dots">Thinking<span>.</span><span>.</span><span>.</span></span>';
    viewport.appendChild(node);
    viewport.scrollTop = viewport.scrollHeight;
    return node;
}

export function appendUserBubble(text) {
    const bubble = _createBubble(text, 'user-align');
    viewport.appendChild(bubble);
    viewport.scrollTop = viewport.scrollHeight;
}

// ─── Internal Helpers ─────────────────────────────────────────────────────────

function _createBubble(text, classType) {
    const node = document.createElement('div');
    node.className = `chat-bubble ${classType}`;
    // For AI messages, parse citations out before rendering markdown
    if (classType === 'ai-align') {
        const { cleanText } = parseCitations(text);
        node.innerHTML = renderMarkdown(cleanText);
    } else {
        node.innerHTML = renderMarkdown(text);
    }
    return node;
}

function _unlockInput() {
    isStreaming = false;
    submitBtn.disabled = false;
    queryInput.disabled = false;
}

// Re-export setter so app.js can flip isStreaming
export function setStreaming(val) {
    isStreaming = val;
    submitBtn.disabled = val;
    queryInput.disabled = val;
}