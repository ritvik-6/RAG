// socket.js — WebSocket connection + streaming handler
import { renderMarkdown, parseCitations } from './utils.js';
import { onStreamStart, onStreamToken, onStreamEnd, onStreamError } from './sessions.js';

const WS_HOST = "ws://localhost:8000";
let chatSocket = null;

export function connectWebSocket() {
    chatSocket = new WebSocket(`${WS_HOST}/ws/chat`);

    chatSocket.onopen = () => {
        console.log("WebSocket connected.");
    };

    chatSocket.onmessage = (event) => {
        const msg = JSON.parse(event.data);

        if (msg.type === "start") {
            onStreamStart();
        } else if (msg.type === "token") {
            onStreamToken(msg.data);
        } else if (msg.type === "end") {
            onStreamEnd();
        } else if (msg.type === "error") {
            onStreamError(msg.data);
        }
    };

    chatSocket.onerror = (err) => {
        console.error("WebSocket error:", err);
        onStreamError("Connection error. Please try again.");
    };

    chatSocket.onclose = () => {
        console.warn("WebSocket closed. Reconnecting in 2s...");
        setTimeout(connectWebSocket, 2000);
    };
}

export function sendMessage(payload) {
    if (!chatSocket || chatSocket.readyState !== WebSocket.OPEN) {
        return false;
    }
    chatSocket.send(JSON.stringify(payload));
    return true;
}

export function isSocketReady() {
    return chatSocket && chatSocket.readyState === WebSocket.OPEN;
}