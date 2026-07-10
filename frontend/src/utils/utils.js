// utils.js — Shared utilities: markdown rendering + citation parsing
// Preserved from frontend/js/utils.js

export function formatTimestamp(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return isoString;

  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  const yesterday = new Date();
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  const timeFormatter = new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });

  const dateFormatter = new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });

  if (isToday) {
    return `Today, ${timeFormatter.format(date)}`;
  } else if (isYesterday) {
    return `Yesterday, ${timeFormatter.format(date)}`;
  } else {
    return dateFormatter.format(date);
  }
}

export function renderMarkdown(text) {
  // Detect ISO 8601 timestamps and format them in the user's local timezone
  const isoDateRegex = /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})\b/g;
  const processedText = text.replace(isoDateRegex, (match) => formatTimestamp(match));

  const lines = processedText.split('\n');
  let html = '';
  let inTable = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.includes('|')) {
      if (/^\|[\s\-:|]+\|$/.test(line.trim())) continue;

      if (!inTable) {
        html += '<table class="md-table"><tbody>';
        inTable = true;
      }
      const cells = line.split('|').filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
      const isHeader = lines[i + 1] && /^\|[\s\-:|]+\|$/.test(lines[i + 1].trim());
      const tag = isHeader ? 'th' : 'td';
      html += `<tr>${cells.map((c) => `<${tag}>${c.trim()}</${tag}>`).join('')}</tr>`;
    } else {
      if (inTable) {
        html += '</tbody></table>';
        inTable = false;
      }
      html +=
        line
          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
          .replace(/\*(.*?)\*/g, '<em>$1</em>')
          .replace(/`([^`]+)`/g, '<code>$1</code>') + '<br>';
    }
  }

  if (inTable) html += '</tbody></table>';
  return html;
}

/**
 * Parses [[cite:filename.pdf:page]] markers out of AI response text.
 * Returns:
 *   cleanText  — text with markers removed
 *   citations  — array of { index, filename, page }
 */
export function parseCitations(rawText, citationChunks = {}) {
  const citations = [];
  const seen = new Map();

  const cleanText = rawText.replace(/\[\[cite:([^:\]]+):(\d+)\]\]/g, (_match, filename, page) => {    const key = `${filename}:${page}`;
    let index;

    if (seen.has(key)) {
      index = seen.get(key);
    } else {
      index = citations.length + 1;
      citations.push({ index, filename, page: parseInt(page, 10), snippet: citationChunks[key] || null });
      seen.set(key, index);
    }
    return `<sup class="citation-ref" data-index="${index}">[${index}]</sup>`;
  });

  return { cleanText, citations };
}

export function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function stripCitationMarkers(rawText) {
  const seen = new Map();
  let counter = 0;
  return rawText.replace(/\[\[cite:([^:\]]+):(\d+)\]\]/g, (_match, filename, page) => {
    const key = `${filename}:${page}`;
    if (!seen.has(key)) {
      seen.set(key, ++counter);
    }
    return `[${seen.get(key)}]`;
  });
}