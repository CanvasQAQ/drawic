import type {
  Annotation,
  DrawingShape,
  LabelScript,
  RichTextRun,
} from "./model";

export interface RichTextFallbackStyle {
  bold?: boolean;
  italic?: boolean;
  script?: LabelScript;
}

function styleKey(run: RichTextRun): string {
  return [
    run.bold ? "1" : "0",
    run.italic ? "1" : "0",
    run.script,
    run.color ?? "",
    run.fontSizeScale ?? "",
  ].join(":");
}

/** Clones runs and merges adjacent runs that share exactly the same style. */
export function normalizeRichTextRuns(
  runs: readonly RichTextRun[],
): RichTextRun[] {
  const result: RichTextRun[] = [];
  for (const run of runs) {
    if (!run.text) {
      continue;
    }
    const next: RichTextRun = {
      text: run.text,
      bold: run.bold,
      italic: run.italic,
      script: run.script,
      ...(run.color ? { color: run.color } : {}),
      ...(run.fontSizeScale ? { fontSizeScale: run.fontSizeScale } : {}),
    };
    const previous = result.at(-1);
    if (previous && styleKey(previous) === styleKey(next)) {
      previous.text += next.text;
    } else {
      result.push(next);
    }
  }
  return result;
}

export function runsToPlainText(runs: readonly RichTextRun[]): string {
  return runs.map((run) => run.text).join("");
}

export function richTextRunsEqual(
  a: readonly RichTextRun[],
  b: readonly RichTextRun[],
): boolean {
  const left = normalizeRichTextRuns(a);
  const right = normalizeRichTextRuns(b);
  if (left.length !== right.length) {
    return false;
  }
  return left.every((run, index) => {
    const other = right[index]!;
    return (
      run.text === other.text &&
      run.bold === other.bold &&
      run.italic === other.italic &&
      run.script === other.script &&
      (run.color ?? null) === (other.color ?? null) &&
      (run.fontSizeScale ?? null) === (other.fontSizeScale ?? null)
    );
  });
}

/** Creates simple runs for plain text; the style applies to the whole text. */
export function plainTextToRuns(
  text: string,
  style: RichTextFallbackStyle = {},
): RichTextRun[] {
  if (!text) {
    return [];
  }
  const lines = text.split("\n");
  return lines.map((line, index) => ({
    text: index < lines.length - 1 ? `${line}\n` : line,
    bold: style.bold ?? false,
    italic: style.italic ?? false,
    script: style.script ?? "normal",
  }));
}

/**
 * Returns stored runs only when they still compose the same plain text;
 * otherwise rebuilds legacy runs from the requested fallback style.
 */
export function richTextRunsForText(
  text: string,
  stored: readonly RichTextRun[] | undefined,
  fallback: RichTextFallbackStyle = {},
): RichTextRun[] {
  if (stored && stored.length > 0) {
    const normalized = normalizeRichTextRuns(stored);
    if (runsToPlainText(normalized) === text) {
      return normalized;
    }
  }
  return plainTextToRuns(text, fallback);
}

export function splitRichTextRunsByLine(
  runs: readonly RichTextRun[],
): RichTextRun[][] {
  const lines: RichTextRun[][] = [];
  let current: RichTextRun[] = [];
  for (const run of runs) {
    const parts = run.text.split("\n");
    parts.forEach((part, index) => {
      if (part) {
        current.push({ ...run, text: part });
      }
      if (index < parts.length - 1) {
        lines.push(current);
        current = [];
      }
    });
  }
  lines.push(current);
  return lines;
}

export function sliceRichTextRuns(
  runs: readonly RichTextRun[],
  start: number,
  end: number,
): RichTextRun[] {
  if (end <= start) {
    return [];
  }
  const result: RichTextRun[] = [];
  let offset = 0;
  for (const run of runs) {
    const runStart = offset;
    const runEnd = offset + run.text.length;
    offset = runEnd;
    if (runEnd <= start || runStart >= end) {
      continue;
    }
    const from = Math.max(start, runStart) - runStart;
    const to = Math.min(end, runEnd) - runStart;
    const text = run.text.slice(from, to);
    if (text) {
      result.push({ ...run, text });
    }
  }
  return result;
}

export function noteFallbackTextRuns(text: string): RichTextRun[] {
  if (!text) {
    return [];
  }
  const lines = text.split("\n");
  return lines.map((line, index) => ({
    text: index < lines.length - 1 ? `${line}\n` : line,
    bold: index === 0,
    italic: false,
    script: "normal",
  }));
}

/** Rich runs for a Text/NET annotation, preserving legacy whole-label styling. */
export function annotationTextRuns(annotation: Annotation): RichTextRun[] {
  const text = annotation.text ?? "";
  if (annotation.kind === "text") {
    return richTextRunsForText(text, annotation.richText, {
      bold: annotation.bold ?? false,
      italic: annotation.italic ?? false,
    });
  }
  return richTextRunsForText(text, annotation.richText, {
    bold: true,
    italic: annotation.italic ?? false,
  });
}

/** Rich runs for a drawing shape label, preserving note heading defaults. */
export function shapeTextRuns(shape: DrawingShape): RichTextRun[] {
  const text = shape.text ?? "";
  if (shape.kind === "note") {
    if (shape.richText && shape.richText.length > 0) {
      const stored = normalizeRichTextRuns(shape.richText);
      if (runsToPlainText(stored) === text) {
        return stored;
      }
    }
    return noteFallbackTextRuns(text);
  }
  return richTextRunsForText(text, shape.richText, {
    bold: shape.textBold ?? true,
  });
}
