import { useEffect, useRef, useState, useCallback } from 'react';
import { usePdfStore } from '../../stores/pdfStore';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Loader2
} from 'lucide-react';
import { Document, Page, pdfjs } from 'react-pdf';
import { getUserId } from '../../lib/userId';
import { apiService } from '../../services/apiService';
import 'react-pdf/dist/Page/TextLayer.css';

// Configure PDF.js worker from official CDN matching the package version
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const DEFAULT_WIDTH = 420;
const MIN_WIDTH = 320;
const MAX_WIDTH = 1400;

export function PdfViewerPanel() {
  const isOpen = usePdfStore((s) => s.isOpen);
  const title = usePdfStore((s) => s.title);
  const close = usePdfStore((s) => s.close);
  const filename = usePdfStore((s) => s.filename);
  const storePage = usePdfStore((s) => s.page);

  // Resize and drag states
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [dragWidth, setDragWidth] = useState(null); // live preview only
  const draggingRef = useRef(false);

  // PDF.js states
  const [numPages, setNumPages] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);

  // Zoom & Pan states
  const [zoomLevel, setZoomLevel] = useState(1.0);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0 });

  // Container measurement
  const containerRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(0);

  // Derive file URL directly from user ID and filename using getFileUrl helper
  const userId = getUserId() || '';
  const diskFilename = filename ? `${userId}_${filename}` : '';
  const fileUrl = filename ? apiService.getFileUrl(diskFilename, 1).split('#')[0] : '';

  // Synchronize storePage changes (citations clicked) with currentPage local state
  useEffect(() => {
    if (storePage != null) {
      setCurrentPage(storePage);
    }
  }, [storePage]);

  // When the page index or active document changes, reset zoom and pan variables to defaults
  useEffect(() => {
    setZoomLevel(1.0);
    setPanOffset({ x: 0, y: 0 });
  }, [currentPage, fileUrl]);

  // When the file URL changes, reset total page count and trigger loading state
  useEffect(() => {
    if (fileUrl) {
      setLoading(true);
      setNumPages(null);
    }
  }, [fileUrl]);

  // Measure container width for responsive page fitting
  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new ResizeObserver((entries) => {
      // Avoid re-renders of the canvas while dragging to optimize performance
      if (draggingRef.current) return;
      if (entries[0]) {
        setContainerWidth(entries[0].contentRect.width);
      }
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
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
        // Commit the width — this is the only point the panel content actually reflows
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

  // Document callbacks
  const onDocumentLoadSuccess = ({ numPages }) => {
    setNumPages(numPages);
    setLoading(false);
  };

  const onDocumentLoadError = (error) => {
    console.error('Failed to load PDF document:', error);
    setLoading(false);
  };

  const onPageLoadSuccess = () => {
    setLoading(false);
  };

  // Navigation handlers
  const goPrev = () => {
    setCurrentPage((p) => Math.max(1, p - 1));
  };

  const goNext = () => {
    setCurrentPage((p) => Math.min(numPages || 1, p + 1));
  };

  // Wheel Zoom event handler centering on cursor offsets
  const handleWheel = useCallback((e) => {
    if (!(e.ctrlKey || e.metaKey)) return;

    e.preventDefault();

    const zoomFactor = 1.1;
    const factor = e.deltaY < 0 ? zoomFactor : 1 / zoomFactor;

    setZoomLevel((prev) =>
      Math.min(4.0, Math.max(0.5, prev * factor))
    );
  }, []);

  // Bind non-passive wheel event listener to container
  useEffect(() => {
    const el = containerRef.current;
    if (el) {
      el.addEventListener('wheel', handleWheel, { passive: false });
    }
    return () => {
      if (el) {
        el.removeEventListener('wheel', handleWheel);
      }
    };
  }, [handleWheel]);

  // Drag-to-pan handlers
  const handleMouseDown = useCallback((e) => {
    if (e.button !== 0) return;
    if (zoomLevel <= 1) return;

    setIsPanning(true);
    panStartRef.current = {
      x: e.clientX - panOffset.x,
      y: e.clientY - panOffset.y,
    };

    e.preventDefault();
  }, [zoomLevel, panOffset]);

  const handleMouseMove = useCallback((e) => {
    if (!isPanning) return;
    const newX = e.clientX - panStartRef.current.x;
    const newY = e.clientY - panStartRef.current.y;
    setPanOffset({ x: newX, y: newY });
  }, [isPanning]);

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  useEffect(() => {
    if (isPanning) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isPanning, handleMouseMove, handleMouseUp]);

  // Subtraction of bounds horizontal padding
  const baseWidth = containerWidth > 32 ? containerWidth - 32 : 280;

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

      {/* Header */}
      <div id="pdf-viewer-header">
        <span id="pdf-viewer-title">
          {filename ? `${filename} — Page ${currentPage} of ${numPages || '?'}` : title}
        </span>
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

      {/* Toolbar */}
      {isOpen && (
        <div className="pdf-viewer-toolbar justify-center">
          {/* Navigation */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="p-1 hover:bg-[var(--border-muted)] rounded disabled:opacity-30 disabled:hover:bg-transparent transition-colors text-[var(--text-muted)]"
              onClick={goPrev}
              disabled={currentPage <= 1 || loading}
              title="Previous page"
            >
              <ChevronLeft size={18} />
            </button>
            <span className="text-xs font-medium min-w-[70px] text-center text-[var(--text-muted)]">
              Page {currentPage} / {numPages || '?'}
            </span>
            <button
              type="button"
              className="p-1 hover:bg-[var(--border-muted)] rounded disabled:opacity-30 disabled:hover:bg-transparent transition-colors text-[var(--text-muted)]"
              onClick={goNext}
              disabled={currentPage >= (numPages || 1) || loading}
              title="Next page"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      )}

      {/* Overlay blocks interaction while dragging */}
      {isDragging && <div id="pdf-viewer-drag-overlay" />}

      {/* Content Area */}
      <div
        ref={containerRef}
        className="pdf-viewer-content"
        style={{ overflow: 'hidden', position: 'relative' }}
      >
        {isOpen && loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-[var(--surface)]/80 z-30">
            <Loader2 className="animate-spin text-[var(--brand)]" size={32} />
          </div>
        )}

        {isOpen && fileUrl ? (
          <div
            className="pdf-transform-wrapper"
            style={{
              transform: `translate(${panOffset.x}px, ${panOffset.y}px)`,
              transformOrigin: 'center center',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: isPanning ? 'grabbing' : 'grab',
              width: '100%',
              height: '100%',
              position: 'absolute',
              userSelect: 'text',
            }}
            onMouseDown={handleMouseDown}
          >
            <Document
              file={fileUrl}
              onLoadSuccess={onDocumentLoadSuccess}
              onLoadError={onDocumentLoadError}
              loading={null}
            >
              <Page
                pageNumber={currentPage}
                width={baseWidth * zoomLevel}
                scale={1.15}
                onLoadSuccess={onPageLoadSuccess}
                renderAnnotationLayer={false}
                renderTextLayer
                loading={null}
              />
            </Document>
          </div>
        ) : (
          isOpen && (
            <div className="text-[var(--text-muted)] text-sm flex items-center justify-center h-full w-full">
              No document loaded
            </div>
          )
        )}
      </div>
    </div>
  );
}