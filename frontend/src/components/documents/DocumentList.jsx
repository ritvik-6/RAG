import { useState } from 'react';
import { useDocumentStore } from '../../stores/documentStore';
import { useUiStore } from '../../stores/uiStore';
import { DocumentItem } from './DocumentItem';
import { ConfirmModal } from '../common/ConfirmModal';
import { useToastStore } from '../../stores/toastStore';

export function DocumentList({ userId }) {
  const documents = useDocumentStore((s) => s.documents);
  const executeDocumentPurge = useDocumentStore((s) => s.executeDocumentPurge);
  const setInputEnabled = useUiStore((s) => s.setInputEnabled);
  const setRuntimeStatus = useUiStore((s) => s.setRuntimeStatus);

  const [deleteDocId, setDeleteDocId] = useState(null);
  const addToast = useToastStore((s) => s.addToast);

  const handleDeleteConfirm = async () => {
    if (!deleteDocId) return;
    try {
      const remaining = await executeDocumentPurge(deleteDocId, userId);
      if (remaining.length === 0) {
        setInputEnabled(false);
        setRuntimeStatus("Upload a PDF to get started.");
      }
      addToast("Document deleted successfully", "success");
    } catch (err) {
      const msg = err.message === 'Failed to delete document.' ? 'Failed to delete document.' : 'Connection error during document deletion.';
      addToast(msg, "error");
    } finally {
      setDeleteDocId(null);
    }
  };

  if (documents.length === 0) {
    return <div className="docs-empty">No documents uploaded yet.</div>;
  }

  return (
    <>
      <ConfirmModal
        isOpen={deleteDocId !== null}
        title="Delete document?"
        message="Permanently delete this document from all storage layers? This cannot be undone."
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteDocId(null)}
        confirmLabel="Delete"
        destructive={true}
      />
      {documents.map((doc) => (
        <DocumentItem
          key={doc.document_id}
          filename={doc.filename}
          uploadTime={doc.upload_time}
          onDelete={(e) => {
            e?.stopPropagation?.();
            setDeleteDocId(doc.document_id);
          }}
        />
      ))}
    </>
  );
}
