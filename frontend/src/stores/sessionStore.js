import { create } from 'zustand';
import { apiService } from '../services/apiService';
import { generateUUID } from '../utils/utils';

export const useSessionStore = create((set, get) => ({
  activeSessionId: null,
  chatSessionsMemory: {},
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

  finalizeAiMessage: (sessionId, rawText) => {
    set((state) => ({
      chatSessionsMemory: {
        ...state.chatSessionsMemory,
        [sessionId]: [...(state.chatSessionsMemory[sessionId] || []), { text: rawText, classType: 'ai-align' }],
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

  restoreSessionsFromBackend: async (userId, { onHasPdf, onNoPdf, onOffline }) => {
    try {
      const data = await apiService.getHistory(userId);

      if (data.has_pdf) {
        onHasPdf?.();
      } else {
        onNoPdf?.();
      }

      const sessions = data.sessions;

      if (Object.keys(sessions).length === 0) {
        const newId = generateUUID();
        set({
          activeSessionId: newId,
          chatSessionsMemory: {
            [newId]: [{ text: 'Hello! Upload a PDF to get started.', classType: 'ai-align' }],
          },
        });
      } else {
        const chatSessionsMemory = {};
        Object.entries(sessions).forEach(([sid, messages]) => {
          chatSessionsMemory[sid] = messages.map((m) => ({
            text: m.text,
            classType: m.sender === 'user' ? 'user-align' : 'ai-align',
          }));
        });
        const sessionIds = Object.keys(sessions);
        set({
          chatSessionsMemory,
          activeSessionId: sessionIds[sessionIds.length - 1],
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
      const next = { ...state.chatSessionsMemory };
      delete next[sessionId];
      return { chatSessionsMemory: next };
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
}));
