import { useEffect } from 'react';
import { usePdfStore } from '../../stores/pdfStore';

export function PdfViewerPanel() {
  const isOpen = usePdfStore((s) => s.isOpen);
  const iframeSrc = usePdfStore((s) => s.iframeSrc);
  const title = usePdfStore((s) => s.title);
  const close = usePdfStore((s) => s.close);

  useEffect(() => {
    if (!isOpen) {
      const timer = setTimeout(() => {
        const iframe = document.getElementById('pdf-viewer-iframe');
        if (iframe) iframe.src = '';
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  return (
    <div id="pdf-viewer-panel" className={isOpen ? 'open' : ''}>
      <div id="pdf-viewer-header">
        <span id="pdf-viewer-title">{title}</span>
        <button id="pdf-viewer-close" type="button" title="Close viewer" onClick={close}>
          ✕
        </button>
      </div>
     <iframe
  key={iframeSrc}
  id="pdf-viewer-iframe"
  src={isOpen ? iframeSrc : ''}
  title="PDF Viewer"
/>
    </div>
  );
}
