const WS_HOST = import.meta.env.VITE_WS_HOST || 'ws://localhost:8000';

class WebSocketService {
  constructor() {
    this.socket = null;
    this.messageHandlers = new Set();
    this.openHandlers = new Set();
    this.closeHandlers = new Set();
    this.errorHandlers = new Set();
    this.reconnectTimer = null;
  }

  connect() {
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.socket = new WebSocket(`${WS_HOST}/ws/chat`);

    this.socket.onopen = () => {
      console.log('WebSocket connected.');
      this.openHandlers.forEach((handler) => handler());
    };

    this.socket.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      this.messageHandlers.forEach((handler) => handler(msg));
    };

    this.socket.onerror = (err) => {
      console.error('WebSocket error:', err);
      this.errorHandlers.forEach((handler) => handler(err));
    };

    this.socket.onclose = () => {
      console.warn('WebSocket closed. Reconnecting in 2s...');
      this.closeHandlers.forEach((handler) => handler());
      this.reconnectTimer = setTimeout(() => this.connect(), 2000);
    };
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      this.socket.onclose = null;
      this.socket.close();
      this.socket = null;
    }
  }

  send(payload) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return false;
    }
    this.socket.send(JSON.stringify(payload));
    return true;
  }

  isReady() {
    return this.socket && this.socket.readyState === WebSocket.OPEN;
  }

  onMessage(handler) {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onOpen(handler) {
    this.openHandlers.add(handler);
    return () => this.openHandlers.delete(handler);
  }

  onClose(handler) {
    this.closeHandlers.add(handler);
    return () => this.closeHandlers.delete(handler);
  }

  onError(handler) {
    this.errorHandlers.add(handler);
    return () => this.errorHandlers.delete(handler);
  }
}

export const websocketService = new WebSocketService();
