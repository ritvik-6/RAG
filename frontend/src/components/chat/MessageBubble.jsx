import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { stripCitationMarkers } from '../../utils/utils';

export function MessageBubble({ text, classType }) {
  const content = classType === 'ai-align' ? stripCitationMarkers(text) : text;

  return (
    <div className={`chat-bubble ${classType}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          table({ node, ...props }) {
            return <table className="md-table" {...props} />;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}