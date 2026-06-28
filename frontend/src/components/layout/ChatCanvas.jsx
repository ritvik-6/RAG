import { ErrorBoundary } from '../error/ErrorBoundary';
import { MessageList } from '../chat/MessageList';
import { QueryInput } from '../chat/QueryInput';

export function ChatCanvas() {
  return (
    <main id="chat-canvas" className="chat-canvas">
      <ErrorBoundary name="Messages">
        <MessageList />
      </ErrorBoundary>
      <ErrorBoundary name="Query Input">
        <QueryInput />
      </ErrorBoundary>
    </main>
  );
}
