// app.js — Entry point
import { connectWebSocket, sendMessage, isSocketReady } from './socket.js';
import {
    restoreSessionsFromBackend,
    createNewSession,
    getActiveSessionId,
    chatSessionsMemory,
    isStreaming,
    setStreaming,
    appendUserBubble,
    createStreamingBubble
} from './sessions.js';
import { fetchAndRenderDocumentCatalog, triggerBatchUpload } from './documents.js';
import PDFViewer from './components/pdfViewer.js';
 
// ─── User Identity ─────────────────────────────────────────────────────────────
 
if (!localStorage.getItem('RAG_USER_ID')) {
    localStorage.setItem('RAG_USER_ID', 'user_' + Math.random().toString(36).substr(2, 9));
}
const CURRENT_USER_ID = localStorage.getItem('RAG_USER_ID');
 
// ─── Query Submission ──────────────────────────────────────────────────────────
 
async function handleQuerySubmission() {
    if (isStreaming) return;
 
    const queryInput = document.getElementById('queryConsole');
    const text = queryInput.value.trim();
    if (!text) return;
 
    if (!isSocketReady()) {
        alert('Connection not ready. Please wait a moment.');
        return;
    }
 
    setStreaming(true);
 
    const sessionId = getActiveSessionId();
 
    chatSessionsMemory[sessionId].push({ text, classType: 'user-align' });
    appendUserBubble(text);
    queryInput.value = '';
 
    // Create streaming bubble — dataset.raw is always freshly reset here
    createStreamingBubble();
 
    sendMessage({
        user_id: CURRENT_USER_ID,
        session_id: sessionId,
        message: text
    });
}
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const btn = document.getElementById('sidebar-toggle');
    const collapsed = sidebar.classList.toggle('collapsed');
    btn.textContent = collapsed ? '▶' : '◀';
    btn.style.left = collapsed ? '0px' : '280px';
}
window.toggleSidebar = toggleSidebar;
 
// ─── Expose globals for inline HTML onclick attributes ────────────────────────
// (Avoids needing to rewrite HTML onclick to use addEventListener)
 
window.handleQuerySubmission = handleQuerySubmission;
window.createNewSession = createNewSession;
window.triggerBatchUploadSequence = () => triggerBatchUpload(CURRENT_USER_ID);
window.fetchAndRenderDocumentCatalog = () => fetchAndRenderDocumentCatalog(CURRENT_USER_ID);
 
// ─── Boot ──────────────────────────────────────────────────────────────────────
 
PDFViewer.mount();
connectWebSocket();
restoreSessionsFromBackend(CURRENT_USER_ID);
fetchAndRenderDocumentCatalog(CURRENT_USER_ID);