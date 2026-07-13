import { create } from 'zustand';
import { getUserId } from '../lib/userId';
import { apiService } from '../services/apiService';

export const usePdfStore = create((set, get) => ({
  isOpen: false,
  currentKey: null,
  filename: null,
  page: null,
  quote: null,
  answerSentence: null,
  fallbackText: null,
  iframeSrc: '',
  title: 'Document Viewer',

  toggle: (filename, page, snippet, answerSentence, quote) => {
    const key = `${filename}:${page}`;
    const { isOpen, currentKey } = get();
    if (isOpen && currentKey === key) {
      get().close();
      return;
    }
    get().open(filename, page, key, snippet, answerSentence, quote);
  },

  open: (filename, page, key, snippet, answerSentence, quote) => {
    const userId = getUserId() || '';
    const diskFilename = `${userId}_${filename}`;
    const url = apiService.getFileUrl(diskFilename, page);

    set({
      isOpen: true,
      currentKey: key || `${filename}:${page}`,
      filename,
      page,
      quote: quote || null,
      answerSentence: answerSentence || null,
      fallbackText: snippet || null,
      iframeSrc: url,
      title: `${filename} — Page ${page}`,
    });
  },

  close: () => {
    set({
      isOpen: false,
      currentKey: null,
      filename: null,
      page: null,
      quote: null,
      answerSentence: null,
      fallbackText: null,
      iframeSrc: '',
      title: 'Document Viewer',
    });
  },
}));
