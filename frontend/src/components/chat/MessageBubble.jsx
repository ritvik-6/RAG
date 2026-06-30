import { renderMarkdown, parseCitations } from '../../utils/utils';

export function MessageBubble({ text, classType }) {
  let html;
  if (classType === 'ai-align') {
    const { cleanText } = parseCitations(text);
    html = renderMarkdown(cleanText);
  } else {
    html = renderMarkdown(text);
  }

  return (
    <div
      className={`chat-bubble ${classType}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}