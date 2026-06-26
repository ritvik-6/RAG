// components/pdfViewer.js — Slide-in PDF viewer panel

const HOST = "http://localhost:8000";

const PDFViewer = {
    isOpen: false,
    currentKey: null,

    mount() {
        const panel = document.createElement('div');
        panel.id = 'pdf-viewer-panel';
        panel.innerHTML = `
            <div id="pdf-viewer-header">
                <span id="pdf-viewer-title">Document Viewer</span>
                <button id="pdf-viewer-close" title="Close viewer">✕</button>
            </div>
            <iframe id="pdf-viewer-iframe" src="" title="PDF Viewer"></iframe>
        `;
        document.body.appendChild(panel);

        document.getElementById('pdf-viewer-close').addEventListener('click', () => {
            this.close();
        });
    },

    toggle(filename, page) {
        const key = `${filename}:${page}`;
        if (this.isOpen && this.currentKey === key) {
            this.close();
            return;
        }
        this.open(filename, page, key);
    },

    open(filename, page, key) {
        const panel = document.getElementById('pdf-viewer-panel');
        const iframe = document.getElementById('pdf-viewer-iframe');
        const title = document.getElementById('pdf-viewer-title');

        const userId = localStorage.getItem('RAG_USER_ID') || '';
        const diskFilename = `${userId}_${filename}`;
        const url = `${HOST}/files/${encodeURIComponent(diskFilename)}#page=${page}`;

        iframe.src = url;
        title.textContent = `${filename} — Page ${page}`;
        panel.classList.add('open');

        this.isOpen = true;
        this.currentKey = key;
    },

    close() {
        const panel = document.getElementById('pdf-viewer-panel');
        const iframe = document.getElementById('pdf-viewer-iframe');

        panel.classList.remove('open');
        setTimeout(() => { iframe.src = ""; }, 300);

        this.isOpen = false;
        this.currentKey = null;
    }
};

export default PDFViewer;