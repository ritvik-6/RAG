import { useRef, useState } from 'react';
import { useDocumentStore } from '../../stores/documentStore';
import { useUiStore } from '../../stores/uiStore';
import { UploadCloud, Loader2 } from 'lucide-react';

export function UploadPanel({ userId }) {
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const triggerBatchUpload = useDocumentStore((s) => s.triggerBatchUpload);
  const setInputEnabled = useUiStore((s) => s.setInputEnabled);
  const setRuntimeStatus = useUiStore((s) => s.setRuntimeStatus);

  const triggerBatchUploadSequence = async () => {
    const selector = fileInputRef.current;
    if (!selector) return;

    const files = selector.files;
    if (files.length === 0) {
      alert('Please select at least one PDF file.');
      return;
    }

    setUploading(true);
    setRuntimeStatus(`Uploading ${files.length} file(s)...`);

    try {
      await triggerBatchUpload(userId, Array.from(files));
      selector.value = '';
      setInputEnabled(true);
      setRuntimeStatus('✅ Documents ready. Ask anything.');
    } catch (err) {
      alert(err.message || 'Network error during upload.');
    } finally {
      setUploading(false);
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
          <Loader2 size={18} className="animate-spin shrink-0" />
        ) : (
          <UploadCloud size={18} className="shrink-0" />
        )}
        Upload Documents
      </button>
    </div>
  );
}
