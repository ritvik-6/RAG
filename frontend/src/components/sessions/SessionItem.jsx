export function SessionItem({ label, isActive, onSelect, onDelete }) {
  return (
    <div className={`session-item${isActive ? ' active-session' : ''}`}>
      <span onClick={onSelect}>{label}</span>
      <button type="button" className="delete-session-btn" onClick={onDelete}>
        ✕
      </button>
    </div>
  );
}
