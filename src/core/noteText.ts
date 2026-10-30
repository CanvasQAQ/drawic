import type { RichTextRun } from "./model";
import {
  normalizeRichTextRuns,
  noteFallbackTextRuns,
  runsToPlainText,
  sliceRichTextRuns,
  splitRichTextRunsByLine,
} from "./textRuns";

export const NOTE_PADDING = 14;
export const NOTE_TEXT_TOP = 28;
export const NOTE_BOTTOM_PADDING = 12;
export const NOTE_HEADING_EXTRA_SIZE = 2;
export const NOTE_CHAR_WIDTH_RATIO = 0.56;
// SVG text anchors each line on its baseline. These ratios keep the painted
// glyph bounds (not the line boxes) inside the note frame.
export const NOTE_TEXT_ASCENT_RATIO = 0.9;
export const NOTE_TEXT_DESCENT_RATIO = 0.22;

export interface NoteTextLine {
  text: string;
  heading: boolean;
  fontSize: number;
  lineHeight: number;
  runs: RichTextRun[];
}

function wrapParagraphRuns(
  paragraphRuns: readonly RichTextRun[],
  availableWidth: number,
  fontSize: number,
): RichTextRun[][] {
  const paragraph = runsToPlainText(paragraphRuns);
  if (!paragraph) {
    return [[]];
  }
  const maxCharacters = Math.max(
    1,
    Math.floor(availableWidth / (fontSize * NOTE_CHAR_WIDTH_RATIO)),
  );
  const lines: RichTextRun[][] = [];
  let line: RichTextRun[] = [];
  let lineLength = 0;
  const flush = (): void => {
    if (lineLength > 0) {
      lines.push(normalizeRichTextRuns(line));
      line = [];
      lineLength = 0;
    }
  };
  for (const match of paragraph.matchAll(/\S+/g)) {
    const token = match[0];
    const start = match.index ?? 0;
    const tokenRuns = sliceRichTextRuns(
      paragraphRuns,
      start,
      start + token.length,
    );
    if (token.length > maxCharacters) {
      flush();
      let offset = 0;
      while (offset + maxCharacters < token.length) {
        lines.push(
          normalizeRichTextRuns(
            sliceRichTextRuns(tokenRuns, offset, offset + maxCharacters),
          ),
        );
        offset += maxCharacters;
      }
      line = sliceRichTextRuns(tokenRuns, offset, token.length);
      lineLength = token.length - offset;
      continue;
    }
    if (lineLength === 0) {
      line = tokenRuns;
      lineLength = token.length;
    } else if (lineLength + 1 + token.length <= maxCharacters) {
      const spaceStyle = line[line.length - 1] ?? tokenRuns[0];
      line = [
        ...line,
        ...(spaceStyle
          ? [{ ...spaceStyle, text: " " }]
          : [{ text: " ", bold: false, italic: false, script: "normal" as const }]),
        ...tokenRuns,
      ];
      lineLength += 1 + token.length;
    } else {
      flush();
      line = tokenRuns;
      lineLength = token.length;
    }
  }
  flush();
  return lines.length > 0 ? lines : [[]];
}

/**
 * Lays out a Note body so it never overflows the frame horizontally.
 * The first paragraph is treated as the heading; later paragraphs are body copy.
 */
export function layoutNoteRichText(
  runs: readonly RichTextRun[],
  width: number,
  fontSize: number,
): NoteTextLine[] {
  const availableWidth = Math.max(16, width - NOTE_PADDING * 2);
  const headingSize = fontSize + NOTE_HEADING_EXTRA_SIZE;
  const paragraphs = splitRichTextRunsByLine(runs);
  const lines: NoteTextLine[] = [];
  paragraphs.forEach((paragraphRuns, paragraphIndex) => {
    const heading = paragraphIndex === 0;
    const size = heading ? headingSize : fontSize;
    for (const lineRuns of wrapParagraphRuns(
      paragraphRuns,
      availableWidth,
      size,
    )) {
      lines.push({
        text: runsToPlainText(lineRuns),
        heading,
        fontSize: size,
        lineHeight: size * 1.45,
        runs: lineRuns,
      });
    }
  });
  return lines;
}

export function layoutNoteText(
  text: string,
  width: number,
  fontSize: number,
): NoteTextLine[] {
  return layoutNoteRichText(noteFallbackTextRuns(text), width, fontSize);
}

export interface NoteTextOffset {
  x: number;
  y: number;
}

/**
 * Keeps the draggable note text block inside its frame while allowing free
 * placement. If the block is wider/taller than the frame it is centered.
 */
export function clampNoteTextOffset(
  offset: NoteTextOffset,
  text: string,
  width: number,
  height: number,
  fontSize: number,
): NoteTextOffset {
  const lines = layoutNoteText(text, width, fontSize);
  if (lines.length === 0) {
    return { x: 0, y: 0 };
  }
  const blockWidth = Math.max(
    ...lines.map((line) => line.text.length * line.fontSize * NOTE_CHAR_WIDTH_RATIO),
  );
  const blockHeight = lines.reduce((total, line) => total + line.lineHeight, 0);
  const firstLine = lines[0]!;
  const lastLine = lines[lines.length - 1]!;
  const baselineSpan = blockHeight - lastLine.lineHeight;
  const inset = 4;
  const minX = inset - NOTE_PADDING;
  const maxX = width - inset - NOTE_PADDING - blockWidth;
  const minY =
    inset - NOTE_TEXT_TOP + firstLine.fontSize * NOTE_TEXT_ASCENT_RATIO;
  const maxY =
    height -
    inset -
    NOTE_TEXT_TOP -
    baselineSpan -
    lastLine.fontSize * NOTE_TEXT_DESCENT_RATIO;
  const clampRange = (value: number, min: number, max: number): number =>
    max < min ? (min + max) / 2 : Math.min(max, Math.max(min, value));
  return {
    x: clampRange(offset.x, minX, maxX),
    y: clampRange(offset.y, minY, maxY),
  };
}

/**
 * Height required so the painted note text plus the bottom padding stays
 * inside the frame.
 */
export function noteContentHeight(
  text: string,
  width: number,
  fontSize: number,
): number {
  const lines = layoutNoteText(text, width, fontSize);
  const lastLine = lines[lines.length - 1]!;
  const baselineSpan =
    lines.reduce((total, line) => total + line.lineHeight, 0) -
    lastLine.lineHeight;
  return Math.max(
    60,
    NOTE_TEXT_TOP +
      baselineSpan +
      lastLine.fontSize * NOTE_TEXT_DESCENT_RATIO +
      NOTE_BOTTOM_PADDING,
  );
}
