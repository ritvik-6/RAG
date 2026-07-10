import { useEffect, useRef, useState, useCallback } from 'react';
import { usePdfStore } from '../../stores/pdfStore';
import {
  X,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  RotateCcw,
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
  const snippet = usePdfStore((s) => s.snippet);

  // Panel resize states
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [dragWidth, setDragWidth] = useState(null); // live preview only
  const draggingRef = useRef(false);

  // PDF.js states
  const [numPages, setNumPages] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [aspectRatio, setAspectRatio] = useState(1.414); // Default standard A4 ratio

  // Zoom states
  const [zoomLevel, setZoomLevel] = useState(1.0);

  // Container measurement
  const containerRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(0);

  // Derive file URL directly from user ID and filename
  const userId = getUserId() || '';
  const diskFilename = filename ? `${userId}_${filename}` : '';
  const fileUrl = filename ? apiService.getFileUrl(diskFilename, 1).split('#')[0] : '';

  // Synchronize storePage changes (citations clicked) with currentPage local state
  useEffect(() => {
    if (storePage != null) {
      setCurrentPage(storePage);
    }
  }, [storePage]);

  // When the page index or active document changes, reset zoom level to default
  useEffect(() => {
    setZoomLevel(1.0);
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

  const onPageLoadSuccess = (page) => {
    if (page.width) {
      setAspectRatio(page.height / page.width);
    }
    setLoading(false);
  };

  // Navigation and zoom handlers
  const goPrev = () => {
    setCurrentPage((p) => Math.max(1, p - 1));
  };

  const goNext = () => {
    setCurrentPage((p) => Math.min(numPages || 1, p + 1));
  };

  const zoomIn = () => {
    setZoomLevel((z) => Math.min(4.0, z + 0.15));
  };

  const zoomOut = () => {
    setZoomLevel((z) => Math.max(0.5, z - 0.15));
  };

  const resetZoom = () => {
    setZoomLevel(1.0);
  };

  // Wheel Zoom event handler (Ctrl/Cmd + Scroll wheel)
  const handleWheel = useCallback((e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const zoomFactor = 1.1;
      const direction = e.deltaY < 0 ? 1 : -1;
      const factor = direction > 0 ? zoomFactor : 1 / zoomFactor;
      setZoomLevel((prevZoom) => Math.min(4.0, Math.max(0.5, prevZoom * factor)));
    }
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

  // MutationObserver-driven citation highlighter
  useEffect(() => {
    let observer;

    const highlightText = () => {
      const prevHighlights = document.querySelectorAll('.pdf-highlight-match');
      prevHighlights.forEach((el) => {
        el.classList.remove('pdf-highlight-match');
      });

      if (!snippet) return;

      const textLayer = containerRef.current?.querySelector('.textLayer, .react-pdf__Page__textContent');
      if (!textLayer) return;

      const spans = Array.from(textLayer.querySelectorAll('span'));
      if (spans.length === 0) return;

      const cleanSnippet = snippet.replace(/\s+/g, ' ').trim().toLowerCase();
      if (!cleanSnippet) return;

      const snippetWords = cleanSnippet.split(' ').filter(Boolean);
      if (snippetWords.length === 0) return;

      const spanInfo = spans.map((span) => ({
        span,
        text: span.textContent.replace(/\s+/g, ' ').trim().toLowerCase(),
      }));

      let combinedText = '';
      const spanRanges = [];
      
      spanInfo.forEach((info) => {
        const startIdx = combinedText.length;
        combinedText += info.text + ' ';
        const endIdx = combinedText.length;
        spanRanges.push({ startIdx, endIdx, span: info.span });
      });

      // Try exact match first
      const idx = combinedText.indexOf(cleanSnippet);
      if (idx !== -1) {
        const matchStart = idx;
        const matchEnd = idx + cleanSnippet.length;
        let firstMatchSpan = null;

        spanRanges.forEach((range) => {
          if (range.startIdx < matchEnd && range.endIdx > matchStart) {
            range.span.classList.add('pdf-highlight-match');
            if (!firstMatchSpan) firstMatchSpan = range.span;
          }
        });

        if (firstMatchSpan) {
          firstMatchSpan.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        return;
      }

      // Fuzzy phrase match fallback (using 4-word sliding window)
      const phraseLen = Math.min(4, snippetWords.length);
      let firstMatchSpan = null;

      for (let start = 0; start <= snippetWords.length - phraseLen; start++) {
        const phrase = snippetWords.slice(start, start + phraseLen).join(' ');
        const pIdx = combinedText.indexOf(phrase);
        if (pIdx !== -1) {
          const matchStart = pIdx;
          const matchEnd = pIdx + phrase.length;
          spanRanges.forEach((range) => {
            if (range.startIdx < matchEnd && range.endIdx > matchStart) {
              range.span.classList.add('pdf-highlight-match');
              if (!firstMatchSpan) firstMatchSpan = range.span;
            }
          });
        }
      }

      if (firstMatchSpan) {
        firstMatchSpan.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    };

    highlightText();

    const targetNode = containerRef.current;
    if (targetNode) {
      observer = new MutationObserver(() => {
        highlightText();
      });
      observer.observe(targetNode, { childList: true, subtree: true });
    }

    return () => {
      if (observer) {
        observer.disconnect();
      }
    };
  }, [snippet, currentPage, loading]);

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
        <div className="pdf-viewer-toolbar flex items-center justify-center gap-4">
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

          {/* Zoom Actions */}
          <div className="flex items-center gap-1.5 border-l border-[var(--border)] pl-4">
            <button
              type="button"
              className="p-1 hover:bg-[var(--border-muted)] rounded disabled:opacity-30 transition-colors text-[var(--text-muted)]"
              onClick={zoomOut}
              disabled={zoomLevel <= 0.5 || loading}
              title="Zoom out"
            >
              <ZoomOut size={18} />
            </button>
            <button
              type="button"
              className="p-1 hover:bg-[var(--border-muted)] rounded disabled:opacity-30 transition-colors text-[var(--text-muted)]"
              onClick={resetZoom}
              disabled={loading}
              title="Reset zoom"
            >
              <RotateCcw size={16} />
            </button>
            <span className="text-xs font-semibold min-w-[40px] text-center text-[var(--text-muted)]">
              {Math.round(zoomLevel * 100)}%
            </span>
            <button
              type="button"
              className="p-1 hover:bg-[var(--border-muted)] rounded disabled:opacity-30 transition-colors text-[var(--text-muted)]"
              onClick={zoomIn}
              disabled={zoomLevel >= 4.0 || loading}
              title="Zoom in"
            >
              <ZoomIn size={18} />
            </button>
          </div>
        </div>
      )}

      {isDragging && <div id="pdf-viewer-drag-overlay" />}

      {/* Content Area */}
      <div
        ref={containerRef}
        className="pdf-viewer-content"
        style={{ overflow: 'auto', position: 'relative' }}
      >
        {isOpen && loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-[var(--surface)]/80 z-30">
            <Loader2 className="animate-spin text-[var(--brand)]" size={32} />
          </div>
        )}

        {isOpen && fileUrl ? (
          <div
            className="pdf-scaffolding-container"
            style={{
              width: `${baseWidth * zoomLevel}px`,
              height: `${baseWidth * aspectRatio * zoomLevel}px`,
              position: 'relative',
              margin: '0 auto',
            }}
          >
            <div
              className="pdf-transform-wrapper"
              style={{
                transform: `scale(${zoomLevel})`,
                transformOrigin: 'top left',
                width: `${baseWidth}px`,
                height: `${baseWidth * aspectRatio}px`,
                position: 'absolute',
                top: 0,
                left: 0,
              }}
            >
              <Document
                file={fileUrl}
                onLoadSuccess={onDocumentLoadSuccess}
                onLoadError={onDocumentLoadError}
                loading={null}
              >
                <Page
                  pageNumber={currentPage}
                  width={baseWidth}
                  scale={1.75}
                  onLoadSuccess={onPageLoadSuccess}
                  renderAnnotationLayer={false}
                  renderTextLayer={true}
                  loading={null}
                />
              </Document>
            </div>
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