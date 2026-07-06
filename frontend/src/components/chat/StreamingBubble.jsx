import { renderMarkdown } from '../../utils/utils';
import DOMPurify from 'dompurify';

export function StreamingBubble({ text }) {
  const preview = text
    ? DOMPurify.sanitize(renderMarkdown(text.replace(/\[\[cite:[^\]]+\]\]/g, '')), {
        ALLOWED_TAGS: ['strong', 'em', 'code', 'pre', 'br', 'table', 'tbody', 'tr', 'td', 'th', 'sup'],
        ALLOWED_ATTR: ['class', 'data-index'],
      })
    : '<span class="thinking-dots">Thinking<span>.</span><span>.</span><span>.</span></span>';

  return <div className="chat-bubble ai-align" dangerouslySetInnerHTML={{ __html: preview }} />;
}