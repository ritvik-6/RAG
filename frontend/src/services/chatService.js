import { websocketService } from './websocketService';

/**
 * ChatService — bridges UI concerns and the WebSocket transport.
 * Preserves the message protocol from frontend/js/socket.js + sessions.js.
 */
class ChatService {
  constructor(ws) {
    this.ws = ws;
    this.subscribers = new Set();
    this._unsubscribe = null;
  }

  init() {
    if (this._unsubscribe) return;
    this._unsubscribe = this.ws.onMessage((msg) => this._dispatch(msg));
    this._unsubscribeError = this.ws.onError(() => {
      this._notify('error', 'Connection error. Please try again.');
    });
  }

  _dispatch(msg) {
    if (msg.type === 'start') {
      this._notify('start', { sessionId: msg.session_id, threadId: msg.thread_id });
    } else if (msg.type === 'token') {
      this._notify('token', { sessionId: msg.session_id, data: msg.data });
    } else if (msg.type === 'end') {
      this._notify('end', { sessionId: msg.session_id, latencyMs: msg.latency_ms });
    } else if (msg.type === 'error') {
      this._notify('error', { sessionId: msg.session_id, data: msg.data });
    } else if (msg.type === "status") {
      this._notify("status", {sessionId: msg.session_id,data: msg.data,});
    }else if (msg.type === 'citation_chunks') {
      this._notify('citation_chunks', { sessionId: msg.session_id, data: msg.data });
    }
  }

  _notify(event, data) {
    this.subscribers.forEach((handler) => handler(event, data));
  }

  subscribe(handler) {
    this.subscribers.add(handler);
    return () => this.subscribers.delete(handler);
  }

  sendMessage(payload) {
    return this.ws.send(payload);
  }

  isReady() {
    return this.ws.isReady();
  }

  connect() {
    this.init();
    this.ws.connect();
  }
}

export const chatService = new ChatService(websocketService);
