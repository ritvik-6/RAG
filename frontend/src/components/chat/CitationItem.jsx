import { FileText } from 'lucide-react';

export function CitationItem({ index, filename, page, isActive, onClick }) {
  return (
    <button
      type="button"
      className={`citation-item${isActive ? ' active' : ''}`}
      data-filename={filename}
      data-page={page}
      onClick={onClick}
    >
      <span className="citation-number">[{index}]</span>
      <span className="citation-text">
        <span className="citation-filename">{filename}</span>
        <span className="citation-page">· p.{page}</span>
      </span>
      <span className="citation-icon flex items-center justify-center">
        <FileText size={14} />
      </span>
    </button>
  );
}
