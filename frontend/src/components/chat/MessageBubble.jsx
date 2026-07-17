import { renderMarkdown, parseCitations } from '../../utils/utils';
import { ThinkingTrace } from './ThinkingTrace';

export function MessageBubble({ text, classType, citationChunks, steps, thinkingDurationMs }) {
  let html;
  if (classType === 'ai-align') {
    const { cleanText } = parseCitations(text, citationChunks);
    html = renderMarkdown(cleanText);
  } else {
    html = renderMarkdown(text);
  }

  const showTrace = classType === 'ai-align' && steps && steps.length > 0;

  return (
    <div className={`chat-bubble ${classType}`}>
      {showTrace && (
        <ThinkingTrace
          steps={steps}
          stepsComplete={true}
          thinkingDurationMs={thinkingDurationMs}
        />
      )}
      <div
        className={showTrace ? "mt-2" : ""}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}