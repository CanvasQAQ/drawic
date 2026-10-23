import React from "react";

export interface PageBarItem {
  id: string;
  name: string;
}

interface PageBarProps {
  pages: readonly PageBarItem[];
  activePageId: string;
  onSelect: (pageId: string) => void;
  onAdd: () => void;
  onRename: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onMove: (pageId: string, direction: -1 | 1) => void;
}

export function PageBar({
  pages,
  activePageId,
  onSelect,
  onAdd,
  onRename,
  onDuplicate,
  onDelete,
  onMove,
}: PageBarProps) {
  const activeIndex = pages.findIndex((page) => page.id === activePageId);
  const canMoveLeft = activeIndex > 0;
  const canMoveRight = activeIndex >= 0 && activeIndex < pages.length - 1;

  return (
    <nav className="page-bar" aria-label="Drawing pages">
      <div className="page-bar-heading">
        <span className="eyebrow">Pages</span>
        <span>{pages.length}</span>
      </div>
      <div className="page-tabs" role="tablist" aria-label="Drawing pages">
        {pages.map((page, index) => (
          <button
            key={page.id}
            type="button"
            role="tab"
            aria-selected={page.id === activePageId}
            className={`page-tab${page.id === activePageId ? " is-active" : ""}`}
            onClick={() => onSelect(page.id)}
            onDoubleClick={() => {
              onSelect(page.id);
              onRename();
            }}
            title={`${page.name} — page ${index + 1}`}
          >
            <span className="page-index">{index + 1}</span>
            <span>{page.name}</span>
          </button>
        ))}
        <button
          type="button"
          className="page-add"
          onClick={onAdd}
          title="Add page"
          aria-label="Add page"
        >
          +
        </button>
      </div>
      <div className="page-actions">
        <button type="button" onClick={() => onMove(activePageId, -1)} disabled={!canMoveLeft}>
          Move left
        </button>
        <button type="button" onClick={() => onMove(activePageId, 1)} disabled={!canMoveRight}>
          Move right
        </button>
        <button type="button" onClick={onRename}>
          Rename
        </button>
        <button type="button" onClick={onDuplicate}>
          Duplicate
        </button>
        <button
          type="button"
          className="page-delete"
          onClick={onDelete}
          disabled={pages.length <= 1}
        >
          Delete
        </button>
      </div>
    </nav>
  );
}
