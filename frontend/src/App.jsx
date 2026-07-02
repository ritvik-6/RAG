import { useEffect } from 'react';
import { getUserId } from './lib/userId';
import { useSessionStore } from './stores/sessionStore';
import { useDocumentStore } from './stores/documentStore';
import { useUiStore } from './stores/uiStore';
import { Sidebar } from './components/layout/Sidebar';
import { ChatCanvas } from './components/layout/ChatCanvas';
import { PdfViewerPanel } from './components/pdf/PdfViewerPanel';
import { ErrorBoundary } from './components/error/ErrorBoundary';
import { useWebSocket } from './hooks/useWebSocket';

function App() {
  useWebSocket();
  const userId = getUserId();
  const restoreSessionsFromBackend = useSessionStore((s) => s.restoreSessionsFromBackend);
  const fetchAndRenderDocumentCatalog = useDocumentStore((s) => s.fetchAndRenderDocumentCatalog);
  const setRuntimeStatus = useUiStore((s) => s.setRuntimeStatus);
  const setInputEnabled = useUiStore((s) => s.setInputEnabled);

  useEffect(() => {
    setRuntimeStatus('Restoring conversation state...');

    restoreSessionsFromBackend(userId, {
      onHasPdf: () => {
        setInputEnabled(true);
        setRuntimeStatus('✅ Documents ready. Ask anything.');
      },
      onNoPdf: () => {
        setRuntimeStatus('Upload a PDF to get started.');
      },
      onOffline: () => {
        setRuntimeStatus('❌ Offline mode. Cannot reach backend.');
      },
    });

    fetchAndRenderDocumentCatalog(userId).catch((err) => {
      console.error('Failed to load document catalog:', err);
    });
  }, [userId, restoreSessionsFromBackend, fetchAndRenderDocumentCatalog, setRuntimeStatus, setInputEnabled]);

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

export default App;
