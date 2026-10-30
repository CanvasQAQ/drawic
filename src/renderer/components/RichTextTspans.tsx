import React, { type ReactNode } from "react";
import { richTextRunMetrics } from "../../core/richText";
import type { RichTextRun } from "../../core/model";

/**
 * Nested SVG tspans for one line of rich text. The parent text/tspan supplies
 * the baseline; script runs shift and then reset dy so following runs stay on
 * the line baseline.
 */
export function RichTextTspans({
  runs,
  baseFontSize,
  boldWeight = 700,
}: {
  runs: readonly RichTextRun[];
  baseFontSize: number;
  /** Weight used for bold runs; shape labels keep their lighter 600. */
  boldWeight?: number;
}): ReactNode {
  let baselineOffset = 0;
  return (
    <>
      {runs.map((run, index) => {
        const metrics = richTextRunMetrics(run, baseFontSize);
        const dy = metrics.dy - baselineOffset;
        baselineOffset = metrics.dy;
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
            fontWeight={run.bold ? boldWeight : 400}
            fontStyle={run.italic ? "italic" : "normal"}
            fontSize={metrics.fontSize}
            dx={metrics.dx || undefined}
            dy={dy || undefined}
            fill={run.color}
          >
            {run.text}
          </tspan>
        );
      })}
    </>
  );
}
