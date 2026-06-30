import { useEffect, useRef, useState } from 'react';
import { chatService } from '../../services/chatService';
import { renderMarkdown } from '../../utils/utils';
import { useSessionStore } from '../../stores/sessionStore';
import DOMPurify from 'dompurify';

/**
 * Streaming bubble — tokens accumulate in useRef, rendered via requestAnimationFrame.
 * Completed AI message is written to Zustand only on stream end.
 */
export function StreamingBubble({ sessionId }) {
  const rawRef = useRef('');
  const rafRef = useRef(null);
  const [previewHtml, setPreviewHtml] = useState(
    '<span class="thinking-dots">Thinking<span>.</span><span>.</span><span>.</span></span>',
  );
  const finalizeAiMessage = useSessionStore((s) => s.finalizeAiMessage);
  const finalizeErrorMessage = useSessionStore((s) => s.finalizeErrorMessage);

  const scheduleRender = () => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const preview = rawRef.current.replace(/\[\[cite:[^\]]+\]\]/g, '');
      setPreviewHtml(DOMPurify.sanitize(renderMarkdown(preview), {
        ALLOWED_TAGS: ['strong', 'em', 'code', 'pre', 'br', 'table', 'tbody', 'tr', 'td', 'th', 'sup'],
        ALLOWED_ATTR: ['class', 'data-index'],
      }));
    });
  };

  useEffect(() => {
    rawRef.current = '';

    const unsubscribe = chatService.subscribe((event, data) => {
      if (event === 'token') {
        rawRef.current += data;
        scheduleRender();
      } else if (event === 'end') {
        if (rafRef.current !== null) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
        finalizeAiMessage(sessionId, rawRef.current, data);
      } else if (event === 'error') {
        if (rafRef.current !== null) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
        finalizeErrorMessage(sessionId, data || 'Connection error. Please try again.');
      }
    });

    return () => {
      unsubscribe();
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [sessionId, finalizeAiMessage, finalizeErrorMessage]);

  return (
    <div className="chat-bubble ai-align" dangerouslySetInnerHTML={{ __html: previewHtml }} />
  );
}
