import { useEffect } from 'react';
import { chatService } from '../../services/chatService';
import { useSessionStore } from '../../stores/sessionStore';

export function ChatStreamListener() {
  const appendStreamToken = useSessionStore((s) => s.appendStreamToken);
  const finalizeAiMessage = useSessionStore((s) => s.finalizeAiMessage);
  const finalizeErrorMessage = useSessionStore((s) => s.finalizeErrorMessage);
  const endStream = useSessionStore((s) => s.endStream);
  const setStreamingStatus = useSessionStore((s) => s.setStreamingStatus);

  useEffect(() => {
    const setCitationChunks = useSessionStore.getState().setCitationChunks;
    const unsubscribe = chatService.subscribe((event, payload) => {
      if (event === 'token') {
        appendStreamToken(payload.sessionId, payload.data);
      } else if (event === 'status') {
        setStreamingStatus(payload.data);
      }
      else if (event === 'citation_chunks') {
        setCitationChunks(payload.data);
       }
      else if (event === 'end') {
        const { streamingSessionId, streamingText } = useSessionStore.getState();
        if (payload.sessionId === streamingSessionId) {
          finalizeAiMessage(payload.sessionId, streamingText, payload.latencyMs);
          endStream();
        }
      } else if (event === 'error') {
        const { streamingSessionId } = useSessionStore.getState();
        const sid = payload.sessionId || streamingSessionId;
        if (sid) {
          finalizeErrorMessage(sid, payload.data);
          endStream();
        }
      }
    });
    return unsubscribe;
  }, [appendStreamToken, finalizeAiMessage, finalizeErrorMessage, endStream, setStreamingStatus]);

  return null;
}