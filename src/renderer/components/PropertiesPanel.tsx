import React, { useEffect, useState, type ReactNode } from "react";
import { nodeLabelVisible } from "../../core/geometry";
import {
  clampNoteTextOffset,
  noteContentHeight,
} from "../../core/noteText";
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
  DEFAULT_ANNOTATION_TEXT_COLOR,
  DEFAULT_SHAPE_TEXT_ALIGN,
  DEFAULT_SHAPE_TEXT_COLOR,
  DEFAULT_SHAPE_TEXT_SIZE,
  defaultNetName,
  findJunction,
  findWire,
  junctionIdFromSelectionId,
} from "../../core/model";
import { Icon } from "./Icons";
import { RichLabelEditor } from "./RichLabelEditor";

const COLOR_PRESETS = [
  "#263d48",
  "#0f766e",
  "#1d4ed8",
  "#b42318",
  "#7e22ce",
  "#15803d",
  "#b45309",
  "#475569",
];

function hexColorOr(value: string | undefined, fallback: string): string {
  return value && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
}

function shortHex(value: string | undefined, fallback: string): string {
  return hexColorOr(value, fallback);
}

function ColorField({
  label,
  value,
  onChange,
  allowTransparent = false,
  onReset,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  allowTransparent?: boolean;
  onReset?: () => void;
}): ReactNode {
  return (
    <div className="net-color-field">
      <div>
        <span>{label}</span>
        <output>{value}</output>
      </div>
      <div className="net-color-controls">
        <input
          type="color"
          aria-label={label}
          value={hexColorOr(value, "#263d48")}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
        {COLOR_PRESETS.map((color) => (
          <button
            key={color}
            type="button"
            className={`net-color-swatch${value === color ? " is-active" : ""}`}
            style={{ backgroundColor: color }}
            aria-label={`Set ${label} ${color}`}
            title={color}
            onClick={() => onChange(color)}
          />
        ))}
        {allowTransparent ? (
          <button
            type="button"
            className="net-color-reset"
            aria-pressed={value === "transparent"}
            onClick={() => onChange("transparent")}
          >
            None
          </button>
        ) : null}
        {onReset ? (
          <button type="button" className="net-color-reset" onClick={onReset}>
            Default
          </button>
        ) : null}
      </div>
    </div>
  );
}

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
    patch: Partial<
      Pick<
        Annotation,
        | "text"
        | "kind"
        | "size"
        | "color"
        | "align"
        | "bold"
        | "italic"
        | "rotation"
      >
    >,
  ) => void;
  onUpdateShape: (
    shapeId: string,
    patch: Partial<
      Pick<
        DrawingShape,
        | "x"
        | "y"
        | "width"
        | "height"
        | "text"
        | "stroke"
        | "fill"
        | "strokeWidth"
        | "dash"
        | "opacity"
        | "fillOpacity"
        | "textSize"
        | "textColor"
        | "textAlign"
        | "textBold"
        | "textOffset"
      >
    >,
  ) => void;
  onReorderShape: (direction: "forward" | "backward") => void;
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
  onReorderShape,
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
  const isNoteShape = selectedShape?.kind === "note";
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
                  : "Legacy label attached by canvas position."}{" "}
              Color follows the net color; set it on any wire of the net.
            </p>
          ) : (
            <p className="property-hint">
              Double-click the text on the canvas to edit. Line breaks are
              preserved in the canvas and exports.
            </p>
          )}
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
          {selectedAnnotation.kind === "text" ? (
            <>
              <ColorField
                label="Text color"
                value={
                  hexColorOr(selectedAnnotation.color, DEFAULT_ANNOTATION_TEXT_COLOR)
                }
                onChange={(color) =>
                  onUpdateAnnotation(selectedAnnotation.id, { color })
                }
                onReset={() =>
                  onUpdateAnnotation(selectedAnnotation.id, {
                    color: DEFAULT_ANNOTATION_TEXT_COLOR,
                  })
                }
              />
              <label className="property-field">
                <span>Alignment</span>
                <select
                  value={selectedAnnotation.align ?? "start"}
                  onChange={(event) =>
                    onUpdateAnnotation(selectedAnnotation.id, {
                      align: event.currentTarget.value as "start" | "middle" | "end",
                    })
                  }
                >
                  <option value="start">Left</option>
                  <option value="middle">Center</option>
                  <option value="end">Right</option>
                </select>
              </label>
              <div className="button-row">
                <button
                  type="button"
                  aria-pressed={selectedAnnotation.bold === true}
                  onClick={() =>
                    onUpdateAnnotation(selectedAnnotation.id, {
                      bold: selectedAnnotation.bold !== true,
                    })
                  }
                >
                  Bold
                </button>
                <button
                  type="button"
                  aria-pressed={selectedAnnotation.italic === true}
                  onClick={() =>
                    onUpdateAnnotation(selectedAnnotation.id, {
                      italic: selectedAnnotation.italic !== true,
                    })
                  }
                >
                  Italic
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateAnnotation(selectedAnnotation.id, {
                      rotation: (((selectedAnnotation.rotation ?? 0) + 90) %
                        360) as 0 | 90 | 180 | 270,
                    })
                  }
                >
                  <Icon name="rotate" /> Rotate 90°
                </button>
              </div>
            </>
          ) : null}
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
        <PropertiesSection title={isNoteShape ? "Note" : "Drawing shape"}>
          <div className="selection-kind">
            <span className="kind-swatch kind-shape" />
            {isNoteShape
              ? "Quick block note"
              : selectedShape.kind === "ellipse"
                ? "Ellipse"
                : "Rectangle"}
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
          <ColorField
            label="Stroke"
            value={shortHex(selectedShape.stroke, "#263d48")}
            onChange={(stroke) => onUpdateShape(selectedShape.id, { stroke })}
          />
          <ColorField
            label="Fill"
            value={selectedShape.fill}
            allowTransparent
            onChange={(fill) => onUpdateShape(selectedShape.id, { fill })}
          />
          <CommitField
            label="Line width"
            value={String(selectedShape.strokeWidth ?? 2)}
            onCommit={(value) => {
              const width = Number(value);
              if (Number.isFinite(width)) {
                onUpdateShape(selectedShape.id, {
                  strokeWidth: Math.max(0.5, Math.min(24, width)),
                });
              }
            }}
          />
          <label className="property-field">
            <span>Line style</span>
            <select
              value={selectedShape.dash ?? "solid"}
              onChange={(event) =>
                onUpdateShape(selectedShape.id, {
                  dash: event.currentTarget.value as "solid" | "dashed" | "dotted",
                })
              }
            >
              <option value="solid">Solid</option>
              <option value="dashed">Dashed</option>
              <option value="dotted">Dotted</option>
            </select>
          </label>
          <CommitField
            label="Opacity %"
            value={String(Math.round((selectedShape.opacity ?? 1) * 100))}
            onCommit={(value) => {
              const percent = Number(value);
              if (Number.isFinite(percent)) {
                onUpdateShape(selectedShape.id, {
                  opacity: Math.max(0, Math.min(100, percent)) / 100,
                });
              }
            }}
          />
          <CommitField
            label="Fill opacity %"
            value={String(Math.round((selectedShape.fillOpacity ?? 1) * 100))}
            onCommit={(value) => {
              const percent = Number(value);
              if (Number.isFinite(percent)) {
                onUpdateShape(selectedShape.id, {
                  fillOpacity: Math.max(0, Math.min(100, percent)) / 100,
                });
              }
            }}
          />
          <CommitField
            label={isNoteShape ? "Note text" : "Label"}
            value={selectedShape.text ?? ""}
            multiline
            onCommit={(text) => {
              if (!isNoteShape) {
                onUpdateShape(selectedShape.id, { text });
                return;
              }
              const textSize = selectedShape.textSize ?? DEFAULT_SHAPE_TEXT_SIZE;
              onUpdateShape(selectedShape.id, {
                text,
                height: Math.max(
                  selectedShape.height,
                  noteContentHeight(text, selectedShape.width, textSize),
                ),
              });
            }}
          />
          <CommitField
            label="Label size"
            value={String(selectedShape.textSize ?? DEFAULT_SHAPE_TEXT_SIZE)}
            onCommit={(value) => {
              const size = Number(value);
              if (Number.isFinite(size)) {
                const textSize = Math.max(4, Math.min(200, size));
                onUpdateShape(selectedShape.id, {
                  textSize,
                  ...(isNoteShape
                    ? {
                        height: Math.max(
                          selectedShape.height,
                          noteContentHeight(
                            selectedShape.text ?? "",
                            selectedShape.width,
                            textSize,
                          ),
                        ),
                      }
                    : {}),
                });
              }
            }}
          />
          <ColorField
            label="Label color"
            value={shortHex(
              selectedShape.textColor,
              DEFAULT_SHAPE_TEXT_COLOR,
            )}
            onChange={(textColor) =>
              onUpdateShape(selectedShape.id, { textColor })
            }
          />
          <label className="property-field">
            <span>Label alignment</span>
            <select
              value={selectedShape.textAlign ?? DEFAULT_SHAPE_TEXT_ALIGN}
              onChange={(event) =>
                onUpdateShape(selectedShape.id, {
                  textAlign: event.currentTarget.value as "start" | "middle" | "end",
                })
              }
            >
              <option value="start">Left</option>
              <option value="middle">Center</option>
              <option value="end">Right</option>
            </select>
          </label>
          <div className="button-row">
            <button
              type="button"
              aria-pressed={selectedShape.textBold !== false}
              onClick={() =>
                onUpdateShape(selectedShape.id, {
                  textBold: selectedShape.textBold === false,
                })
              }
            >
              Bold label
            </button>
          </div>
          {isNoteShape ? (
            <>
              <CommitField
                label="Text offset X"
                value={String(Math.round(selectedShape.textOffset?.x ?? 0))}
                onCommit={(value) => {
                  const x = Number(value);
                  if (!Number.isFinite(x)) {
                    return;
                  }
                  const offset = clampNoteTextOffset(
                    {
                      x,
                      y: selectedShape.textOffset?.y ?? 0,
                    },
                    selectedShape.text ?? "",
                    selectedShape.width,
                    selectedShape.height,
                    selectedShape.textSize ?? DEFAULT_SHAPE_TEXT_SIZE,
                  );
                  onUpdateShape(selectedShape.id, {
                    textOffset: { x: Math.round(offset.x), y: Math.round(offset.y) },
                  });
                }}
              />
              <CommitField
                label="Text offset Y"
                value={String(Math.round(selectedShape.textOffset?.y ?? 0))}
                onCommit={(value) => {
                  const y = Number(value);
                  if (!Number.isFinite(y)) {
                    return;
                  }
                  const offset = clampNoteTextOffset(
                    {
                      x: selectedShape.textOffset?.x ?? 0,
                      y,
                    },
                    selectedShape.text ?? "",
                    selectedShape.width,
                    selectedShape.height,
                    selectedShape.textSize ?? DEFAULT_SHAPE_TEXT_SIZE,
                  );
                  onUpdateShape(selectedShape.id, {
                    textOffset: { x: Math.round(offset.x), y: Math.round(offset.y) },
                  });
                }}
              />
              <div className="button-row">
                <button
                  type="button"
                  onClick={() =>
                    onUpdateShape(selectedShape.id, {
                      textOffset: { x: 0, y: 0 },
                    })
                  }
                >
                  Reset text position
                </button>
              </div>
            </>
          ) : null}
          <p className="property-hint">
            {isNoteShape
              ? "The first line becomes the note heading. Drag the border or top edge to move the note, drag the text to place it inside the frame, and double-click the text to edit. Body clicks pass through to components below."
              : "Drag the corner or edge handles to resize. Hold Shift to keep the aspect ratio and Alt to resize from the center."}
          </p>
          <div className="button-row">
            <button type="button" onClick={onRotate}>
              <Icon name="rotate" /> Rotate
            </button>
            <button
              type="button"
              disabled={
                page.shapes.findIndex((shape) => shape.id === selectedShape.id) >=
                page.shapes.length - 1
              }
              onClick={() => onReorderShape("forward")}
            >
              Bring forward
            </button>
            <button
              type="button"
              disabled={
                page.shapes.findIndex((shape) => shape.id === selectedShape.id) <= 0
              }
              onClick={() => onReorderShape("backward")}
            >
              Send backward
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
