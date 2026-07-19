import { Trash2 } from 'lucide-react';

export function DocumentItem({ filename, onDelete, onClick }) {
  return (
    <div className="doc-item" onClick={onClick}>
      <span className="doc-name" title={filename}>
        {filename}
      </span>
      <button
        type="button"
        className="delete-session-btn flex items-center justify-center"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(e);
        }}
        title="Delete document"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}
