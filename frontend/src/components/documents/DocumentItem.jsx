import { Trash2, FileText } from 'lucide-react';

export function DocumentItem({ filename, onDelete, onClick }) {
  return (
    <div className="doc-item" onClick={onClick} title={filename}>
      <div className="doc-info">
        <div className="doc-icon-badge">
          <FileText size={16} />
        </div>
        <span className="doc-name">
          {filename}
        </span>
      </div>
      <button
        type="button"
        className="delete-doc-btn flex items-center justify-center"
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
