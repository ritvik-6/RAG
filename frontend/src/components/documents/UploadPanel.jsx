import { useRef, useState } from 'react';
import { useDocumentStore } from '../../stores/documentStore';
import { useUiStore } from '../../stores/uiStore';
import { apiService } from '../../services/apiService';
import { UploadCloud, Loader2 } from 'lucide-react';
import { useToastStore } from '../../stores/toastStore';

export function UploadPanel({ userId }) {
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const setInputEnabled = useUiStore((s) => s.setInputEnabled);
  const setRuntimeStatus = useUiStore((s) => s.setRuntimeStatus);

  const triggerBatchUploadSequence = async () => {
    const selector = fileInputRef.current;
    if (!selector) return;

    const files = Array.from(selector.files);
    if (files.length === 0) {
      useToastStore.getState().addToast('Please select at least one PDF file.', 'error');
      return;
    }

    setUploading(true);

    try {
      for (let idx = 0; idx < files.length; idx++) {
        const file = files[idx];
        setRuntimeStatus(`[${idx + 1}/${files.length}] Uploading ${file.name}...`);

        const form = new FormData();
        form.append('file', file);
        form.append('user_id', userId);

        const res = await apiService.uploadPdf(form);
        if (!res.ok) {
          const err = await res.json();
          throw new Error(`Failed to upload ${file.name}: ${err.detail}`);
        }

        const { document_id } = await res.json();

        // 5-minute timeout polling (150 polls at 2-second intervals)
        let polls = 0;
        const maxPolls = 150;
        let statusComplete = false;

        while (polls < maxPolls) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          polls++;

          const statusRes = await apiService.getDocumentStatus(document_id);
          const currentStatus = statusRes.status;

          if (currentStatus === 'complete') {
            statusComplete = true;
            break;
          } else if (currentStatus === 'failed') {
            throw new Error(`Processing failed for ${file.name}: ${statusRes.error_message || 'unknown error'}`);
          }

          const statusLabels = {
            pending: 'Initializing...',
            parsing: 'Extracting text from PDF pages...',
            embedding: 'Generating vector embeddings...',
            indexing: 'Writing vectors to database...',
          };
          const label = statusLabels[currentStatus] || 'Processing...';
          setRuntimeStatus(`[${idx + 1}/${files.length}] ${file.name}: ${label}`);
        }

        if (!statusComplete) {
          throw new Error(`Processing is taking longer than expected for ${file.name}. Please check again later.`);
        }
      }

      selector.value = '';
      setInputEnabled(true);
      setRuntimeStatus('✅ Documents ready. Ask anything.');
    } catch (err) {
      useToastStore.getState().addToast(err.message || 'Error during file upload.', 'error');
      setRuntimeStatus('❌ Upload failed.');
    } finally {
      setUploading(false);
      // Refresh the document catalog list in the sidebar
      await useDocumentStore.getState().fetchAndRenderDocumentCatalog(userId);
    }
  };

  return (
    <div className="upload-control-panel">
      <input ref={fileInputRef} type="file" id="batch-pdf-uploader" accept=".pdf" multiple />
      <button
        type="button"
        disabled={uploading}
        onClick={triggerBatchUploadSequence}
        className="flex items-center justify-center gap-2"
      >
        {uploading ? (
          <Loader2 size={14} className="animate-spin shrink-0" />
        ) : (
          <UploadCloud size={14} className="shrink-0" />
        )}
        Upload Documents
      </button>
    </div>
  );
}
