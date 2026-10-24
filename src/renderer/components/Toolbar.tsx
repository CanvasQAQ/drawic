import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icons";

export type EditorTool =
  | "select"
  | "wire"
  | "junction"
  | "net-label"
  | "text"
  | "rectangle"
  | "ellipse"
  | "place";

interface ToolButtonProps {
  label: string;
  icon: IconName;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  shortcut?: string;
  description?: string;
}

function ToolButton({
  label,
  icon,
  active = false,
  disabled = false,
  onClick,
  shortcut,
  description,
}: ToolButtonProps) {
  const title = `${label}${shortcut ? ` (${shortcut})` : ""}${
    description ? ` — ${description}` : ""
  }`;
  return (
    <button
      type="button"
      className={`tool-button${active ? " is-active" : ""}`}
      aria-pressed={active}
      aria-label={label}
      title={title}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon name={icon} />
      <span>{label}</span>
    </button>
  );
}

interface ToolbarProps {
  documentTitle: string;
  dirty: boolean;
  tool: EditorTool;
  canUndo: boolean;
  canRedo: boolean;
  canDelete: boolean;
  canRotate: boolean;
  canMirror: boolean;
  placementLabel: string | null;
  onNew: () => void;
  onOpen: () => void;
  onSave: () => void;
  onTool: (tool: EditorTool) => void;
  onUndo: () => void;
  onRedo: () => void;
  onDelete: () => void;
  onRotate: () => void;
  onMirror: () => void;
  onExport: () => void;
}

function Separator() {
  return <span className="toolbar-separator" aria-hidden="true" />;
}

export function Toolbar({
  documentTitle,
  dirty,
  tool,
  canUndo,
  canRedo,
  canDelete,
  canRotate,
  canMirror,
  placementLabel,
  onNew,
  onOpen,
  onSave,
  onTool,
  onUndo,
  onRedo,
  onDelete,
  onRotate,
  onMirror,
  onExport,
}: ToolbarProps): ReactNode {
  return (
    <header className="app-toolbar">
      <div className="brand-block" aria-label="Drawic">
        <span className="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 32 32">
            <path d="M5 8h8l5 5v13H5z" />
            <path d="M18 6h9v9l-9 9-9-9z" />
            <circle cx="13" cy="13" r="2" />
          </svg>
        </span>
        <span className="brand-name">Drawic</span>
        <span className="preview-tag">PREVIEW</span>
      </div>

      <div className="document-name" title={documentTitle}>
        <span>{documentTitle}</span>
        <span className={`dirty-indicator${dirty ? " is-dirty" : ""}`}>
          {dirty ? "Unsaved changes" : "Saved"}
        </span>
      </div>

      <nav className="toolbar-groups" aria-label="Editor toolbar">
        <div className="tool-group file-tools">
          <ToolButton label="New" icon="new" onClick={onNew} shortcut="Ctrl+N" />
          <ToolButton label="Open" icon="open" onClick={onOpen} shortcut="Ctrl+O" />
          <ToolButton label="Save" icon="save" onClick={onSave} shortcut="Ctrl+S" />
        </div>
        <Separator />
        <div className="tool-group">
          <ToolButton
            label="Select"
            icon="select"
            active={tool === "select"}
            onClick={() => onTool("select")}
            shortcut="V"
          />
          <ToolButton
            label="Wire"
            icon="wire"
            active={tool === "wire"}
            onClick={() => onTool("wire")}
            shortcut="W"
          />
          <ToolButton
            label="Junction"
            icon="junction"
            active={tool === "junction"}
            onClick={() => onTool("junction")}
            description="Join crossing or touching wires at this point"
          />
          <ToolButton
            label="Net Label"
            icon="net"
            active={tool === "net-label"}
            onClick={() => onTool("net-label")}
            description="Attach a visible name to a wire"
          />
          <ToolButton
            label="Text"
            icon="text"
            active={tool === "text"}
            onClick={() => onTool("text")}
          />
          <ToolButton
            label="Rectangle"
            icon="rectangle"
            active={tool === "rectangle"}
            onClick={() => onTool("rectangle")}
          />
          <ToolButton
            label="Ellipse"
            icon="ellipse"
            active={tool === "ellipse"}
            onClick={() => onTool("ellipse")}
          />
        </div>
        <Separator />
        <div className="tool-group compact-tools">
          <ToolButton label="Undo" icon="undo" onClick={onUndo} disabled={!canUndo} />
          <ToolButton label="Redo" icon="redo" onClick={onRedo} disabled={!canRedo} />
          <ToolButton
            label="Rotate"
            icon="rotate"
            onClick={onRotate}
            disabled={!canRotate}
          />
          <ToolButton
            label="Mirror"
            icon="mirror"
            onClick={onMirror}
            disabled={!canMirror}
          />
          <ToolButton
            label="Delete"
            icon="delete"
            onClick={onDelete}
            disabled={!canDelete}
          />
        </div>
        <Separator />
        <ToolButton label="Export" icon="export" onClick={onExport} />
      </nav>

      {placementLabel ? (
        <div className="placement-banner" role="status">
          Placing <strong>{placementLabel}</strong>
          <span>Click canvas to place · Esc to finish</span>
        </div>
      ) : null}
    </header>
  );
}
