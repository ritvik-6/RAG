// documents.js — PDF upload + document catalog management

const HOST = "http://localhost:8000";

const queryInput = document.getElementById('queryConsole');
const submitBtn = document.getElementById('submitBtn');
const statusDisplay = document.getElementById('runtimeStatus');

export async function fetchAndRenderDocumentCatalog(userId) {
    const docContainer = document.getElementById('documentsList');
    if (!docContainer) return;

    try {
        const response = await fetch(`${HOST}/documents/${userId}`);
        if (!response.ok) throw new Error('Could not fetch documents.');

        const documents = await response.json();
        docContainer.innerHTML = '';

        if (documents.length === 0) {
            docContainer.innerHTML = `<div class="docs-empty">No documents uploaded yet.</div>`;
            return;
        }

        documents.forEach((doc) => {
            const row = document.createElement('div');
            row.className = 'doc-item';

            const label = document.createElement('span');
            label.className = 'doc-name';
            label.innerText = doc.filename;
            label.title = doc.filename;

            const deleteBtn = document.createElement('button');
            deleteBtn.innerText = '✕';
            deleteBtn.className = 'delete-session-btn';
            deleteBtn.onclick = async (e) => {
                e.stopPropagation();
                await executeDocumentPurge(doc.document_id, userId);
            };

            row.appendChild(label);
            row.appendChild(deleteBtn);
            docContainer.appendChild(row);
        });

    } catch (err) {
        console.error('Failed to load document catalog:', err);
    }
}

export async function executeDocumentPurge(documentId, userId) {
    if (!confirm('Permanently delete this document from all storage layers?')) return;

    try {
        const res = await fetch(`${HOST}/documents/${documentId}`, { method: 'DELETE' });
        if (res.ok) {
            await fetchAndRenderDocumentCatalog(userId);

            // Disable input if no documents remain
            const verifyRes = await fetch(`${HOST}/documents/${userId}`);
            const remaining = await verifyRes.json();
            if (remaining.length === 0) {
                queryInput.disabled = true;
                submitBtn.disabled = true;
                statusDisplay.innerText = 'Upload a PDF to get started.';
            }
        } else {
            alert('Failed to delete document.');
        }
    } catch {
        alert('Connection error during document deletion.');
    }
}

export async function triggerBatchUpload(userId) {
    const selector = document.getElementById('batch-pdf-uploader');
    if (!selector) return;

    const files = selector.files;
    if (files.length === 0) {
        alert('Please select at least one PDF file.');
        return;
    }

    const uploadBtn = document.querySelector('.upload-control-panel button');
    if (uploadBtn) uploadBtn.disabled = true;
    statusDisplay.innerText = `Uploading ${files.length} file(s)...`;

    for (const file of files) {
        const form = new FormData();
        form.append('file', file);
        form.append('user_id', userId);

        try {
            const res = await fetch(`${HOST}/upload`, { method: 'POST', body: form });
            if (!res.ok) {
                const err = await res.json();
                alert(`Error uploading ${file.name}: ${err.detail}`);
            }
        } catch {
            alert(`Network error uploading ${file.name}.`);
        }
    }

    selector.value = '';
    if (uploadBtn) uploadBtn.disabled = false;

    await fetchAndRenderDocumentCatalog(userId);
    queryInput.disabled = false;
    submitBtn.disabled = false;
    statusDisplay.innerText = '✅ Documents ready. Ask anything.';
}