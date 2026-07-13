import { useState } from 'react';
import { flushSync } from 'react-dom';
import { useSessionStore } from '../../stores/sessionStore';
import { useUiStore } from '../../stores/uiStore';
import { useWebSocket } from '../../hooks/useWebSocket';
import { getUserId } from '../../lib/userId';
import { SendHorizontal } from 'lucide-react';
import { useToastStore } from '../../stores/toastStore';

export function QueryInput() {
  const [text, setText] = useState('');
  const isStreaming = useSessionStore((s) => s.isStreaming);
  const startStream = useSessionStore((s) => s.startStream);
  const ensureActiveSession = useSessionStore((s) => s.ensureActiveSession);
  const appendUserMessage = useSessionStore((s) => s.appendUserMessage);
  const inputEnabled = useUiStore((s) => s.inputEnabled);
  const { isReady, sendMessage } = useWebSocket();

  const handleQuerySubmission = () => {
    if (isStreaming) return;

    const trimmed = text.trim();
    if (!trimmed) return;

    if (!isReady) {
      useToastStore.getState().addToast('Connection not ready. Please wait a moment.', 'error');
      return;
    }

    // Lazily creates a real session on first send; reuses it otherwise.
    const sessionId = ensureActiveSession();

    flushSync(() => {
      startStream(sessionId);
      appendUserMessage(sessionId, trimmed);
      setText('');
    });;

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
        <SendHorizontal size={14} />
      </button>
    </div>
  );
}