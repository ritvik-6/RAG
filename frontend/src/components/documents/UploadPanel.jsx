import { useRef, useState } from 'react';
import { useDocumentStore } from '../../stores/documentStore';
import { useUiStore } from '../../stores/uiStore';
import { apiService } from '../../services/apiService';
import { UploadCloud, Loader2, FileText, X } from 'lucide-react';
import { useToastStore } from '../../stores/toastStore';

export function UploadPanel({ userId }) {
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [pendingFiles, setPendingFiles] = useState([]);
  const setInputEnabled = useUiStore((s) => s.setInputEnabled);
  const setRuntimeStatus = useUiStore((s) => s.setRuntimeStatus);

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const processFiles = (filesList) => {
    const newPending = [];
    for (let i = 0; i < filesList.length; i++) {
      const file = filesList[i];
      if (file.type !== 'application/pdf' && !file.name.endsWith('.pdf')) {
        useToastStore.getState().addToast(`"${file.name}" is not a PDF. Only PDFs are allowed.`, 'error');
        continue;
      }
      // Avoid duplicates
      if (pendingFiles.some(f => f.file.name === file.name && f.file.size === file.size)) {
        continue;
      }
      newPending.push({
        id: `${file.name}-${file.size}-${Date.now()}-${i}-${Math.random()}`,
        file,
        status: 'pending',
        progressLabel: 'Ready'
      });
    }
    if (newPending.length > 0) {
      setPendingFiles((prev) => [...prev, ...newPending]);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
      e.target.value = '';
    }
  };

  const handleDropzoneClick = (e) => {
    if (e.target.closest('button') || e.target.closest('.pending-file-item')) {
      return;
    }
    fileInputRef.current?.click();
  };

  const removePendingFile = (id) => {
    setPendingFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const triggerBatchUploadSequence = async () => {
    if (pendingFiles.length === 0) {
      useToastStore.getState().addToast('Please select at least one PDF file.', 'error');
      return;
    }

    setUploading(true);
    setInputEnabled(false);
    setRuntimeStatus(`Uploading ${pendingFiles.length} files...`);

    try {
      for (let idx = 0; idx < pendingFiles.length; idx++) {
        const pendingItem = pendingFiles[idx];
        
        // Update specific file status to uploading
        setPendingFiles((prev) =>
          prev.map((f) =>
            f.id === pendingItem.id
              ? { ...f, status: 'uploading', progressLabel: 'Uploading...' }
              : f
          )
        );
        setRuntimeStatus(`[${idx + 1}/${pendingFiles.length}] Uploading ${pendingItem.file.name}...`);

        try {
          const form = new FormData();
          form.append('file', pendingItem.file);
          form.append('user_id', userId);

          const res = await apiService.uploadPdf(form);
          if (!res.ok) {
            const err = await res.json();
            throw new Error(`Failed to upload ${pendingItem.file.name}: ${err.detail}`);
          }

          const { document_id } = await res.json();

          // 5-minute timeout polling (150 polls at 2-second intervals)
          let polls = 0;
          const maxPolls = 150;
          let statusComplete = false;

          setPendingFiles((prev) =>
            prev.map((f) =>
              f.id === pendingItem.id
                ? { ...f, progressLabel: 'Processing...' }
                : f
            )
          );

          while (polls < maxPolls) {
            await new Promise((resolve) => setTimeout(resolve, 2000));
            polls++;

            const statusRes = await apiService.getDocumentStatus(document_id);
            const currentStatus = statusRes.status;

            if (currentStatus === 'complete') {
              statusComplete = true;
              break;
            } else if (currentStatus === 'failed') {
              throw new Error(`Processing failed: ${statusRes.error_message || 'unknown error'}`);
            }

            const statusLabels = {
              pending: 'Initializing...',
              parsing: 'Parsing...',
              embedding: 'Embedding...',
              indexing: 'Indexing...',
            };
            const label = statusLabels[currentStatus] || 'Processing...';
            setPendingFiles((prev) =>
              prev.map((f) =>
                f.id === pendingItem.id
                  ? { ...f, progressLabel: label }
                  : f
              )
            );
            setRuntimeStatus(`[${idx + 1}/${pendingFiles.length}] ${pendingItem.file.name}: ${label}`);
          }

          if (!statusComplete) {
            throw new Error(`Processing is taking longer than expected.`);
          }

          // Mark specific file as complete
          setPendingFiles((prev) =>
            prev.map((f) =>
              f.id === pendingItem.id
                ? { ...f, status: 'complete', progressLabel: 'Complete' }
                : f
            )
          );
        } catch (err) {
          console.error(err);
          setPendingFiles((prev) =>
            prev.map((f) =>
              f.id === pendingItem.id
                ? { ...f, status: 'failed', progressLabel: err.message || 'Failed' }
                : f
            )
          );
          useToastStore.getState().addToast(err.message || `Error uploading ${pendingItem.file.name}`, 'error');
        }
      }

      setRuntimeStatus('✅ Batch processed.');
      
      // Auto-clear list of completed files after a delay, keeping only failed ones if any
      setTimeout(() => {
        setPendingFiles((prev) => prev.filter((f) => f.status === 'failed'));
      }, 5000);
    } catch (err) {
      useToastStore.getState().addToast(err.message || 'Error during file upload.', 'error');
      setRuntimeStatus('❌ Upload failed.');
    } finally {
      setUploading(false);
      setInputEnabled(true);
      // Refresh the document catalog list in the sidebar
      await useDocumentStore.getState().fetchAndRenderDocumentCatalog(userId);
    }
  };

  return (
    <div className="upload-container flex flex-col gap-3">
      <div
        className={`upload-dropzone flex flex-col items-center justify-center p-5 border-2 border-dashed rounded-lg transition-all cursor-pointer select-none ${
          isDragging
            ? 'border-[var(--brand)] bg-[var(--border-muted)]'
            : 'border-[var(--border)] hover:border-zinc-400 bg-[var(--surface)]'
        }`}
        onClick={handleDropzoneClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          multiple
          className="hidden"
          onChange={handleFileChange}
          disabled={uploading}
        />
        <UploadCloud size={24} className="text-[var(--text-muted)] mb-2 pointer-events-none" />
        <p className="text-xs font-medium text-[var(--text-dark)] text-center pointer-events-none">
          Drag & drop PDFs here, or <span className="text-[var(--text-dark)] font-semibold underline">browse</span>
        </p>
        <p className="text-[10px] text-[var(--text-muted)] mt-1 pointer-events-none">Accepts PDF files only</p>
      </div>

      {pendingFiles.length > 0 && (
        <div className="pending-files-container flex flex-col gap-2 mt-1">
          <div className="flex items-center justify-between text-[11px] font-semibold text-[var(--text-muted)] px-1">
            <span>Selected Files ({pendingFiles.length})</span>
            {!uploading && (
              <button
                type="button"
                className="text-[var(--text-dark)] hover:underline p-0 bg-transparent font-semibold border-none cursor-pointer"
                onClick={() => setPendingFiles([])}
              >
                Clear all
              </button>
            )}
          </div>
          
          <div className="pending-files-list max-h-32 overflow-y-auto flex flex-col gap-1.5 pr-1">
            {pendingFiles.map((pf) => (
              <div
                key={pf.id}
                className="pending-file-item flex items-center justify-between p-2 rounded bg-zinc-50 border border-zinc-100 text-xs"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1 pointer-events-none">
                  <FileText size={14} className="text-zinc-400 shrink-0" />
                  <div className="flex flex-col min-w-0">
                    <span className="truncate font-medium text-[var(--text-dark)]" title={pf.file.name}>
                      {pf.file.name}
                    </span>
                    <span className="text-[10px] text-[var(--text-muted)]">
                      {formatFileSize(pf.file.size)}
                    </span>
                  </div>
                </div>
                
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                    pf.status === 'pending' ? 'bg-zinc-100 text-zinc-600' :
                    pf.status === 'uploading' ? 'bg-indigo-50 text-indigo-600 animate-pulse' :
                    pf.status === 'complete' ? 'bg-emerald-50 text-emerald-600' :
                    'bg-red-50 text-red-600'
                  }`}>
                    {pf.progressLabel}
                  </span>
                  
                  {!uploading && (
                    <button
                      type="button"
                      className="p-0.5 hover:bg-zinc-200 rounded text-zinc-400 hover:text-zinc-600 transition-colors bg-transparent border-none flex items-center justify-center cursor-pointer"
                      onClick={() => removePendingFile(pf.id)}
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            disabled={uploading}
            onClick={triggerBatchUploadSequence}
            className="flex items-center justify-center gap-2 w-full mt-1"
          >
            {uploading ? (
              <>
                <Loader2 size={12} className="animate-spin shrink-0" />
                Uploading batch...
              </>
            ) : (
              <>
                <UploadCloud size={12} className="shrink-0" />
                Upload {pendingFiles.length} File{pendingFiles.length > 1 ? 's' : ''}
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
