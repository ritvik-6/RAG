import { ErrorBoundary } from '../error/ErrorBoundary';
import { UploadPanel } from '../documents/UploadPanel';
import { DocumentList } from '../documents/DocumentList';
import { SessionList } from '../sessions/SessionList';
import { useSessionStore } from '../../stores/sessionStore';
import { useUiStore } from '../../stores/uiStore';

export function Sidebar({ userId }) {
  const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed);
  const runtimeStatus = useUiStore((s) => s.runtimeStatus);
  const createNewSession = useSessionStore((s) => s.createNewSession);

  return (
    <aside id="sidebar" className={sidebarCollapsed ? 'collapsed' : ''}>
      <h2>RAG Agent</h2>
      <p className="sidebar-subtitle">Upload PDFs to build your document context.</p>

      <ErrorBoundary name="Upload">
        <UploadPanel userId={userId} />
      </ErrorBoundary>

      <div id="runtimeStatus" className="status-txt">
        {runtimeStatus}
      </div>

      <div className="docs-header">
        <h3>Documents</h3>
      </div>
      <div id="documentsList" className="docs-container">
        <ErrorBoundary name="Documents">
          <DocumentList userId={userId} />
        </ErrorBoundary>
      </div>

      <hr className="divider" />

      <div className="sessions-header">
        <h3>💬 Chat Sessions</h3>
        <button type="button" className="new-chat-btn" onClick={createNewSession}>
          + New
        </button>
      </div>
      <div id="sessionsList" className="sessions-container">
        <ErrorBoundary name="Sessions">
          <SessionList />
        </ErrorBoundary>
      </div>
    </aside>
  );
}
