import { useEffect, useRef, useState, useCallback } from 'react';
import { usePdfStore } from '../../stores/pdfStore';
import { X } from 'lucide-react';

const DEFAULT_WIDTH = 420;
const MIN_WIDTH = 320;
const MAX_WIDTH = 1400;

export function PdfViewerPanel() {
  const isOpen = usePdfStore((s) => s.isOpen);
  const iframeSrc = usePdfStore((s) => s.iframeSrc);
  const title = usePdfStore((s) => s.title);
  const close = usePdfStore((s) => s.close);

  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [dragWidth, setDragWidth] = useState(null); // live preview only
  const draggingRef = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      const timer = setTimeout(() => {
        const iframe = document.getElementById('pdf-viewer-iframe');
        if (iframe) iframe.src = '';
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const onDragStart = useCallback((e) => {
    draggingRef.current = true;
    setDragWidth(width);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  }, [width]);

  useEffect(() => {
    const onMouseMove = (e) => {
      if (!draggingRef.current) return;
      const newWidth = window.innerWidth - e.clientX;
      setDragWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, newWidth)));
    };

    const onMouseUp = () => {
      if (draggingRef.current) {
        draggingRef.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        // Commit the width — this is the only point the iframe actually resizes
        setDragWidth((finalWidth) => {
          if (finalWidth != null) setWidth(finalWidth);
          return null;
        });
      }
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  const isDragging = dragWidth != null;
  const panelWidth = isDragging ? dragWidth : width;

  // Strip Chrome's native toolbar/sidebar so a wide panel doesn't summon
  // the full desktop PDF UI (thumbnails, page-count bar, etc.)
  const src = isOpen && iframeSrc
    ? `${iframeSrc}${iframeSrc.includes('#') ? '&' : '#'}toolbar=0&navpanes=0&statusbar=0&view=FitH`
    : '';

  return (
    <div
      id="pdf-viewer-panel"
      className={isOpen ? 'open' : ''}
      style={isOpen ? { width: panelWidth } : undefined}
    >
      {isOpen && (
        <div
          id="pdf-viewer-resize-handle"
          onMouseDown={onDragStart}
          title="Drag to resize"
        />
      )}

      <div id="pdf-viewer-header">
        <span id="pdf-viewer-title">{title}</span>
        <button
          id="pdf-viewer-close"
          type="button"
          title="Close viewer"
          onClick={close}
          className="flex items-center justify-center"
        >
          <X size={18} />
        </button>
      </div>

      {/* Overlay blocks iframe hit-testing and repaint while dragging —
          this is what actually kills the lag, since the iframe's own
          content doesn't reflow until drag ends. */}
      {isDragging && <div id="pdf-viewer-drag-overlay" />}

      <iframe
        key={iframeSrc}
        id="pdf-viewer-iframe"
        src={src}
        title="PDF Viewer"
      />
    </div>
  );
}