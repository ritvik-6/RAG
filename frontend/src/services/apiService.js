const HOST = import.meta.env.VITE_API_HOST || 'http://localhost:8000';

/**
 * Stub for future authentication headers.
 */
export function getAuthHeaders() {
  return {};
}

async function request(url, options = {}) {
  const headers = {
    ...getAuthHeaders(),
    ...options.headers,
  };

  const response = await fetch(`${HOST}${url}`, { ...options, headers });
  return response;
}

export const apiService = {
  host: HOST,

  async getDocuments(userId) {
    const response = await request(`/documents/${userId}`);
    if (!response.ok) throw new Error('Could not fetch documents.');
    return response.json();
  },

  async deleteDocument(documentId) {
    return request(`/documents/${documentId}`, { method: 'DELETE' });
  },

  async uploadPdf(formData) {
    return request('/upload', { method: 'POST', body: formData });
  },

  async getDocumentStatus(documentId) {
    const response = await request(`/documents/${documentId}/status`);
    if (!response.ok) throw new Error('Could not fetch document status.');
    return response.json();
  },

  async getHistory(userId) {
    const response = await request(`/history/${userId}`);
    if (!response.ok) throw new Error('History fetch failed.');
    return response.json();
  },

  async deleteSession(sessionId) {
    return request(`/session/${sessionId}`, { method: 'DELETE' });
  },

  async renameSession(sessionId, newName) {
    return request(`/session/${sessionId}/rename`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_name: newName }),
    });
  },

  getFileUrl(diskFilename, page) {
    return `${HOST}/files/${encodeURIComponent(diskFilename)}#page=${page}`;
  },
};
