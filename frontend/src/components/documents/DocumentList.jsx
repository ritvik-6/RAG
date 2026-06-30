import { useDocumentStore } from '../../stores/documentStore';
import { useUiStore } from '../../stores/uiStore';
import { DocumentItem } from './DocumentItem';

export function DocumentList({ userId }) {
  const documents = useDocumentStore((s) => s.documents);
  const executeDocumentPurge = useDocumentStore((s) => s.executeDocumentPurge);
  const setInputEnabled = useUiStore((s) => s.setInputEnabled);
  const setRuntimeStatus = useUiStore((s) => s.setRuntimeStatus);

  const handleDelete = async (documentId) => {
    if (!confirm('Permanently delete this document from all storage layers?')) return;

    try {
      const remaining = await executeDocumentPurge(documentId, userId);
      console.log("Remaining documents:", remaining);
      console.log("Remaining count:", remaining.length);
      if (remaining.length === 0) {
        console.log("Last document deleted");
        setInputEnabled(false);
        setRuntimeStatus("Upload a PDF to get started.");
      }
    } catch (err) {
      alert(err.message === 'Failed to delete document.' ? 'Failed to delete document.' : 'Connection error during document deletion.');
    }
  };

  if (documents.length === 0) {
    return <div className="docs-empty">No documents uploaded yet.</div>;
  }

  return (
    <>
      {documents.map((doc) => (
        <DocumentItem
          key={doc.document_id}
          filename={doc.filename}
          uploadTime={doc.upload_time}
          onDelete={(e) => {
            e?.stopPropagation?.();
            handleDelete(doc.document_id);
          }}
        />
      ))}
    </>
  );
}
