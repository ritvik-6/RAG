import { useState } from 'react';
import { useSessionStore } from '../../stores/sessionStore';
import { SessionItem } from './SessionItem';
import { ConfirmModal } from '../common/ConfirmModal';
import { useToastStore } from '../../stores/toastStore';

export function SessionList() {
  const chatSessionsMemory = useSessionStore((s) => s.chatSessionsMemory);
  const sessionMetadata = useSessionStore((s) => s.sessionMetadata);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const switchActiveSession = useSessionStore((s) => s.switchActiveSession);
  const deleteSession = useSessionStore((s) => s.deleteSession);
  const renameSession = useSessionStore((s) => s.renameSession);

  const sessionOrder = useSessionStore((s) => s.sessionOrder);

  const [deleteSessionId, setDeleteSessionId] = useState(null);
  const addToast = useToastStore((s) => s.addToast);

  const handleDeleteConfirm = async () => {
    if (!deleteSessionId) return;
    try {
      await deleteSession(deleteSessionId);
      addToast("Conversation deleted", "success");
    } catch {
      addToast("Failed to delete conversation", "error");
    } finally {
      setDeleteSessionId(null);
    }
  };

  return (
    <>
      <ConfirmModal
        isOpen={deleteSessionId !== null}
        title="Delete conversation?"
        message="This will permanently delete this chat session. This can't be undone."
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteSessionId(null)}
        confirmLabel="Delete"
        destructive={true}
      />
      {sessionOrder.map((sessionId, index) => {
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
              setDeleteSessionId(sessionId);
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

