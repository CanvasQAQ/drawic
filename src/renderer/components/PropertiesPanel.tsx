import React, { useEffect, useState, type ReactNode } from "react";
import { nodeLabelVisible } from "../../core/geometry";
import type {
  Annotation,
  ComponentNode,
  DocumentTypography,
  DrawingPage,
  DrawingShape,
  NodeLabelKind,
  NodeLabelLayout,
  RichTextRun,
  SelectionRef,
} from "../../core/model";
import {
  allJunctions,
  allWires,
  defaultNetName,
  findJunction,
  findWire,
  junctionIdFromSelectionId,
} from "../../core/model";
import { Icon } from "./Icons";
import { RichLabelEditor } from "./RichLabelEditor";

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
  page: DrawingPage;
  typography?: DocumentTypography | undefined;
  selection: readonly SelectionRef[];
  netNameByWire: ReadonlyMap<string, string>;
  onUpdateNode: (
    nodeId: string,
    patch: Partial<Pick<ComponentNode, "reference" | "value">>,
  ) => void;
  onUpdateNodeLabel: (
    nodeId: string,
    label: NodeLabelKind,
    patch: Partial<NodeLabelLayout>,
  ) => void;
  onUpdateReferenceLabel: (
    nodeId: string,
    reference: string,
    runs: RichTextRun[],
  ) => void;
  onResetNodeLabelStyle: (nodeId: string, label: NodeLabelKind) => void;
  onUpdateTypography: (patch: Partial<DocumentTypography>) => void;
  onUpdateAnnotation: (
    annotationId: string,
    patch: Partial<Pick<Annotation, "text" | "kind" | "size">>,
  ) => void;
  onUpdateShape: (
    shapeId: string,
    patch: Partial<Pick<DrawingShape, "x" | "y" | "width" | "height" | "text">>,
  ) => void;
  onUpdateNetName: (wireId: string, name: string) => void;
  onUpdateNetColor: (wireId: string, color: string | null) => void;
  onRotate: () => void;
  onMirror: () => void;
  onMirrorVertical: () => void;
  onDelete: () => void;
  onCollapse: () => void;
  onRenamePage: () => void;
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
  page,
  typography,
  selection,
  netNameByWire,
  onUpdateNode,
  onUpdateNodeLabel,
  onUpdateReferenceLabel,
  onResetNodeLabelStyle,
  onUpdateTypography,
  onUpdateAnnotation,
  onUpdateShape,
  onUpdateNetName,
  onUpdateNetColor,
  onRotate,
  onMirror,
  onMirrorVertical,
  onDelete,
  onCollapse,
  onRenamePage,
}: PropertiesPanelProps) {
  const selectedNode =
    selection.length === 1 && selection[0]?.kind === "node"
      ? page.nodes.find((node) => node.id === selection[0]?.id)
      : undefined;
  const selectedWireLocation =
    selection.length === 1 && selection[0]?.kind === "wire"
      ? findWire(page, selection[0]?.id ?? "")
      : undefined;
  const selectedWire = selectedWireLocation?.wire;
  const selectedNetColor = selectedWireLocation?.net.color;
  const selectedWireNetName = selectedWire
    ? netNameByWire.get(selectedWire.id) ??
      defaultNetName(
        Math.max(0, page.nets.findIndex((net) =>
          net.wires.some((wire) => wire.id === selectedWire.id),
        )),
      )
    : "";
  const selectedNodeLabel =
    selection.length === 1 && selection[0]?.kind === "node-label"
      ? page.nodes.find((node) => node.id === selection[0]?.id)
      : undefined;
  const selectedNodeLabelLayout = selectedNodeLabel
    ? selectedNodeLabel.labelLayout?.[selection[0]?.label ?? "reference"]
    : undefined;
  const selectedAnnotation =
    selection.length === 1 && selection[0]?.kind === "annotation"
      ? page.annotations.find((annotation) => annotation.id === selection[0]?.id)
      : undefined;
  const selectedAnnotationWire =
    selectedAnnotation?.wireId
      ? findWire(page, selectedAnnotation.wireId)?.wire
      : undefined;
  const selectedShape: DrawingShape | undefined =
    selection.length === 1 && selection[0]?.kind === "shape"
      ? page.shapes.find((shape) => shape.id === selection[0]?.id)
      : undefined;
  const selectedJunction =
    selection.length === 1 && selection[0]?.kind === "junction"
      ? findJunction(
          page,
          junctionIdFromSelectionId(selection[0].id) ?? "",
        )?.junction
      : null;

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
            <button type="button" onClick={onMirrorVertical}>
              <Icon name="mirror" /> Flip V
            </button>
            <button
              type="button"
              onClick={() =>
                onUpdateNodeLabel(selectedNode.id, "reference", {
                  hidden: nodeLabelVisible(selectedNode, "reference"),
                })
              }
            >
              Reference: {nodeLabelVisible(selectedNode, "reference") ? "shown" : "hidden"}
            </button>
            <button
              type="button"
              onClick={() =>
                onUpdateNodeLabel(selectedNode.id, "value", {
                  hidden: nodeLabelVisible(selectedNode, "value"),
                })
              }
            >
              Value: {nodeLabelVisible(selectedNode, "value") ? "shown" : "hidden"}
            </button>
          </div>
        </PropertiesSection>
      ) : null}

      {selectedNodeLabel ? (
        <PropertiesSection title="Component label">
          <div className="selection-kind">
            <span className="kind-swatch kind-text" />
            {selection[0]?.label === "value" ? "Value label" : "Reference label"}
          </div>
          <p className="property-hint">
            Drag the label directly on the canvas, double-click it to rename it, or delete it to
            hide it without removing the component.
          </p>
          {selection[0]?.label !== "value" ? (
            <div className="property-field">
              <span>Name builder</span>
              <RichLabelEditor
                key={`${selectedNodeLabel.id}-${selectedNodeLabel.reference}`}
                nodeId={selectedNodeLabel.id}
                reference={selectedNodeLabel.reference}
                storedRuns={selectedNodeLabelLayout?.richText}
                typography={typography}
                onCommit={(reference, runs) =>
                  onUpdateReferenceLabel(
                    selectedNodeLabel.id,
                    reference,
                    runs,
                  )
                }
              />
            </div>
          ) : null}
          <CommitField
            label="Font size scale"
            value={String(selectedNodeLabelLayout?.fontSizeScale ?? 1)}
            onCommit={(value) => {
              const scale = Number(value);
              if (Number.isFinite(scale) && scale > 0) {
                onUpdateNodeLabel(
                  selectedNodeLabel.id,
                  selection[0]?.label ?? "reference",
                  { fontSizeScale: Math.max(0.25, Math.min(4, scale)) },
                );
              }
            }}
          />
          <div className="button-row">
            <button
              type="button"
              aria-pressed={(selectedNodeLabelLayout?.fontWeight ?? 400) === 700}
              onClick={() =>
                onUpdateNodeLabel(
                  selectedNodeLabel.id,
                  selection[0]?.label ?? "reference",
                  {
                    fontWeight:
                      (selectedNodeLabelLayout?.fontWeight ?? 400) === 700
                        ? 400
                        : 700,
                  },
                )
              }
            >
              Bold
            </button>
            <button
              type="button"
              aria-pressed={selectedNodeLabelLayout?.fontStyle === "italic"}
              onClick={() =>
                onUpdateNodeLabel(
                  selectedNodeLabel.id,
                  selection[0]?.label ?? "reference",
                  {
                    fontStyle:
                      selectedNodeLabelLayout?.fontStyle === "italic"
                        ? "normal"
                        : "italic",
                  },
                )
              }
            >
              Italic
            </button>
            <label className="inline-color-control">
              <span>Color</span>
              <input
                type="color"
                aria-label="Label color"
                value={selectedNodeLabelLayout?.color ?? "#19333e"}
                onChange={(event) =>
                  onUpdateNodeLabel(
                    selectedNodeLabel.id,
                    selection[0]?.label ?? "reference",
                    { color: event.currentTarget.value },
                  )
                }
              />
            </label>
          </div>
          <label className="property-field">
            <span>Script</span>
            <select
              value={selectedNodeLabelLayout?.script ?? "normal"}
              onChange={(event) =>
                onUpdateNodeLabel(
                  selectedNodeLabel.id,
                  selection[0]?.label ?? "reference",
                  {
                    script: event.currentTarget.value as NonNullable<
                      NodeLabelLayout["script"]
                    >,
                  },
                )
              }
            >
              <option value="normal">Normal</option>
              <option value="subscript">Subscript</option>
              <option value="superscript">Superscript</option>
            </select>
          </label>
          <button
            type="button"
            className="text-button"
            onClick={() =>
              onResetNodeLabelStyle(
                selectedNodeLabel.id,
                selection[0]?.label ?? "reference",
              )
            }
          >
            Reset appearance
          </button>
          <button
            type="button"
            className="text-button"
            onClick={() =>
              onUpdateNodeLabel(
                selectedNodeLabel.id,
                selection[0]?.label ?? "reference",
                { hidden: true },
              )
            }
          >
            Hide this label
          </button>
        </PropertiesSection>
      ) : null}

      {selectedWire ? (
        <PropertiesSection title="Wire">
          <div className="selection-kind">
            <span className="kind-swatch kind-wire" />
            {selectedWireNetName} · orthogonal wire
          </div>
          <CommitField
            label="Net name"
            value={selectedWireNetName}
            onCommit={(name) => onUpdateNetName(selectedWire.id, name)}
          />
          <div className="net-color-field">
            <div>
              <span>Net color</span>
              <output>{selectedNetColor ?? "Default"}</output>
            </div>
            <div className="net-color-controls">
              <input
                type="color"
                aria-label="Net color"
                value={selectedNetColor ?? "#14262f"}
                onChange={(event) =>
                  onUpdateNetColor(selectedWire.id, event.currentTarget.value)
                }
              />
              {[
                "#0f766e",
                "#1d4ed8",
                "#b42318",
                "#7e22ce",
                "#15803d",
                "#b45309",
                "#475569",
              ].map((color) => (
                <button
                  key={color}
                  type="button"
                  className={`net-color-swatch${selectedNetColor === color ? " is-active" : ""}`}
                  style={{ backgroundColor: color }}
                  aria-label={`Set net color ${color}`}
                  title={color}
                  onClick={() => onUpdateNetColor(selectedWire.id, color)}
                />
              ))}
              <button
                type="button"
                className="net-color-reset"
                disabled={!selectedNetColor}
                onClick={() => onUpdateNetColor(selectedWire.id, null)}
              >
                Default
              </button>
            </div>
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
            The default name is hidden on the canvas. Use the Net Label tool to
            show a name, or place a junction to join crossing wires.
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
          {selectedAnnotation.kind === "net" ? (
            <p className="property-hint">
              {selectedAnnotationWire
                  ? `Attached to ${
                    netNameByWire.get(selectedAnnotationWire.id) ??
                    defaultNetName(
                      Math.max(
                        0,
                        page.nets.findIndex((net) =>
                          net.wires.some(
                            (wire) => wire.id === selectedAnnotationWire.id,
                          ),
                        ),
                      ),
                    )
                  }.`
                : selectedAnnotation.wireId
                  ? "Attached wire is missing."
                  : "Legacy label attached by canvas position."}
            </p>
          ) : null}
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

      {selectedShape ? (
        <PropertiesSection title="Drawing shape">
          <div className="selection-kind">
            <span className="kind-swatch kind-shape" />
            {selectedShape.kind === "ellipse" ? "Ellipse" : "Rectangle"}
          </div>
          <dl className="property-grid">
            <div>
              <dt>Position</dt>
              <dd>
                {selectedShape.x}, {selectedShape.y}
              </dd>
            </div>
            <div>
              <dt>Size</dt>
              <dd>
                {selectedShape.width} × {selectedShape.height}
              </dd>
            </div>
            <div>
              <dt>Rotation</dt>
              <dd>{selectedShape.rotation}°</dd>
            </div>
          </dl>
          <CommitField
            label="Label"
            value={selectedShape.text ?? ""}
            onCommit={(text) => onUpdateShape(selectedShape.id, { text })}
          />
          <div className="button-row">
            <button type="button" onClick={onRotate}>
              <Icon name="rotate" /> Rotate
            </button>
          </div>
        </PropertiesSection>
      ) : null}

      {selectedJunction ? (
        <PropertiesSection title="Junction">
          <div className="selection-kind">
            <span className="kind-swatch kind-wire" />
            Explicit junction
          </div>
          <dl className="property-grid">
            <div>
              <dt>Position</dt>
              <dd>
                {selectedJunction.point.x}, {selectedJunction.point.y}
              </dd>
            </div>
          </dl>
          <p className="property-hint">
            A junction joins wires at this point. Press Delete to remove it.
          </p>
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
            <button type="button" onClick={onMirrorVertical}>
              <Icon name="mirror" /> Flip V
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
          <PropertiesSection title="Active page">
            <div className="page-summary">
              <strong>{page.name}</strong>
            </div>
            <dl className="property-grid">
              <div>
                <dt>Components</dt>
                <dd>{page.nodes.length}</dd>
              </div>
              <div>
                <dt>Wires</dt>
                <dd>{allWires(page).length}</dd>
              </div>
              <div>
                <dt>Labels</dt>
                <dd>{page.annotations.length}</dd>
              </div>
              <div>
                <dt>Shapes</dt>
                <dd>{page.shapes.length}</dd>
              </div>
            </dl>
            <div className="button-row">
              <button type="button" onClick={onRenamePage}>
                Rename page
              </button>
            </div>
            <CommitField
              label="Type scale"
              value={String(typography?.scale ?? 1)}
              onCommit={(value) => {
                const scale = Number(value);
                if (Number.isFinite(scale) && scale > 0) {
                  onUpdateTypography({
                    scale: Math.max(0.5, Math.min(3, scale)),
                  });
                }
              }}
            />
            <label className="property-field">
              <span>Diagram font</span>
              <select
                value={typography?.family ?? "sans"}
                onChange={(event) =>
                  onUpdateTypography({
                    family: event.currentTarget.value as DocumentTypography["family"],
                  })
                }
              >
                <option value="sans">Sans</option>
                <option value="serif">Serif</option>
              </select>
            </label>
          </PropertiesSection>
          <PropertiesSection title="Selection">
            <p className="property-hint">
              Select a component, wire, label, or drawing shape to edit its details. Drag
              empty paper to marquee-select; hold Shift to add or remove items.
            </p>
          </PropertiesSection>
        </>
      ) : null}

      <PropertiesSection title="Roadmap">
        <ul className="roadmap-list">
          <li>
            <span>User-editable device libraries</span>
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
