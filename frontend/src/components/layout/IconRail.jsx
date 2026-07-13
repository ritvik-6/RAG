import { useNavigate } from 'react-router-dom';
import { useUiStore } from '../../stores/uiStore';
import { useSessionStore } from '../../stores/sessionStore';
import {
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  MessageSquare,
  FileText
} from 'lucide-react';

export function IconRail() {
  const navigate = useNavigate();
  const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const activeSidebarTab = useUiStore((s) => s.activeSidebarTab);
  const setActiveSidebarTab = useUiStore((s) => s.setActiveSidebarTab);
  
  const createNewSession = useSessionStore((s) => s.createNewSession);

  const handleTabClick = (tab) => {
    setActiveSidebarTab(tab);
    // Ensure the sidebar expands if it was collapsed
    if (sidebarCollapsed) {
      toggleSidebar();
    }
  };

  const handleNewChat = () => {
    createNewSession();
    navigate('/new');
  };

  return (
    <div className="icon-rail flex flex-col items-center py-3 bg-[var(--bg-sidebar)] border-r border-[var(--border)] h-screen w-[44px] shrink-0 z-50">
      {/* 1. Toggle Sidebar */}
      <button
        type="button"
        className="icon-rail-btn mb-2.5"
        onClick={toggleSidebar}
        title="Toggle sidebar"
      >
        {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
      </button>

      {/* 2. New Chat */}
      <button
        type="button"
        className="icon-rail-btn mb-2.5"
        onClick={handleNewChat}
        title="New chat"
      >
        <Plus size={18} />
      </button>

      {/* 3. Sessions Tab */}
      <button
        type="button"
        className={`icon-rail-btn mb-2.5 ${(!sidebarCollapsed && activeSidebarTab === 'sessions') ? 'active' : ''}`}
        onClick={() => handleTabClick('sessions')}
        title="Sessions"
      >
        <MessageSquare size={18} />
      </button>

      {/* 4. Documents Tab */}
      <button
        type="button"
        className={`icon-rail-btn ${(!sidebarCollapsed && activeSidebarTab === 'documents') ? 'active' : ''}`}
        onClick={() => handleTabClick('documents')}
        title="Documents"
      >
        <FileText size={18} />
      </button>
    </div>
  );
}
