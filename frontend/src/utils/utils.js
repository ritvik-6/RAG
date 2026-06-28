// utils.js — Shared utilities: markdown rendering + citation parsing
// Preserved from frontend/js/utils.js

export function renderMarkdown(text) {
  const lines = text.split('\n');
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
export function parseCitations(rawText) {
  const citations = [];
  const seen = new Map();

  const cleanText = rawText.replace(/\[\[cite:([^:\]]+):(\d+)\]\]/g, (_match, filename, page) => {
    const key = `${filename}:${page}`;
    let index;

    if (seen.has(key)) {
      index = seen.get(key);
    } else {
      index = citations.length + 1;
      citations.push({ index, filename, page: parseInt(page, 10) });
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
