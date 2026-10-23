import { useEffect, useState, type ReactNode } from "react";
import type {
  Annotation,
  ComponentNode,
  DrawicDocument,
  SchematicCell,
  SelectionRef,
} from "../../core/model";
import { Icon } from "./Icons";

function CommitField({
  label,
  value,
  onCommit,
  multiline = false,
}: {
  label: string;
  value: string;
  onCommit: (value: string) => void;
  multiline?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = (): void => {
    if (draft !== value) {
      onCommit(draft);
    }
  };
  return (
    <label className="property-field">
      <span>{label}</span>
      {multiline ? (
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          rows={3}
        />
      ) : (
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.currentTarget.blur();
            }
          }}
        />
      )}
    </label>
  );
}

interface PropertiesPanelProps {
  document: DrawicDocument;
  cell: SchematicCell;
  selection: readonly SelectionRef[];
  onUpdateNode: (
    nodeId: string,
    patch: Partial<Pick<ComponentNode, "reference" | "value">>,
  ) => void;
  onUpdateAnnotation: (
    annotationId: string,
    patch: Partial<Pick<Annotation, "text" | "kind" | "size">>,
  ) => void;
  onRotate: () => void;
  onMirror: () => void;
  onDelete: () => void;
  onCollapse: () => void;
  onRenameCell: () => void;
  onSetTop: () => void;
}

function PropertiesSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="properties-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

export function PropertiesPanel({
  document,
  cell,
  selection,
  onUpdateNode,
  onUpdateAnnotation,
  onRotate,
  onMirror,
  onDelete,
  onCollapse,
  onRenameCell,
  onSetTop,
}: PropertiesPanelProps) {
  const selectedNode =
    selection.length === 1 && selection[0]?.kind === "node"
      ? cell.nodes.find((node) => node.id === selection[0]?.id)
      : undefined;
  const selectedWire =
    selection.length === 1 && selection[0]?.kind === "wire"
      ? cell.wires.find((wire) => wire.id === selection[0]?.id)
      : undefined;
  const selectedAnnotation =
    selection.length === 1 && selection[0]?.kind === "annotation"
      ? cell.annotations.find((annotation) => annotation.id === selection[0]?.id)
      : undefined;
  const top = document.cells.find((candidate) => candidate.isTop);

  return (
    <aside className="properties-panel" aria-label="Properties">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Inspector</span>
          <h2>Properties</h2>
        </div>
        <button
          className="icon-button"
          type="button"
          title="Hide properties"
          aria-label="Hide properties"
          onClick={onCollapse}
        >
          <Icon name="close" />
        </button>
      </div>

      {selectedNode ? (
        <PropertiesSection title="Component">
          <div className="selection-kind">
            <span className="kind-swatch kind-node" />
            Selected component
          </div>
          <CommitField
            label="Reference"
            value={selectedNode.reference}
            onCommit={(reference) => onUpdateNode(selectedNode.id, { reference })}
          />
          <CommitField
            label="Value / model"
            value={selectedNode.value}
            onCommit={(value) => onUpdateNode(selectedNode.id, { value })}
          />
          <dl className="property-grid">
            <div>
              <dt>Symbol</dt>
              <dd>{selectedNode.symbolId}</dd>
            </div>
            <div>
              <dt>Position</dt>
              <dd>
                {selectedNode.x}, {selectedNode.y}
              </dd>
            </div>
            <div>
              <dt>Rotation</dt>
              <dd>{selectedNode.rotation}°</dd>
            </div>
            <div>
              <dt>Mirror</dt>
              <dd>{selectedNode.mirrored ? "Yes" : "No"}</dd>
            </div>
          </dl>
          <div className="button-row">
            <button type="button" onClick={onRotate}>
              <Icon name="rotate" /> Rotate
            </button>
            <button type="button" onClick={onMirror}>
              <Icon name="mirror" /> Mirror
            </button>
          </div>
        </PropertiesSection>
      ) : null}

      {selectedWire ? (
        <PropertiesSection title="Wire">
          <div className="selection-kind">
            <span className="kind-swatch kind-wire" />
            Orthogonal wire
          </div>
          <dl className="property-grid">
            <div>
              <dt>Vertices</dt>
              <dd>{selectedWire.points.length}</dd>
            </div>
            <div>
              <dt>Start</dt>
              <dd>
                {selectedWire.points[0]?.x}, {selectedWire.points[0]?.y}
              </dd>
            </div>
            <div>
              <dt>End</dt>
              <dd>
                {selectedWire.points.at(-1)?.x}, {selectedWire.points.at(-1)?.y}
              </dd>
            </div>
          </dl>
          <p className="property-hint">
            Crossing wires stay separate unless a junction is placed. A wire endpoint touching
            another wire joins automatically.
          </p>
        </PropertiesSection>
      ) : null}

      {selectedAnnotation ? (
        <PropertiesSection title={selectedAnnotation.kind === "net" ? "Network label" : "Text"}>
          <div className="selection-kind">
            <span className="kind-swatch kind-text" />
            {selectedAnnotation.kind === "net" ? "Electrical net name" : "Free text"}
          </div>
          <CommitField
            label={selectedAnnotation.kind === "net" ? "Net" : "Text"}
            value={selectedAnnotation.text}
            multiline={selectedAnnotation.kind === "text"}
            onCommit={(text) => onUpdateAnnotation(selectedAnnotation.id, { text })}
          />
          <CommitField
            label="Font size"
            value={String(selectedAnnotation.size)}
            onCommit={(value) => {
              const size = Number(value);
              if (Number.isFinite(size)) {
                onUpdateAnnotation(selectedAnnotation.id, {
                  size: Math.max(8, Math.min(64, size)),
                });
              }
            }}
          />
          <div className="button-row">
            <button
              type="button"
              onClick={() =>
                onUpdateAnnotation(selectedAnnotation.id, {
                  kind: selectedAnnotation.kind === "net" ? "text" : "net",
                })
              }
            >
              Change to {selectedAnnotation.kind === "net" ? "text" : "net"}
            </button>
          </div>
        </PropertiesSection>
      ) : null}

      {selection.length > 1 ? (
        <PropertiesSection title="Multiple selection">
          <div className="selection-kind">
            <span className="kind-swatch kind-multi" />
            {selection.length} objects selected
          </div>
          <div className="button-row">
            <button type="button" onClick={onRotate}>
              <Icon name="rotate" /> Rotate
            </button>
            <button type="button" onClick={onMirror}>
              <Icon name="mirror" /> Mirror
            </button>
          </div>
        </PropertiesSection>
      ) : null}

      {selection.length > 0 ? (
        <button type="button" className="danger-button" onClick={onDelete}>
          <Icon name="delete" /> Delete selection
        </button>
      ) : null}

      {selection.length === 0 ? (
        <>
          <PropertiesSection title="Active cell">
            <div className="cell-summary">
              <strong>{cell.name}</strong>
              {cell.isTop ? <span className="top-marker">TOP</span> : null}
            </div>
            <dl className="property-grid">
              <div>
                <dt>Components</dt>
                <dd>{cell.nodes.length}</dd>
              </div>
              <div>
                <dt>Wires</dt>
                <dd>{cell.wires.length}</dd>
              </div>
              <div>
                <dt>Labels</dt>
                <dd>{cell.annotations.length}</dd>
              </div>
              <div>
                <dt>Hierarchy</dt>
                <dd>{cell.isTop ? "Root cell" : `Under ${top?.name ?? "Top"}`}</dd>
              </div>
            </dl>
            <div className="button-row">
              <button type="button" onClick={onRenameCell}>
                Rename cell
              </button>
              <button type="button" onClick={onSetTop} disabled={cell.isTop}>
                Set as Top
              </button>
            </div>
          </PropertiesSection>
          <PropertiesSection title="Selection">
            <p className="property-hint">
              Select a component, wire, or label to edit its details. Drag empty paper to
              marquee-select; hold Shift to add or remove items.
            </p>
          </PropertiesSection>
        </>
      ) : null}

      <PropertiesSection title="Roadmap">
        <ul className="roadmap-list">
          <li>
            <span>Hierarchical blocks &amp; ports</span>
            <em>Not implemented</em>
          </li>
          <li>
            <span>User component libraries</span>
            <em>Not implemented</em>
          </li>
          <li>
            <span>Spectre / SCS netlists</span>
            <em>Not implemented</em>
          </li>
        </ul>
      </PropertiesSection>
    </aside>
  );
}
