import { useEffect, useRef, useState, useCallback } from 'react';
import { usePdfStore } from '../../stores/pdfStore';
import { 
  X, 
  ChevronLeft, 
  ChevronRight, 
  ZoomIn, 
  ZoomOut, 
  Maximize2, 
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
  const [zoomScale, setZoomScale] = useState(1.0);
  const [loading, setLoading] = useState(true);

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

  const zoomIn = () => {
    setZoomScale((z) => Math.min(3.0, z + 0.1));
  };

  const zoomOut = () => {
    setZoomScale((z) => Math.max(0.4, z - 0.1));
  };

  const fitWidth = () => {
    setZoomScale(1.0);
  };

  // We subtract some horizontal padding to fit the canvas properly (32px padding total)
  const baseWidth = containerWidth > 32 ? containerWidth - 32 : 280;
  const pageCalculatedWidth = baseWidth * zoomScale;

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
        <div className="pdf-viewer-toolbar">
          {/* Navigation */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="p-1 hover:bg-slate-200 rounded disabled:opacity-30 disabled:hover:bg-transparent transition-colors text-slate-700"
              onClick={goPrev}
              disabled={currentPage <= 1 || loading}
              title="Previous page"
            >
              <ChevronLeft size={18} />
            </button>
            <span className="text-xs font-medium min-w-[70px] text-center text-slate-700">
              Page {currentPage} / {numPages || '?'}
            </span>
            <button
              type="button"
              className="p-1 hover:bg-slate-200 rounded disabled:opacity-30 disabled:hover:bg-transparent transition-colors text-slate-700"
              onClick={goNext}
              disabled={currentPage >= (numPages || 1) || loading}
              title="Next page"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          {/* Zoom Actions */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              className="p-1 hover:bg-slate-200 rounded disabled:opacity-30 transition-colors text-slate-700"
              onClick={zoomOut}
              disabled={zoomScale <= 0.4 || loading}
              title="Zoom out"
            >
              <ZoomOut size={18} />
            </button>
            <span className="text-xs font-semibold min-w-[40px] text-center text-slate-700">
              {Math.round(zoomScale * 100)}%
            </span>
            <button
              type="button"
              className="p-1 hover:bg-slate-200 rounded disabled:opacity-30 transition-colors text-slate-700"
              onClick={zoomIn}
              disabled={zoomScale >= 3.0 || loading}
              title="Zoom in"
            >
              <ZoomIn size={18} />
            </button>
            <div className="w-[1px] h-4 bg-slate-200 mx-1" />
            <button
              type="button"
              className="p-1 hover:bg-slate-200 rounded text-slate-500 hover:text-slate-800 transition-colors"
              onClick={fitWidth}
              disabled={loading}
              title="Fit to width"
            >
              <Maximize2 size={16} />
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
      >
        {isOpen && loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-100/80 z-30">
            <Loader2 className="animate-spin text-slate-500" size={32} />
          </div>
        )}

        {isOpen && fileUrl ? (
          <Document
            file={fileUrl}
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={onDocumentLoadError}
            loading={null}
          >
            <Page
              pageNumber={currentPage}
              width={pageCalculatedWidth}
              onLoadSuccess={onPageLoadSuccess}
              renderAnnotationLayer={false}
              renderTextLayer={true}
              loading={null}
            />
          </Document>
        ) : (
          isOpen && (
            <div className="text-slate-400 text-sm flex items-center justify-center h-full w-full">
              No document loaded
            </div>
          )
        )}
      </div>
    </div>
  );
}