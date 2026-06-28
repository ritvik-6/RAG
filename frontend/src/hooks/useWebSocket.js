import { useEffect, useState, useCallback } from 'react';
import { chatService } from '../services/chatService';
import { websocketService } from '../services/websocketService';

/**
 * Thin React hook over the singleton WebSocket + ChatService stack.
 */
export function useWebSocket() {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    chatService.connect();

    const offOpen = websocketService.onOpen(() => setIsReady(true));
    const offClose = websocketService.onClose(() => setIsReady(false));

    setIsReady(chatService.isReady());

    return () => {
      offOpen();
      offClose();
    };
  }, []);

  const sendMessage = useCallback((payload) => chatService.sendMessage(payload), []);

  return { isReady, sendMessage };
}
