import { CitationItem } from './CitationItem';

export function CitationList({ citations, activeCitationKey, onCitationClick }) {
  if (!citations || citations.length === 0) return null;

  return (
    <div className="citation-list">
      {citations.map(({ index, filename, page, snippet }) => {
        const key = `${filename}:${page}`;
        return (
          <CitationItem
            key={key}
            index={index}
            filename={filename}
            page={page}
            isActive={activeCitationKey === key}
            onClick={() => onCitationClick(filename, page, key, snippet)}
          />
        );
      })}
    </div>
  );
}
