import { ErrorBoundary } from '../error/ErrorBoundary';
import { MessageList } from '../chat/MessageList';
import { QueryInput } from '../chat/QueryInput';
import { useUiStore } from '../../stores/uiStore';

export function ChatCanvas() {
  const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed);

  return (
    <main
      id="chat-canvas"
      className="chat-canvas"
      style={sidebarCollapsed ? { paddingLeft: '44px' } : undefined}
    >
      <ErrorBoundary name="Messages">
        <MessageList />
      </ErrorBoundary>
      <ErrorBoundary name="Query Input">
        <QueryInput />
      </ErrorBoundary>
    </main>
  );
}
