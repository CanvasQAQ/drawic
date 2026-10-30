export const NOTE_PADDING = 14;
export const NOTE_TEXT_TOP = 28;
export const NOTE_BOTTOM_PADDING = 12;
export const NOTE_HEADING_EXTRA_SIZE = 2;
export const NOTE_CHAR_WIDTH_RATIO = 0.56;

export interface NoteTextLine {
  text: string;
  heading: boolean;
  fontSize: number;
  lineHeight: number;
}

function wrapParagraph(
  paragraph: string,
  availableWidth: number,
  fontSize: number,
): string[] {
  if (!paragraph) {
    return [""];
  }
  const maxCharacters = Math.max(
    1,
    Math.floor(availableWidth / (fontSize * NOTE_CHAR_WIDTH_RATIO)),
  );
  const lines: string[] = [];
  let line = "";
  const flush = (): void => {
    if (line) {
      lines.push(line);
      line = "";
    }
  };
  for (const token of paragraph.split(/(\s+)/)) {
    if (!token) {
      continue;
    }
    if (/^\s+$/.test(token)) {
      continue;
    }
    if (token.length > maxCharacters) {
      flush();
      for (let index = 0; index < token.length; index += maxCharacters) {
        const chunk = token.slice(index, index + maxCharacters);
        if (chunk.length === maxCharacters) {
          lines.push(chunk);
        } else {
          line = chunk;
        }
      }
      continue;
    }
    if (!line) {
      line = token;
    } else if (line.length + 1 + token.length <= maxCharacters) {
      line += ` ${token}`;
    } else {
      flush();
      line = token;
    }
  }
  flush();
  return lines.length > 0 ? lines : [""];
}

/**
 * Lays out a Note body so it never overflows the frame horizontally.
 * The first paragraph is treated as the heading; later paragraphs are body copy.
 */
export function layoutNoteText(
  text: string,
  width: number,
  fontSize: number,
): NoteTextLine[] {
  const availableWidth = Math.max(
    16,
    width - NOTE_PADDING * 2,
  );
  const headingSize = fontSize + NOTE_HEADING_EXTRA_SIZE;
  const lines: NoteTextLine[] = [];
  text.split(/\r?\n/).forEach((paragraph, paragraphIndex) => {
    const heading = paragraphIndex === 0;
    const size = heading ? headingSize : fontSize;
    for (const line of wrapParagraph(paragraph, availableWidth, size)) {
      lines.push({
        text: line,
        heading,
        fontSize: size,
        lineHeight: size * 1.45,
      });
    }
  });
  return lines;
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
  const inset = 4;
  const minX = inset - NOTE_PADDING;
  const maxX = width - inset - NOTE_PADDING - blockWidth;
  const minY = inset - NOTE_TEXT_TOP;
  const maxY = height - inset - NOTE_TEXT_TOP - blockHeight;
  const clampRange = (value: number, min: number, max: number): number =>
    max < min ? (min + max) / 2 : Math.min(max, Math.max(min, value));
  return {
    x: clampRange(offset.x, minX, maxX),
    y: clampRange(offset.y, minY, maxY),
  };
}

export function noteContentHeight(
  text: string,
  width: number,
  fontSize: number,
): number {
  const lines = layoutNoteText(text, width, fontSize);
  const textHeight = lines.reduce((total, line) => total + line.lineHeight, 0);
  return Math.max(
    60,
    NOTE_TEXT_TOP + textHeight + NOTE_BOTTOM_PADDING,
  );
}
