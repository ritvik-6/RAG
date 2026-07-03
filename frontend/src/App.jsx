import { useEffect, useState } from 'react';
import { Routes, Route, useNavigate, useParams } from 'react-router-dom';
import { getUserId } from './lib/userId';
import { useSessionStore } from './stores/sessionStore';
import { useDocumentStore } from './stores/documentStore';
import { useUiStore } from './stores/uiStore';
import { Sidebar } from './components/layout/Sidebar';
import { SidebarToggle } from './components/layout/SidebarToggle';
import { ChatCanvas } from './components/layout/ChatCanvas';
import { PdfViewerPanel } from './components/pdf/PdfViewerPanel';
import { ErrorBoundary } from './components/error/ErrorBoundary';
import { useWebSocket } from './hooks/useWebSocket';
import { chatService } from './services/chatService';

function MainLayout() {
  useWebSocket();
  const userId = getUserId();
  const navigate = useNavigate();
  const { threadId } = useParams();

  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const sessionMetadata = useSessionStore((s) => s.sessionMetadata);
  const getActiveSessionId = useSessionStore((s) => s.getActiveSessionId);
  const restoreSessionsFromBackend = useSessionStore((s) => s.restoreSessionsFromBackend);
  const createNewSession = useSessionStore((s) => s.createNewSession);
  const switchActiveSession = useSessionStore((s) => s.switchActiveSession);
  const updateSessionThreadId = useSessionStore((s) => s.updateSessionThreadId);
  const fetchAndRenderDocumentCatalog = useDocumentStore((s) => s.fetchAndRenderDocumentCatalog);
  const setRuntimeStatus = useUiStore((s) => s.setRuntimeStatus);
  const setInputEnabled = useUiStore((s) => s.setInputEnabled);

  const [historyLoaded, setHistoryLoaded] = useState(false);

  // 1. Initial restoration — pass the URL's threadId so the correct
  // session is selected on the very first render, no race with effect #3.
  useEffect(() => {
    setRuntimeStatus('Restoring conversation state...');

    restoreSessionsFromBackend(userId, threadId, {
      onHasPdf: () => {
        setInputEnabled(true);
        setRuntimeStatus('✅ Documents ready. Ask anything.');
        setHistoryLoaded(true);
      },
      onNoPdf: () => {
        setRuntimeStatus('Upload a PDF to get started.');
        setHistoryLoaded(true);
      },
      onOffline: () => {
        setRuntimeStatus('❌ Offline mode. Cannot reach backend.');
        setHistoryLoaded(true);
      },
    });

    fetchAndRenderDocumentCatalog(userId).catch((err) => {
      console.error('Failed to load document catalog:', err);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, restoreSessionsFromBackend, fetchAndRenderDocumentCatalog, setRuntimeStatus, setInputEnabled]);

  // 2. Map URL param threadId back to sessionId (handles back/forward nav
  // and stale/invalid links after the initial load).
  useEffect(() => {
    if (!historyLoaded) return;

    if (threadId) {
      const sessionId = Object.keys(sessionMetadata).find(
        (sid) => sessionMetadata[sid]?.thread_id === threadId
      );
      if (sessionId) {
        if (activeSessionId !== sessionId) {
          switchActiveSession(sessionId);
        }
      } else {
        navigate('/', { replace: true });
      }
    } else {
      const nullSessionId = Object.keys(sessionMetadata).find(
        (sid) => sessionMetadata[sid]?.thread_id === null
      );
      if (nullSessionId) {
        if (activeSessionId !== nullSessionId) {
          switchActiveSession(nullSessionId);
        }
      } else {
        createNewSession();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyLoaded, threadId]);

  // 3. Central listener to sync active session changes back to browser URL
  useEffect(() => {
    if (!historyLoaded || !activeSessionId) return;

    const metadata = sessionMetadata[activeSessionId];
    if (metadata) {
      if (metadata.thread_id) {
        if (threadId !== metadata.thread_id) {
          navigate(`/chat/${metadata.thread_id}`);
        }
      } else {
        if (threadId) {
          navigate('/');
        }
      }
    }
  }, [activeSessionId, sessionMetadata, threadId, historyLoaded, navigate]);

  // 4. Listen to WebSocket start events to capture newly generated thread_ids
  useEffect(() => {
    const unsubscribe = chatService.subscribe((event, data) => {
      if (event === 'start' && data) {
        const activeId = getActiveSessionId();
        if (activeId) {
          updateSessionThreadId(activeId, data);
        }
      }
    });
    return unsubscribe;
  }, [updateSessionThreadId, getActiveSessionId]);

  return (
    <div className="flex h-screen overflow-hidden w-full">
      <Sidebar userId={userId} />
      <ChatCanvas />
      <ErrorBoundary name="PDF Viewer">
        <PdfViewerPanel />
      </ErrorBoundary>
    </div>
  );
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<MainLayout />} />
      <Route path="/chat/:threadId" element={<MainLayout />} />
    </Routes>
  );
}

export default App;