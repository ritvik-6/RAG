// citations.js — Citation list renderer below AI bubbles
import PDFViewer from './components/pdfViewer.js';

/**
 * Renders a citation list below an AI message bubble.
 * @param {Array} citations - [{ index, filename, page }]
 * @param {HTMLElement} bubbleEl - The AI bubble element to append citations after
 */
export function renderCitationList(citations, bubbleEl) {
    if (!citations || citations.length === 0) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'citation-list';

    citations.forEach(({ index, filename, page }) => {
        const item = document.createElement('button');
        item.className = 'citation-item';
        item.dataset.filename = filename;
        item.dataset.page = page;
        item.innerHTML = `
            <span class="citation-number">[${index}]</span>
            <span class="citation-text">
                <span class="citation-filename">${filename}</span>
                <span class="citation-page">· p.${page}</span>
            </span>
            <span class="citation-icon">📄</span>
        `;

        item.addEventListener('click', () => {
            // Toggle active state visually
            const allItems = wrapper.querySelectorAll('.citation-item');
            const isActive = item.classList.contains('active');
            allItems.forEach(el => el.classList.remove('active'));

            if (!isActive) {
                item.classList.add('active');
            }

            PDFViewer.toggle(filename, page);
        });

        wrapper.appendChild(item);
    });

    // Insert citation list right after the bubble
    bubbleEl.insertAdjacentElement('afterend', wrapper);
}