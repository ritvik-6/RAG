import { useUiStore } from '../../stores/uiStore';

export function SidebarToggle() {
  const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);

  return (
    <button
      id="sidebar-toggle"
      type="button"
      title="Toggle sidebar"
      onClick={toggleSidebar}
      style={{ left: sidebarCollapsed ? '0px' : '280px' }}
    >
      {sidebarCollapsed ? '▶' : '◀'}
    </button>
  );
}
