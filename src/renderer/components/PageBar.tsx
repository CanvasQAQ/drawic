import React, { useCallback, useRef, useState } from "react";
import { ContextMenu, type ContextMenuEntry } from "./ContextMenu";

export interface PageBarItem {
  id: string;
  name: string;
}

interface PageBarProps {
  pages: readonly PageBarItem[];
  activePageId: string;
  onSelect: (pageId: string) => void;
  onAdd: () => void;
  onRenamePage: (pageId: string) => void;
  onDuplicatePage: (pageId: string) => void;
  onDeletePage: (pageId: string) => void;
  onMoveTo: (pageId: string, index: number) => void;
}

const DRAG_THRESHOLD = 4;

interface PageMenuState {
  x: number;
  y: number;
  pageId: string;
}

export function PageBar({
  pages,
  activePageId,
  onSelect,
  onAdd,
  onRenamePage,
  onDuplicatePage,
  onDeletePage,
  onMoveTo,
}: PageBarProps) {
  const tablistRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());
  const dragRef = useRef<{
    pageId: string;
    startX: number;
    active: boolean;
    pointerId: number;
  } | null>(null);
  const suppressClickRef = useRef(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [menu, setMenu] = useState<PageMenuState | null>(null);

  const indexOf = (pageId: string): number =>
    pages.findIndex((page) => page.id === pageId);

  const computeDropIndex = (clientX: number): number => {
    const tabs = Array.from(
      tablistRef.current?.querySelectorAll<HTMLElement>(".page-tab") ?? [],
    );
    let index = 0;
    for (const tab of tabs) {
      const rect = tab.getBoundingClientRect();
      if (clientX > rect.left + rect.width / 2) {
        index += 1;
      }
    }
    return index;
  };

  const handlePointerDown = (
    event: React.PointerEvent<HTMLButtonElement>,
    pageId: string,
  ): void => {
    if (event.button !== 0) {
      return;
    }
    dragRef.current = {
      pageId,
      startX: event.clientX,
      active: false,
      pointerId: event.pointerId,
    };
  };

  const handlePointerMove = (
    event: React.PointerEvent<HTMLButtonElement>,
  ): void => {
    const drag = dragRef.current;
    if (!drag) {
      return;
    }
    if (!drag.active) {
      if (Math.abs(event.clientX - drag.startX) < DRAG_THRESHOLD) {
        return;
      }
      drag.active = true;
      setDraggingId(drag.pageId);
      event.currentTarget.setPointerCapture?.(drag.pointerId);
    }
    setDropIndex(computeDropIndex(event.clientX));
  };

  const handlePointerUp = (
    event: React.PointerEvent<HTMLButtonElement>,
  ): void => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) {
      return;
    }
    if (!drag.active) {
      return;
    }
    suppressClickRef.current = true;
    setDraggingId(null);
    const rawIndex = computeDropIndex(event.clientX);
    setDropIndex(null);
    const sourceIndex = indexOf(drag.pageId);
    const targetIndex = rawIndex > sourceIndex ? rawIndex - 1 : rawIndex;
    if (targetIndex !== sourceIndex) {
      onMoveTo(drag.pageId, targetIndex);
    }
  };

  const moveBy = (pageId: string, direction: -1 | 1): void => {
    const index = indexOf(pageId);
    const target = index + direction;
    if (index >= 0 && target >= 0 && target < pages.length) {
      onMoveTo(pageId, target);
      window.requestAnimationFrame(() => tabRefs.current.get(pageId)?.focus());
    }
  };

  const menuEntries = useCallback(
    (pageId: string): ContextMenuEntry[] => {
      const index = pages.findIndex((page) => page.id === pageId);
      return [
        {
          kind: "item",
          id: "rename",
          label: "Rename",
          onSelect: () => onRenamePage(pageId),
        },
        {
          kind: "item",
          id: "move-left",
          label: "Move left",
          disabled: index <= 0,
          onSelect: () => moveBy(pageId, -1),
        },
        {
          kind: "item",
          id: "move-right",
          label: "Move right",
          disabled: index < 0 || index >= pages.length - 1,
          onSelect: () => moveBy(pageId, 1),
        },
        "separator",
        {
          kind: "item",
          id: "duplicate",
          label: "Duplicate",
          onSelect: () => onDuplicatePage(pageId),
        },
        {
          kind: "item",
          id: "delete",
          label: "Delete",
          disabled: pages.length <= 1,
          onSelect: () => onDeletePage(pageId),
        },
      ];
    },
    [onDeletePage, onDuplicatePage, onRenamePage, pages],
  );

  return (
    <nav className="page-bar" aria-label="Drawing pages">
      <div className="page-bar-heading">
        <span className="eyebrow">Pages</span>
        <span>{pages.length}</span>
      </div>
      <div
        ref={tablistRef}
        className="page-tabs"
        role="tablist"
        aria-label="Drawing pages"
      >
        {pages.map((page, index) => (
          <button
            key={page.id}
            ref={(element) => {
              if (element) {
                tabRefs.current.set(page.id, element);
              } else {
                tabRefs.current.delete(page.id);
              }
            }}
            type="button"
            role="tab"
            aria-selected={page.id === activePageId}
            aria-label={`${page.name}, page ${index + 1} of ${pages.length}`}
            className={`page-tab${page.id === activePageId ? " is-active" : ""}${
              draggingId === page.id ? " is-dragging" : ""
            }${dropIndex === index ? " is-drop-before" : ""}`}
            onClick={() => {
              if (suppressClickRef.current) {
                suppressClickRef.current = false;
                return;
              }
              onSelect(page.id);
            }}
            onDoubleClick={() => {
              if (suppressClickRef.current) {
                return;
              }
              onSelect(page.id);
              onRenamePage(page.id);
            }}
            onPointerDown={(event) => handlePointerDown(event, page.id)}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={() => {
              dragRef.current = null;
              setDraggingId(null);
              setDropIndex(null);
            }}
            onContextMenu={(event) => {
              event.preventDefault();
              onSelect(page.id);
              setMenu({ x: event.clientX, y: event.clientY, pageId: page.id });
            }}
            onKeyDown={(event) => {
              if (event.key === "F10" && event.shiftKey) {
                event.preventDefault();
                const rect = event.currentTarget.getBoundingClientRect();
                setMenu({
                  x: rect.left + rect.width / 2,
                  y: rect.bottom,
                  pageId: page.id,
                });
                return;
              }
              if (
                event.altKey &&
                (event.key === "ArrowLeft" || event.key === "ArrowRight")
              ) {
                event.preventDefault();
                moveBy(page.id, event.key === "ArrowLeft" ? -1 : 1);
              }
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
      {menu ? (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          label="Page actions"
          entries={menuEntries(menu.pageId)}
          onClose={() => setMenu(null)}
        />
      ) : null}
    </nav>
  );
}
