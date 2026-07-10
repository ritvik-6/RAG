import { renderMarkdown } from '../../utils/utils';
import DOMPurify from 'dompurify';

export function StreamingBubble({ text, status }) {
  if (text) {
    const preview = DOMPurify.sanitize(
      renderMarkdown(text.replace(/\[\[cite:[^\]]+\]\]/g, '')),
      {
        ALLOWED_TAGS: ['strong', 'em', 'code', 'pre', 'br', 'table', 'tbody', 'tr', 'td', 'th', 'sup'],
        ALLOWED_ATTR: ['class', 'data-index'],
      }
    );

    return (
      <div
        className="chat-bubble ai-align"
        dangerouslySetInnerHTML={{ __html: preview }}
      />
    );
  }

  return (
    <div className="chat-bubble ai-align">
      <span className="status-indicator">
        {status}
        {status && (
          <span className="status-dots">
            <span>.</span>
            <span>.</span>
            <span>.</span>
          </span>
        )}
      </span>
    </div>
  );
}