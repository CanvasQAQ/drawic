import React, { useEffect, useRef, useState, type ReactNode } from "react";
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
import {
  annotationTextRuns,
  runsToPlainText,
  shapeTextRuns,
} from "../../core/textRuns";
import { Icon } from "./Icons";
import { NumberStepperField, SliderField } from "./NumberControls";
import { RichTextEditor } from "./RichTextEditor";
import { RichLabelEditor } from "./RichLabelEditor";
import {
  COLOR_PRESETS,
  SHAPE_PALETTE,
  type ShapePalettePreset,
} from "../quickPalette";

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
  action,
}: {
  label: string;
  value: string;
  onCommit: (value: string) => void;
  multiline?: boolean;
  action?: ReactNode;
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
      <span className={action ? "property-label-row" : undefined}>
        {label}
        {action}
      </span>
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

function ShapePaletteRow({
  onSelect,
}: {
  onSelect: (preset: ShapePalettePreset) => void;
}): ReactNode {
  return (
    <div className="property-field palette-field">
      <span>Quick colors</span>
      <div
        className="palette-row"
        role="group"
        aria-label="Quick color combinations"
      >
        {SHAPE_PALETTE.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className="palette-swatch"
            aria-label={`${preset.label} colors`}
            title={preset.label}
            style={{
              backgroundColor: preset.fill,
              borderColor: preset.stroke,
            }}
            onClick={() => onSelect(preset)}
          />
        ))}
      </div>
    </div>
  );
}

function ColorPresetRow({
  label,
  onSelect,
}: {
  label: string;
  onSelect: (color: string) => void;
}): ReactNode {
  return (
    <div className="property-field palette-field">
      <span>{label}</span>
      <div className="palette-row" role="group" aria-label={label}>
        {COLOR_PRESETS.map((color) => (
          <button
            key={color}
            type="button"
            className="palette-swatch"
            aria-label={`Use ${color}`}
            title={color}
            style={{ backgroundColor: color }}
            onClick={() => onSelect(color)}
          />
        ))}
      </div>
    </div>
  );
}

function RichTextField({
  label,
  ariaLabel,
  initialRuns,
  multiline = false,
  initialFormat,
  clearFormatOnNewParagraph = false,
  onChange,
  onFinish,
  onPreviewStart,
  onPreviewEnd,
}: {
  label: string;
  ariaLabel: string;
  initialRuns: readonly RichTextRun[];
  multiline?: boolean;
  initialFormat?: "bold" | "italic" | "subscript" | "superscript" | undefined;
  clearFormatOnNewParagraph?: boolean;
  /** Applied to the document on every keystroke so the canvas tracks the edit. */
  onChange?: ((runs: RichTextRun[]) => void) | undefined;
  onFinish: (runs: RichTextRun[]) => void;
  onPreviewStart?: (() => void) | undefined;
  onPreviewEnd?: (() => void) | undefined;
}) {
  const previewing = useRef(false);
  const endPreview = (): void => {
    if (!previewing.current) {
      return;
    }
    previewing.current = false;
    onPreviewEnd?.();
  };
  return (
    <div className="property-field rich-property-field">
      <span>{label}</span>
      <RichTextEditor
        initialRuns={initialRuns}
        ariaLabel={ariaLabel}
        multiline={multiline}
        initialFormat={initialFormat}
        clearFormatOnNewParagraph={clearFormatOnNewParagraph}
        toolbarLabel={`${label} formatting`}
        onChange={(runs) => {
          if (!previewing.current) {
            previewing.current = true;
            onPreviewStart?.();
          }
          onChange?.(runs);
        }}
        onFinish={(runs) => {
          if (runs) {
            onFinish(runs);
          }
          endPreview();
        }}
      />
    </div>
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
        | "richText"
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
        | "richText"
      >
    >,
  ) => void;
  onUpdateNetName: (wireId: string, name: string) => void;
  onUpdateNetColor: (wireId: string, color: string | null) => void;
  inlineEditingAnnotationId?: string | null;
  inlineEditingShapeId?: string | null;
  onPreviewStart?: (() => void) | undefined;
  onPreviewEnd?: (() => void) | undefined;
  onRotate: () => void;
  onMirror: () => void;
  onMirrorVertical: () => void;
  onDelete: () => void;
  onCollapse: () => void;
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
  inlineEditingAnnotationId,
  inlineEditingShapeId,
  onPreviewStart,
  onPreviewEnd,
  onRotate,
  onMirror,
  onMirrorVertical,
  onDelete,
  onCollapse,
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
  const applyShapeText = (runs: RichTextRun[]): void => {
    if (!selectedShape) {
      return;
    }
    const text = runsToPlainText(runs);
    onUpdateShape(selectedShape.id, {
      text,
      richText: runs,
      ...(selectedShape.kind === "note"
        ? {
            height: Math.max(
              selectedShape.height,
              noteContentHeight(
                text,
                selectedShape.width,
                selectedShape.textSize ?? DEFAULT_SHAPE_TEXT_SIZE,
              ),
            ),
          }
        : {}),
    });
  };
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
            action={
              <button
                type="button"
                className="label-visibility-toggle"
                aria-label={`${
                  nodeLabelVisible(selectedNode, "reference") ? "Hide" : "Show"
                } reference label`}
                aria-pressed={nodeLabelVisible(selectedNode, "reference")}
                title={
                  nodeLabelVisible(selectedNode, "reference")
                    ? "Hide reference label"
                    : "Show reference label"
                }
                onClick={(event) => {
                  event.preventDefault();
                  onUpdateNodeLabel(selectedNode.id, "reference", {
                    hidden: nodeLabelVisible(selectedNode, "reference"),
                  });
                }}
              >
                <Icon
                  name={
                    nodeLabelVisible(selectedNode, "reference")
                      ? "eye"
                      : "eye-off"
                  }
                />
              </button>
            }
          />
          <CommitField
            label="Value / model"
            value={selectedNode.value}
            onCommit={(value) => onUpdateNode(selectedNode.id, { value })}
            action={
              <button
                type="button"
                className="label-visibility-toggle"
                aria-label={`${
                  nodeLabelVisible(selectedNode, "value") ? "Hide" : "Show"
                } value label`}
                aria-pressed={nodeLabelVisible(selectedNode, "value")}
                title={
                  nodeLabelVisible(selectedNode, "value")
                    ? "Hide value label"
                    : "Show value label"
                }
                onClick={(event) => {
                  event.preventDefault();
                  onUpdateNodeLabel(selectedNode.id, "value", {
                    hidden: nodeLabelVisible(selectedNode, "value"),
                  });
                }}
              >
                <Icon
                  name={
                    nodeLabelVisible(selectedNode, "value") ? "eye" : "eye-off"
                  }
                />
              </button>
            }
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
          </div>
        </PropertiesSection>
      ) : null}

      {selectedNodeLabel ? (
        <PropertiesSection title="Component label">
          <div className="selection-kind">
            <span className="kind-swatch kind-text" />
            {selection[0]?.label === "value" ? "Value label" : "Reference label"}
          </div>
          {selection[0]?.label !== "value" ? (
            <div className="property-field">
              <span>Name builder</span>
              <RichLabelEditor
                key={`name-${selectedNodeLabel.id}`}
                reference={selectedNodeLabel.reference}
                storedRuns={selectedNodeLabelLayout?.richText}
                typography={typography}
                onChange={(reference, runs) =>
                  onUpdateReferenceLabel(
                    selectedNodeLabel.id,
                    reference,
                    runs,
                  )
                }
                onCommit={(reference, runs) =>
                  onUpdateReferenceLabel(
                    selectedNodeLabel.id,
                    reference,
                    runs,
                  )
                }
                onPreviewStart={onPreviewStart}
                onPreviewEnd={onPreviewEnd}
              />
            </div>
          ) : null}
          <SliderField
            label="Font size scale"
            value={selectedNodeLabelLayout?.fontSizeScale ?? 1}
            min={0.25}
            max={4}
            step={0.05}
            formatValue={(value) => `${value.toFixed(2)}×`}
            onCommit={(scale) =>
              onUpdateNodeLabel(
                selectedNodeLabel.id,
                selection[0]?.label ?? "reference",
                { fontSizeScale: scale },
              )
            }
            onPreviewStart={onPreviewStart}
            onPreviewEnd={onPreviewEnd}
          />
          <div className="button-row">
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
        </PropertiesSection>
      ) : null}

      {selectedAnnotation ? (
        <PropertiesSection title={selectedAnnotation.kind === "net" ? "Network label" : "Text"}>
          <div className="selection-kind">
            <span className="kind-swatch kind-text" />
            {selectedAnnotation.kind === "net" ? "Electrical net name" : "Free text"}
          </div>
          {selectedAnnotation.kind === "net" ? (
            <CommitField
              label="Net"
              value={selectedAnnotation.text}
              onCommit={(text) =>
                onUpdateAnnotation(selectedAnnotation.id, { text })
              }
            />
          ) : inlineEditingAnnotationId === selectedAnnotation.id ? null : (
            <RichTextField
              key={`text-${selectedAnnotation.id}`}
              label="Text"
              ariaLabel="Editable text annotation"
              initialRuns={annotationTextRuns(selectedAnnotation)}
              multiline
              onChange={(runs) =>
                onUpdateAnnotation(selectedAnnotation.id, {
                  text: runsToPlainText(runs),
                  richText: runs,
                })
              }
              onFinish={(runs) =>
                onUpdateAnnotation(selectedAnnotation.id, {
                  text: runsToPlainText(runs),
                  richText: runs,
                })
              }
              onPreviewStart={onPreviewStart}
              onPreviewEnd={onPreviewEnd}
            />
          )}
          <NumberStepperField
            label="Font size"
            value={selectedAnnotation.size}
            min={8}
            max={64}
            step={1}
            onCommit={(size) =>
              onUpdateAnnotation(selectedAnnotation.id, { size })
            }
          />
          {selectedAnnotation.kind === "text" ? (
            <>
              <ColorPresetRow
                label="Quick colors"
                onSelect={(color) =>
                  onUpdateAnnotation(selectedAnnotation.id, { color })
                }
              />
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
          <ShapePaletteRow
            onSelect={(preset) =>
              onUpdateShape(selectedShape.id, {
                fill: preset.fill,
                stroke: preset.stroke,
                textColor: preset.text,
              })
            }
          />
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
          <SliderField
            label="Line width"
            value={selectedShape.strokeWidth ?? 2}
            min={0.5}
            max={24}
            step={0.5}
            formatValue={(value) => `${value} px`}
            onCommit={(strokeWidth) =>
              onUpdateShape(selectedShape.id, { strokeWidth })
            }
            onPreviewStart={onPreviewStart}
            onPreviewEnd={onPreviewEnd}
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
          <SliderField
            label="Opacity"
            value={Math.round((selectedShape.opacity ?? 1) * 100)}
            min={0}
            max={100}
            step={1}
            formatValue={(value) => `${value}%`}
            onCommit={(percent) =>
              onUpdateShape(selectedShape.id, { opacity: percent / 100 })
            }
            onPreviewStart={onPreviewStart}
            onPreviewEnd={onPreviewEnd}
          />
          <SliderField
            label="Fill opacity"
            value={Math.round((selectedShape.fillOpacity ?? 1) * 100)}
            min={0}
            max={100}
            step={1}
            formatValue={(value) => `${value}%`}
            onCommit={(percent) =>
              onUpdateShape(selectedShape.id, { fillOpacity: percent / 100 })
            }
            onPreviewStart={onPreviewStart}
            onPreviewEnd={onPreviewEnd}
          />
          {inlineEditingShapeId === selectedShape.id ? null : (
            <RichTextField
              key={`shape-${selectedShape.id}`}
              label={isNoteShape ? "Note text" : "Label"}
              ariaLabel={
                isNoteShape ? "Editable note text" : "Editable shape label"
              }
              initialRuns={shapeTextRuns(selectedShape)}
              multiline
              initialFormat={
                (selectedShape.text ?? "").trim() ||
                (!isNoteShape && selectedShape.textBold === false)
                  ? undefined
                  : "bold"
              }
              clearFormatOnNewParagraph={isNoteShape}
              onChange={applyShapeText}
              onFinish={applyShapeText}
              onPreviewStart={onPreviewStart}
              onPreviewEnd={onPreviewEnd}
            />
          )}
          <NumberStepperField
            label="Label size"
            value={selectedShape.textSize ?? DEFAULT_SHAPE_TEXT_SIZE}
            min={4}
            max={200}
            step={1}
            onCommit={(textSize) => {
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

          {isNoteShape ? (
            <>
              <NumberStepperField
                label="Text offset X"
                value={Math.round(selectedShape.textOffset?.x ?? 0)}
                step={1}
                onCommit={(x) => {
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
                    textOffset: {
                      x: Math.round(offset.x),
                      y: Math.round(offset.y),
                    },
                  });
                }}
              />
              <NumberStepperField
                label="Text offset Y"
                value={Math.round(selectedShape.textOffset?.y ?? 0)}
                step={1}
                onCommit={(y) => {
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
                    textOffset: {
                      x: Math.round(offset.x),
                      y: Math.round(offset.y),
                    },
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
            <SliderField
              label="Type scale"
              value={typography?.scale ?? 1}
              min={0.5}
              max={3}
              step={0.05}
              formatValue={(value) => `${value.toFixed(2)}×`}
              onCommit={(scale) => onUpdateTypography({ scale })}
              onPreviewStart={onPreviewStart}
              onPreviewEnd={onPreviewEnd}
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
        </>
      ) : null}
    </aside>
  );
}
