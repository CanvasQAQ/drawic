import React, { type SVGProps } from "react";
import {
  SUBSCRIPT_BASELINE_DROP,
  SUBSCRIPT_HORIZONTAL_GAP,
  SUBSCRIPT_SCALE,
  effectiveNameFontSize,
  effectiveValueFontSize,
  fontStack,
  parseReferenceAppearance,
} from "../../core/labels";
import {
  richTextRunMetrics,
  richTextRunsForReference,
} from "../../core/richText";
import type {
  DocumentTypography,
  LabelTextAnchor,
  NodeLabelKind,
  NodeLabelLayout,
  Point,
} from "../../core/model";

interface ComponentTextLabelProps
  extends Omit<SVGProps<SVGTextElement>, "textAnchor" | "x" | "y"> {
  kind: NodeLabelKind;
  text: string;
  point: Point;
  anchor: LabelTextAnchor;
  layout?: NodeLabelLayout | undefined;
  typography?: DocumentTypography | undefined;
}

export function ComponentTextLabel({
  kind,
  text,
  point,
  anchor,
  layout,
  typography,
  ...props
}: ComponentTextLabelProps) {
  const fontSize =
    kind === "reference"
      ? effectiveNameFontSize(layout, typography)
      : effectiveValueFontSize(layout, typography);
  const customTextStyle =
    kind === "reference" &&
    (layout?.fontStyle !== undefined ||
      layout?.fontWeight !== undefined ||
      layout?.script !== undefined);
  const segments = customTextStyle
    ? [{ text, role: "plain" as const }]
    : kind === "reference"
      ? parseReferenceAppearance(text)
      : [{ text, role: "plain" as const }];
  const customScriptShift =
    layout?.script === "superscript"
      ? -SUBSCRIPT_BASELINE_DROP * fontSize
      : layout?.script === "subscript"
        ? SUBSCRIPT_BASELINE_DROP * fontSize
        : 0;
  const richRuns =
    kind === "reference" && layout?.richText
      ? richTextRunsForReference(text, layout.richText)
      : null;
  let richBaselineOffset = 0;

  return (
    <text
      {...props}
      className={`${kind === "reference" ? "component-reference" : "component-value"}${props.className ? ` ${props.className}` : ""}`}
      x={point.x}
      y={point.y}
      textAnchor={anchor}
      fontFamily={fontStack(typography)}
      fontSize={fontSize}
      fontWeight={layout?.fontWeight ?? (customTextStyle ? 700 : undefined)}
      fontStyle={layout?.fontStyle ?? (customTextStyle ? "italic" : undefined)}
      style={{ fontSynthesis: "style weight", ...props.style }}
      fill={
        layout?.color ??
        (kind === "reference" ? "#19333e" : "#586970")
      }
      data-label-kind={kind}
      data-label-placement={layout?.placement ?? "legacy"}
    >
      {richRuns
        ? richRuns.map((run, index) => {
            const metrics = richTextRunMetrics(run, fontSize);
            const dy = metrics.dy - richBaselineOffset;
            richBaselineOffset = metrics.dy;
            return (
              <tspan
                key={`run-${index}`}
                data-rich-role={
                  run.script === "normal"
                    ? index === 0
                      ? "base"
                      : "plain"
                    : run.script
                }
                fontWeight={run.bold ? 700 : 400}
                fontStyle={run.italic ? "italic" : "normal"}
                fontSize={metrics.fontSize}
                dx={metrics.dx || undefined}
                dy={dy || undefined}
                fill={run.color}
              >
                {run.text}
              </tspan>
            );
          })
        : segments.map((segment, index) => {
        const isSubscript = segment.role === "subscript";
        return (
          <tspan
            key={`${segment.role}-${index}`}
            data-rich-role={segment.role}
            fontWeight={layout?.fontWeight ?? (isSubscript || segment.role === "base" ? 700 : 400)}
            fontStyle={layout?.fontStyle ?? (isSubscript ? "normal" : segment.role === "base" ? "italic" : "normal")}
            fontSize={isSubscript ? fontSize * SUBSCRIPT_SCALE : fontSize}
            dx={isSubscript ? fontSize * SUBSCRIPT_HORIZONTAL_GAP : undefined}
            dy={
              isSubscript
                ? fontSize * SUBSCRIPT_BASELINE_DROP
                : customTextStyle && customScriptShift !== 0
                  ? customScriptShift
                  : undefined
            }
          >
            {segment.text}
          </tspan>
        );
          })}
    </text>
  );
}
