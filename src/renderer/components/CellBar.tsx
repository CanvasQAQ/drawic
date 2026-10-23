import type { DrawicDocument } from "../../core/model";
import { Icon } from "./Icons";

interface CellBarProps {
  document: DrawicDocument;
  onSelectCell: (cellId: string) => void;
  onNewCell: () => void;
  onRenameCell: () => void;
  onSetTop: () => void;
}

export function CellBar({
  document,
  onSelectCell,
  onNewCell,
  onRenameCell,
  onSetTop,
}: CellBarProps) {
  const active = document.cells.find((cell) => cell.id === document.activeCellId);
  const top = document.cells.find((cell) => cell.isTop);
  return (
    <div className="cell-bar" aria-label="Schematic cells">
      <div className="hierarchy-trail">
        <span className="hierarchy-root">Project</span>
        <Icon name="chevron" />
        <span>{top?.name ?? "No top"}</span>
        {active && active.id !== top?.id ? (
          <>
            <Icon name="chevron" />
            <strong>{active.name}</strong>
          </>
        ) : null}
      </div>
      <div className="cell-tabs" role="tablist" aria-label="Cells">
        {document.cells.map((cell) => (
          <button
            key={cell.id}
            type="button"
            role="tab"
            aria-selected={cell.id === document.activeCellId}
            className={`cell-tab${cell.id === document.activeCellId ? " is-active" : ""}`}
            onClick={() => onSelectCell(cell.id)}
          >
            {cell.isTop ? <span className="top-marker">TOP</span> : null}
            <span>{cell.name}</span>
          </button>
        ))}
      </div>
      <div className="cell-actions">
        <button type="button" onClick={onNewCell}>
          + Cell
        </button>
        <button type="button" onClick={onRenameCell}>
          Rename
        </button>
        <button type="button" onClick={onSetTop} disabled={active?.isTop}>
          Set Top
        </button>
      </div>
    </div>
  );
}
