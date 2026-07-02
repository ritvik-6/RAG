import { useUiStore } from '../../stores/uiStore';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export function SidebarToggle() {
  const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);

  const style = sidebarCollapsed
    ? { position: 'fixed', top: '20px', left: '12px', zIndex: 200 }
    : {};

  return (
    <button
      id="sidebar-toggle"
      type="button"
      title="Toggle sidebar"
      onClick={toggleSidebar}
      style={style}
      className="flex items-center justify-center"
    >
      {sidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
    </button>
  );
}
