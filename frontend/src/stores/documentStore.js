import { create } from 'zustand';
import { apiService } from '../services/apiService';
import { useToastStore } from './toastStore';

export const useDocumentStore = create((set) => ({
  documents: [],

  fetchAndRenderDocumentCatalog: async (userId) => {
    const documents = await apiService.getDocuments(userId);
    set({ documents });
    return documents;
  },

  executeDocumentPurge: async (documentId, userId) => {
    const res = await apiService.deleteDocument(documentId);
    if (!res.ok) {
      throw new Error('Failed to delete document.');
    }
    const documents = await apiService.getDocuments(userId);
    set({ documents });
    return documents;
  },

  triggerBatchUpload: async (userId, files) => {
    for (const file of files) {
      const form = new FormData();
      form.append('file', file);
      form.append('user_id', userId);

      try {
        const res = await apiService.uploadPdf(form);
        if (!res.ok) {
          const err = await res.json();
          useToastStore.getState().addToast(`Error uploading ${file.name}: ${err.detail}`, 'error');
        }
      } catch {
        useToastStore.getState().addToast(`Network error uploading ${file.name}.`, 'error');
      }
    }

    const documents = await apiService.getDocuments(userId);
    set({ documents });
    return documents;
  },
}));
