import {
  SUBSCRIPT_BASELINE_DROP,
  SUBSCRIPT_HORIZONTAL_GAP,
  SUBSCRIPT_SCALE,
  parseReferenceAppearance,
} from "./labels";
import type { RichTextRun } from "./model";

function standardReferenceRuns(reference: string): RichTextRun[] {
  return parseReferenceAppearance(reference).map((segment) => ({
    text: segment.text,
    bold: segment.role !== "plain",
    italic: segment.role === "base",
    script:
      segment.role === "subscript"
        ? "subscript"
        : "normal",
  }));
}

function referenceSeparator(
  base: string,
  suffix: string,
): string {
  if (!suffix) {
    return base;
  }
  if (
    (/^(?:XU|OA)$/.test(base) && /^\d+$/.test(suffix)) ||
    /^\d+$/.test(suffix) ||
    /^\p{Script=Greek}/u.test(base) ||
    base.endsWith("_") ||
    suffix.startsWith("_")
  ) {
    return `${base}${suffix}`;
  }
  return `${base}_${suffix}`;
}

export function referenceFromRichTextRuns(
  runs: readonly RichTextRun[],
): string {
  if (runs.length === 0) {
    return "";
  }
  const first = runs[0]!;
  const suffixRuns = runs.slice(1);
  if (
    first.script === "normal" &&
    suffixRuns.length > 0 &&
    suffixRuns.every((run) => run.script === "subscript")
  ) {
    return referenceSeparator(
      first.text,
      suffixRuns.map((run) => run.text).join(""),
    );
  }
  return runs.map((run) => run.text).join("");
}

export function richTextRunsForReference(
  reference: string,
  stored?: readonly RichTextRun[],
): RichTextRun[] {
  if (stored && stored.length > 0 && referenceFromRichTextRuns(stored) === reference) {
    return stored.map((run) => ({ ...run }));
  }
  const defaults = standardReferenceRuns(reference);
  if (!stored || stored.length === 0) {
    return defaults;
  }
  return defaults.map((run, index) => {
    const previous =
      stored[index] ??
      stored.find((candidate) => candidate.script === run.script);
    return previous
      ? {
          ...run,
          bold: previous.bold,
          italic: previous.italic,
          ...(previous.color ? { color: previous.color } : {}),
          ...(previous.fontSizeScale
            ? { fontSizeScale: previous.fontSizeScale }
            : {}),
        }
      : run;
  });
}

export function richTextRunMetrics(
  run: RichTextRun,
  baseFontSize: number,
): {
  fontSize: number;
  dy: number;
  dx: number;
} {
  const fontSize = baseFontSize * (run.fontSizeScale ?? 1);
  const script =
    run.script === "subscript"
      ? "subscript"
      : run.script === "superscript"
        ? "superscript"
        : "normal";
  return {
    fontSize:
      script === "normal"
        ? fontSize
        : fontSize * SUBSCRIPT_SCALE,
    dy:
      script === "subscript"
        ? fontSize * SUBSCRIPT_BASELINE_DROP
        : script === "superscript"
          ? -fontSize * SUBSCRIPT_BASELINE_DROP
          : 0,
    dx:
      script === "normal"
        ? 0
        : fontSize * SUBSCRIPT_HORIZONTAL_GAP,
  };
}
