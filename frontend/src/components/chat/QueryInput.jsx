import { useState } from 'react';
import { flushSync } from 'react-dom';
import { useSessionStore } from '../../stores/sessionStore';
import { useUiStore } from '../../stores/uiStore';
import { useWebSocket } from '../../hooks/useWebSocket';
import { getUserId } from '../../lib/userId';
import { SendHorizontal } from 'lucide-react';

export function QueryInput() {
  const [text, setText] = useState('');
  const isStreaming = useSessionStore((s) => s.isStreaming);
  const setStreaming = useSessionStore((s) => s.setStreaming);
  const getActiveSessionId = useSessionStore((s) => s.getActiveSessionId);
  const appendUserMessage = useSessionStore((s) => s.appendUserMessage);
  const inputEnabled = useUiStore((s) => s.inputEnabled);
  const { isReady, sendMessage } = useWebSocket();

  const handleQuerySubmission = () => {
    if (isStreaming) return;

    const trimmed = text.trim();
    if (!trimmed) return;

    if (!isReady) {
      alert('Connection not ready. Please wait a moment.');
      return;
    }

    const sessionId = getActiveSessionId();

    flushSync(() => {
      setStreaming(true);
      appendUserMessage(sessionId, trimmed);
      setText('');
    });

    sendMessage({
      user_id: getUserId(),
      session_id: sessionId,
      message: trimmed,
    });
  };

  const disabled = !inputEnabled || isStreaming;

  return (
    <div id="input-dock" className="input-dock">
      <input
        type="text"
        id="queryConsole"
        placeholder="Ask something about your documents..."
        disabled={disabled}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleQuerySubmission();
        }}
      />
      <button
        id="submitBtn"
        type="button"
        disabled={disabled}
        onClick={handleQuerySubmission}
        className="flex items-center justify-center"
        title="Send query"
      >
        <SendHorizontal size={18} />
      </button>
    </div>
  );
}
