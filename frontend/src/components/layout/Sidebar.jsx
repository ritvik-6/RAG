import { ErrorBoundary } from '../error/ErrorBoundary';
import { UploadPanel } from '../documents/UploadPanel';
import { DocumentList } from '../documents/DocumentList';
import { SessionList } from '../sessions/SessionList';
import { useSessionStore } from '../../stores/sessionStore';
import { useUiStore } from '../../stores/uiStore';
import { MessageSquare, Plus, CircleCheck, CircleAlert } from 'lucide-react';
import { SidebarToggle } from './SidebarToggle';

export function Sidebar({ userId }) {
  const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed);
  const runtimeStatus = useUiStore((s) => s.runtimeStatus);
  const createNewSession = useSessionStore((s) => s.createNewSession);

  return (
    <aside id="sidebar" className={sidebarCollapsed ? 'collapsed' : ''}>
      <div className="sidebar-header">
        <img src="src/assets/logo-black.png" alt="DataFactZ logo" />
        <SidebarToggle />
      </div>
      <h2>RAG Agent</h2>
      <p className="sidebar-subtitle">Upload PDFs to build your document context.</p>

      <ErrorBoundary name="Upload">
        <UploadPanel userId={userId} />
      </ErrorBoundary>

      <div id="runtimeStatus" className="status-txt flex items-center gap-1.5">
        {runtimeStatus.startsWith('✅') ? (
          <>
            <CircleCheck size={18} className="text-emerald-600 shrink-0" />
            <span>{runtimeStatus.replace('✅', '').trim()}</span>
          </>
        ) : runtimeStatus.startsWith('❌') ? (
          <>
            <CircleAlert size={18} className="text-red-500 shrink-0" />
            <span>{runtimeStatus.replace('❌', '').trim()}</span>
          </>
        ) : (
          runtimeStatus
        )}
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
        <h3 className="flex items-center gap-1.5">
          <MessageSquare size={18} className="shrink-0" />
          Chat Sessions
        </h3>
        <button type="button" className="new-chat-btn flex items-center gap-1" onClick={createNewSession}>
          <Plus size={18} className="shrink-0" />
          New
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
