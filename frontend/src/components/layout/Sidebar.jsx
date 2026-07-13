import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ErrorBoundary } from '../error/ErrorBoundary';
import { UploadPanel } from '../documents/UploadPanel';
import { DocumentList } from '../documents/DocumentList';
import { SessionList } from '../sessions/SessionList';
import { useSessionStore } from '../../stores/sessionStore';
import { useUiStore } from '../../stores/uiStore';
import { MessageSquare, Plus, CircleCheck, CircleAlert, ChevronDown, ChevronRight } from 'lucide-react';
import { SidebarToggle } from './SidebarToggle';
import logo from '../../assets/logo-black.png';

export function Sidebar({ userId }) {
  const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed);
  const runtimeStatus = useUiStore((s) => s.runtimeStatus);
  const activeSidebarTab = useUiStore((s) => s.activeSidebarTab);
  const createNewSession = useSessionStore((s) => s.createNewSession);
  const navigate = useNavigate();

  // Keep both sections expanded by default
  const [docsExpanded, setDocsExpanded] = useState(true);
  const [sessionsExpanded, setSessionsExpanded] = useState(true);

  return (
    <aside id="sidebar" className={sidebarCollapsed ? 'collapsed' : ''}>
      <div className="sidebar-header">
        <img src={logo} alt="DataFactZ logo" />
      </div>
      <h2>RAG Agent</h2>

      {activeSidebarTab === 'documents' && (
        <>
          <p className="sidebar-subtitle">Upload PDFs to build your document context.</p>
          <ErrorBoundary name="Upload">
            <UploadPanel userId={userId} />
          </ErrorBoundary>
        </>
      )}

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

      <div className="sidebar-scroll-content">
        {/* Documents Section */}
        {activeSidebarTab === 'documents' && (
          <div className="sidebar-section">
            <div
              className="flex items-center gap-1.5 cursor-pointer py-1.5 hover:bg-[var(--border-muted)] rounded px-1.5 select-none transition-colors"
              onClick={() => setDocsExpanded(!docsExpanded)}
            >
              {docsExpanded ? (
                <ChevronDown size={14} className="text-[var(--text-muted)] shrink-0" />
              ) : (
                <ChevronRight size={14} className="text-[var(--text-muted)] shrink-0" />
              )}
              <h3>Documents</h3>
            </div>
            <div className={`sidebar-section-content ${docsExpanded ? 'expanded' : ''}`}>
              <div id="documentsList" className="docs-container">
                <ErrorBoundary name="Documents">
                  <DocumentList userId={userId} />
                </ErrorBoundary>
              </div>
            </div>
          </div>
        )}

        {/* Chat Sessions Section */}
        {activeSidebarTab === 'sessions' && (
          <div className="sidebar-section">
            <div className="sessions-header select-none">
              <div
                className="flex items-center gap-1.5 cursor-pointer py-1.5 hover:bg-[var(--border-muted)] rounded px-1.5 transition-colors"
                onClick={() => setSessionsExpanded(!sessionsExpanded)}
              >
                {sessionsExpanded ? (
                  <ChevronDown size={14} className="text-[var(--text-muted)] shrink-0" />
                ) : (
                  <ChevronRight size={14} className="text-[var(--text-muted)] shrink-0" />
                )}
                <h3 className="flex items-center gap-1.5">
                  <MessageSquare size={14} className="shrink-0 text-[var(--text-muted)]" />
                  Chat Sessions
                </h3>
              </div>
              <button
                type="button"
                className="new-chat-btn flex items-center gap-1"
                onClick={() => {
                  createNewSession();
                  navigate('/new');
                }}
              >
                <Plus size={14} className="shrink-0" />
                New
              </button>
            </div>
            <div className={`sidebar-section-content ${sessionsExpanded ? 'expanded' : ''}`}>
              <div id="sessionsList" className="sessions-container">
                <ErrorBoundary name="Sessions">
                  <SessionList />
                </ErrorBoundary>
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
