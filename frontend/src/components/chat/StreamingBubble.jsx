import { renderMarkdown } from '../../utils/utils';
import DOMPurify from 'dompurify';
import { ThinkingTrace } from './ThinkingTrace';

export function StreamingBubble({ text, steps, stepsComplete, thinkingDurationMs }) {
  const showTrace = (steps && steps.length > 0) || !stepsComplete;

  let preview = '';
  if (text) {
    preview = DOMPurify.sanitize(
      renderMarkdown(text.replace(/\[\[cite:[^\]]+\]\]/g, '')),
      {
        ALLOWED_TAGS: ['strong', 'em', 'code', 'pre', 'br', 'table', 'tbody', 'tr', 'td', 'th', 'sup'],
        ALLOWED_ATTR: ['class', 'data-index'],
      }
    );
  }

  return (
    <div className="chat-bubble ai-align">
      {showTrace && (
        <ThinkingTrace
          steps={steps}
          stepsComplete={stepsComplete}
          thinkingDurationMs={thinkingDurationMs}
        />
      )}
      {text && (
        <div
          className={showTrace ? "mt-2" : ""}
          dangerouslySetInnerHTML={{ __html: preview }}
        />
      )}
    </div>
  );
}