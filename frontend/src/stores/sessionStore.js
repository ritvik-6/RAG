import { create } from 'zustand';
import { apiService } from '../services/apiService';
import { generateUUID } from '../utils/utils';

export const useSessionStore = create((set, get) => ({
  activeSessionId: null,
  chatSessionsMemory: {},
  sessionMetadata: {}, // Stores { session_name, thread_id } for each session
  isStreaming: false,

  getActiveSessionId: () => get().activeSessionId,

  setStreaming: (val) => set({ isStreaming: val }),

  appendUserMessage: (sessionId, text) => {
    set((state) => ({
      chatSessionsMemory: {
        ...state.chatSessionsMemory,
        [sessionId]: [...(state.chatSessionsMemory[sessionId] || []), { text, classType: 'user-align' }],
      },
    }));
  },

  finalizeAiMessage: (sessionId, rawText, latencyMs) => {
    set((state) => ({
      chatSessionsMemory: {
        ...state.chatSessionsMemory,
        [sessionId]: [
          ...(state.chatSessionsMemory[sessionId] || []),
          {
            text: rawText,
            classType: 'ai-align',
            latency_ms: latencyMs,
            created_at: new Date().toISOString()
          }
        ],
      },
      isStreaming: false,
    }));
  },

  finalizeErrorMessage: (sessionId, message) => {
    const text = `Error: ${message}`;
    set((state) => ({
      chatSessionsMemory: {
        ...state.chatSessionsMemory,
        [sessionId]: [...(state.chatSessionsMemory[sessionId] || []), { text, classType: 'ai-align' }],
      },
      isStreaming: false,
    }));
  },

  restoreSessionsFromBackend: async (userId, urlThreadId, { onHasPdf, onNoPdf, onOffline }) => {
    try {
      const data = await apiService.getHistory(userId);

      if (data.has_pdf) {
        onHasPdf?.();
      } else {
        onNoPdf?.();
      }

      const sessions = data.sessions;
      const meta = data.session_meta || {};

      if (Object.keys(sessions).length === 0) {
        const newId = generateUUID();
        set({
          activeSessionId: newId,
          chatSessionsMemory: {
            [newId]: [{ text: 'Hello! Upload a PDF to get started.', classType: 'ai-align' }],
          },
          sessionMetadata: {
            [newId]: { session_name: 'New Conversation', thread_id: null }
          }
        });
      } else {
        const chatSessionsMemory = {};
        const sessionMetadata = {};

        Object.entries(sessions).forEach(([sid, messages], index) => {
          chatSessionsMemory[sid] = messages.map((m) => ({
            text: m.text,
            classType: m.sender === 'user' ? 'user-align' : 'ai-align',
            created_at: m.created_at,
            latency_ms: m.latency_ms,
          }));

          sessionMetadata[sid] = {
            session_name: meta[sid]?.session_name || `Chat Session ${index + 1}`,
            thread_id: meta[sid]?.thread_id || null,
          };
        });

        const sessionIds = Object.keys(sessions);

        // Prefer the session matching the current URL; only fall back
        // to "most recent" if there's no URL thread or it isn't found.
        let initialActiveId = sessionIds[sessionIds.length - 1];
        if (urlThreadId) {
          const matched = sessionIds.find(
            (sid) => sessionMetadata[sid]?.thread_id === urlThreadId
          );
          if (matched) initialActiveId = matched;
        }

        set({
          chatSessionsMemory,
          sessionMetadata,
          activeSessionId: initialActiveId,
        });
      }
    } catch (err) {
      console.error('History restoration failed:', err);
      onOffline?.();
      const newId = generateUUID();
      set({
        activeSessionId: newId,
        chatSessionsMemory: {
          [newId]: [{ text: 'Hello! Upload a PDF to get started.', classType: 'ai-align' }],
        },
        sessionMetadata: {
          [newId]: { session_name: 'New Conversation', thread_id: null }
        }
      });
    }
  },

  createNewSession: () => {
    const newId = generateUUID();
    set((state) => ({
      activeSessionId: newId,
      chatSessionsMemory: {
        ...state.chatSessionsMemory,
        [newId]: [{ text: 'New session started. Ask away!', classType: 'ai-align' }],
      },
      sessionMetadata: {
        ...state.sessionMetadata,
        [newId]: {
          session_name: 'New Conversation',
          thread_id: null,
        }
      }
    }));
  },

  updateSessionThreadId: (sessionId, threadId) => {
    set((state) => ({
      sessionMetadata: {
        ...state.sessionMetadata,
        [sessionId]: {
          ...state.sessionMetadata[sessionId],
          thread_id: threadId,
        }
      }
    }));
  },

  switchActiveSession: (sessionId) => {
    set({ activeSessionId: sessionId });
  },

  deleteSession: async (sessionId) => {
    const response = await apiService.deleteSession(sessionId);
    if (!response.ok) {
      throw new Error('Failed to delete session.');
    }

    set((state) => {
      const nextMemory = { ...state.chatSessionsMemory };
      delete nextMemory[sessionId];
      const nextMetadata = { ...state.sessionMetadata };
      delete nextMetadata[sessionId];
      return {
        chatSessionsMemory: nextMemory,
        sessionMetadata: nextMetadata,
      };
    });

    const { activeSessionId, chatSessionsMemory } = get();
    const remaining = Object.keys(chatSessionsMemory);

    if (activeSessionId === sessionId) {
      if (remaining.length > 0) {
        set({ activeSessionId: remaining[remaining.length - 1] });
      } else {
        get().createNewSession();
      }
    }
  },

  renameSession: async (sessionId, newName) => {
    const oldMeta = get().sessionMetadata[sessionId];
    const oldName = oldMeta?.session_name;

    // Optimistic update
    set((state) => ({
      sessionMetadata: {
        ...state.sessionMetadata,
        [sessionId]: {
          ...state.sessionMetadata[sessionId],
          session_name: newName,
        }
      }
    }));

    try {
      const res = await apiService.renameSession(sessionId, newName);
      if (!res.ok) {
        throw new Error('Failed to rename session on the server.');
      }
      const updated = await res.json();

      // Update with exact values from the server response
      set((state) => ({
        sessionMetadata: {
          ...state.sessionMetadata,
          [sessionId]: {
            session_name: updated.session_name,
            thread_id: updated.thread_id,
          }
        }
      }));
    } catch (err) {
      console.error('Renaming failed, rolling back:', err);
      // Rollback to the previous name
      set((state) => ({
        sessionMetadata: {
          ...state.sessionMetadata,
          [sessionId]: {
            ...state.sessionMetadata[sessionId],
            session_name: oldName,
          }
        }
      }));
      throw err;
    }
  },
}));
