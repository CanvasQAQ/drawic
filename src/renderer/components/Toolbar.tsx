import React, { type ReactNode } from "react";
import { Icon, type IconName } from "./Icons";

export type EditorTool =
  | "select"
  | "duplicate"
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
  tool: EditorTool;
  canUndo: boolean;
  canRedo: boolean;
  onNew: () => void;
  onOpen: () => void;
  onSave: () => void;
  onTool: (tool: EditorTool) => void;
  onUndo: () => void;
  onRedo: () => void;
  onExport: () => void;
}

function Separator() {
  return <span className="toolbar-separator" aria-hidden="true" />;
}

export function Toolbar({
  tool,
  canUndo,
  canRedo,
  onNew,
  onOpen,
  onSave,
  onTool,
  onUndo,
  onRedo,
  onExport,
}: ToolbarProps): ReactNode {
  return (
    <header className="app-toolbar">
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
            label="Duplicate"
            icon="duplicate"
            active={tool === "duplicate"}
            onClick={() => onTool("duplicate")}
            shortcut="C"
            description="Click a device to copy it"
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
        </div>
        <Separator />
        <ToolButton label="Export" icon="export" onClick={onExport} />
      </nav>

    </header>
  );
}
