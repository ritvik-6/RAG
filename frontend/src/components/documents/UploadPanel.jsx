import { useRef, useState } from 'react';
import { useDocumentStore } from '../../stores/documentStore';
import { useUiStore } from '../../stores/uiStore';

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
      <button type="button" disabled={uploading} onClick={triggerBatchUploadSequence}>
        Upload Documents
      </button>
    </div>
  );
}
