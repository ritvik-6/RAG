import { useSessionStore } from '../../stores/sessionStore';
import { SessionItem } from './SessionItem';

export function SessionList() {
  const chatSessionsMemory = useSessionStore((s) => s.chatSessionsMemory);
  const sessionMetadata = useSessionStore((s) => s.sessionMetadata);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const switchActiveSession = useSessionStore((s) => s.switchActiveSession);
  const deleteSession = useSessionStore((s) => s.deleteSession);
  const renameSession = useSessionStore((s) => s.renameSession);

  const sessionIds = Object.keys(chatSessionsMemory);

  const handleDelete = async (sessionId) => {
    if (!confirm('Delete this session? This cannot be undone.')) return;
    try {
      await deleteSession(sessionId);
    } catch {
      alert('Connection error while deleting session.');
    }
  };

  return (
    <>
      {sessionIds.map((sessionId, index) => {
        const metadata = sessionMetadata[sessionId];
        const sessionName = metadata?.session_name || `Chat Session ${index + 1}`;
        
        return (
          <SessionItem
            key={sessionId}
            sessionName={sessionName}
            isActive={sessionId === activeSessionId}
            onSelect={() => switchActiveSession(sessionId)}
            onDelete={(e) => {
              e.stopPropagation();
              handleDelete(sessionId);
            }}
            onRename={(newName) => {
              renameSession(sessionId, newName);
            }}
          />
        );
      })}
    </>
  );
}

