import { useState, useEffect, useRef } from 'react';

export function SessionItem({ sessionName, isActive, onSelect, onDelete, onRename }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(sessionName);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const inputRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    setEditValue(sessionName);
  }, [sessionName]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  // Close dropdown on click outside
  useEffect(() => {
    if (!isMenuOpen) return;

    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMenuOpen]);

  const handleSave = () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== sessionName) {
      onRename(trimmed);
    } else {
      // Restore original name if empty
      setEditValue(sessionName);
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditValue(sessionName);
    setIsEditing(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  return (
    <div
      className={`session-item${isActive ? ' active-session' : ''}`}
      onDoubleClick={() => setIsEditing(true)}
    >
      {isEditing ? (
        <input
          ref={inputRef}
          type="text"
          className="edit-session-input"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          maxLength={255}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <>
          <span className="session-label" onClick={onSelect}>
            {sessionName}
          </span>
          <div className="session-actions-wrapper" ref={menuRef}>
            <button
              type="button"
              className="session-menu-trigger"
              onClick={(e) => {
                e.stopPropagation();
                setIsMenuOpen(!isMenuOpen);
              }}
              title="Session actions"
            >
              ⋮
            </button>
            {isMenuOpen && (
              <div className="session-dropdown-menu">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsEditing(true);
                    setIsMenuOpen(false);
                  }}
                >
                  ✏️ Rename
                </button>
                <button
                  type="button"
                  className="delete-option"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(e);
                    setIsMenuOpen(false);
                  }}
                >
                  🗑️ Delete
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
