import { Fragment } from 'react';
import { useSessionStore } from '../../stores/sessionStore';
import { useUiStore } from '../../stores/uiStore';
import { usePdfStore } from '../../stores/pdfStore';
import { parseCitations } from '../../utils/utils';
import { MessageBubble } from './MessageBubble';
import { CitationList } from './CitationList';
import { StreamingBubble } from './StreamingBubble';

export function MessageList() {
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const chatSessionsMemory = useSessionStore((s) => s.chatSessionsMemory);
  const isStreaming = useSessionStore((s) => s.isStreaming);
  const activeCitationKey = useUiStore((s) => s.activeCitationKey);
  const setActiveCitationKey = useUiStore((s) => s.setActiveCitationKey);
  const togglePdf = usePdfStore((s) => s.toggle);

  const messages = chatSessionsMemory[activeSessionId] || [];

  const handleCitationClick = (filename, page, key) => {
    const isActive = activeCitationKey === key;
    setActiveCitationKey(isActive ? null : key);
    togglePdf(filename, page);
  };

  return (
    <div id="messages-viewport" className="messages-viewport">
      {messages.map((msg, index) => {
        const citationKey = `${index}-${msg.classType}`;
        const { citations } =
          msg.classType === 'ai-align' ? parseCitations(msg.text) : { citations: [] };

        return (
          <Fragment key={citationKey}>
            <MessageBubble text={msg.text} classType={msg.classType} />
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
      {isStreaming && <StreamingBubble sessionId={activeSessionId} />}
    </div>
  );
}
