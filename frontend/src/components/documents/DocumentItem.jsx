export function DocumentItem({ filename, onDelete }) {
  return (
    <div className="doc-item">
      <span className="doc-name" title={filename}>
        {filename}
      </span>
      <button type="button" className="delete-session-btn" onClick={onDelete}>
        ✕
      </button>
    </div>
  );
}
