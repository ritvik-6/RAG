import { Fragment } from 'react';
import { useSessionStore } from '../../stores/sessionStore';
import { useUiStore } from '../../stores/uiStore';
import { usePdfStore } from '../../stores/pdfStore';
import { parseCitations } from '../../utils/utils';
import { MessageBubble } from './MessageBubble';
import { CitationList } from './CitationList';
import { StreamingBubble } from './StreamingBubble';
import { MessageSquare } from 'lucide-react';

export function MessageList() {
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const chatSessionsMemory = useSessionStore((s) => s.chatSessionsMemory);
  const isStreaming = useSessionStore((s) => s.isStreaming);
  const activeCitationKey = useUiStore((s) => s.activeCitationKey);
  const setActiveCitationKey = useUiStore((s) => s.setActiveCitationKey);
  const togglePdf = usePdfStore((s) => s.toggle);
  const streamingSessionId = useSessionStore((s) => s.streamingSessionId);
  const streamingText = useSessionStore((s) => s.streamingText);

  const handleCitationClick = (filename, page, key) => {
    const isActive = activeCitationKey === key;
    setActiveCitationKey(isActive ? null : key);
    togglePdf(filename, page);
  };

  // Blank landing state 
  if (activeSessionId === null) {
    return (
      <div id="messages-viewport" className="messages-viewport landing-state">
        <div className="landing-content">
          <MessageSquare size={40} className="landing-icon" />
          <h2>Ask anything about your documents</h2>
          <p>Upload a PDF and start a conversation — your chat will appear here.</p>
        </div>
      </div>
    );
  }

  const messages = chatSessionsMemory[activeSessionId] || [];

  return (
    <div id="messages-viewport" className="messages-viewport">
      {messages.map((msg, index) => {
        const citationKey = `${index}-${msg.classType}`;
        const { citations } =
          msg.classType === 'ai-align' ? parseCitations(msg.text) : { citations: [] };

        return (
          <Fragment key={citationKey}>
            <MessageBubble
              text={msg.text}
              classType={msg.classType}
              createdAt={msg.created_at}
              latencyMs={msg.latency_ms}
            />
            {msg.classType === 'ai-align' && citations.length > 0 && (
              <CitationList
                citations={citations}
                activeCitationKey={activeCitationKey}
                onCitationClick={(filename, page, key) => handleCitationClick(filename, page, key)}
              />
            )}
          </Fragment>
        );
      })}
      {streamingSessionId === activeSessionId && <StreamingBubble text={streamingText} />}
    </div>
  );
}