import { describe, expect, it } from "vitest";
import {
  NOTE_BOTTOM_PADDING,
  NOTE_TEXT_ASCENT_RATIO,
  NOTE_TEXT_DESCENT_RATIO,
  NOTE_TEXT_TOP,
  clampNoteTextOffset,
  layoutNoteRichText,
  layoutNoteText,
  noteContentHeight,
} from "../src/core/noteText";
import type { RichTextRun } from "../src/core/model";

function noteTextMetrics(
  text: string,
  width: number,
  fontSize: number,
): {
  firstLine: ReturnType<typeof layoutNoteText>[number];
  lastLine: ReturnType<typeof layoutNoteText>[number];
  baselineSpan: number;
} {
  const lines = layoutNoteText(text, width, fontSize);
  const firstLine = lines[0]!;
  const lastLine = lines[lines.length - 1]!;
  const baselineSpan =
    lines.reduce((total, line) => total + line.lineHeight, 0) -
    lastLine.lineHeight;
  return { firstLine, lastLine, baselineSpan };
}

describe("note text layout", () => {
  it("keeps the first paragraph as the heading and wraps body copy", () => {
    const lines = layoutNoteText(
      "Gain stage\nSets closed-loop gain and input impedance.",
      200,
      13,
    );
    expect(lines[0]).toMatchObject({ heading: true, text: "Gain stage" });
    expect(lines.slice(1).every((line) => line.heading === false)).toBe(true);
    expect(lines.slice(1).map((line) => line.text).join(" ")).toBe(
      "Sets closed-loop gain and input impedance.",
    );
    for (const line of lines) {
      expect(line.text.length * line.fontSize * 0.56).toBeLessThanOrEqual(200);
    }
  });

  it("breaks long unspaced runs and CJK text inside the frame", () => {
    const lines = layoutNoteText(
      "解释\n这一块负责把输入信号放大并稳定闭环增益，避免输出失真。",
      180,
      13,
    );
    expect(lines[0]).toMatchObject({ heading: true });
    expect(lines.length).toBeGreaterThan(2);
    for (const line of lines) {
      expect(line.text.length * line.fontSize * 0.56).toBeLessThanOrEqual(180);
    }
  });

  it("lays out styled runs across wrapped note lines", () => {
    const runs: RichTextRun[] = [
      { text: "Heading ", bold: true, italic: false, script: "normal" },
      { text: "continued", bold: true, italic: false, script: "normal" },
      { text: "\nBody ", bold: false, italic: false, script: "normal" },
      { text: "bold", bold: true, italic: false, script: "normal" },
      { text: " normal", bold: false, italic: false, script: "normal" },
    ];
    const lines = layoutNoteRichText(runs, 150, 13);
    expect(lines.length).toBeGreaterThan(2);
    for (const line of lines) {
      expect(line.runs.map((run) => run.text).join("")).toBe(line.text);
    }
    expect(lines[0]?.heading).toBe(true);
    expect(lines[0]?.runs.every((run) => run.bold)).toBe(true);
    const bodyBold = lines
      .flatMap((line) => line.runs)
      .find((run) => run.text.includes("bold"));
    expect(bodyBold?.bold).toBe(true);
  });

  it("computes a content height that clears the header and text", () => {
    const short = noteContentHeight("Note", 240, 13);
    const long = noteContentHeight(
      "Gain stage\nSets closed-loop gain and input impedance for the first stage.",
      160,
      13,
    );
    expect(short).toBeGreaterThanOrEqual(60);
    expect(long).toBeGreaterThan(short);

    const text = "Gain stage\nSets closed-loop gain and input impedance.";
    const { lastLine, baselineSpan } = noteTextMetrics(text, 200, 13);
    const expected =
      NOTE_TEXT_TOP +
      baselineSpan +
      lastLine.fontSize * NOTE_TEXT_DESCENT_RATIO +
      NOTE_BOTTOM_PADDING;
    expect(noteContentHeight(text, 200, 13)).toBeCloseTo(expected);
  });

  it("keeps the draggable note text inside the frame", () => {
    const inside = clampNoteTextOffset(
      { x: 10, y: 8 },
      "Gain stage\nShort body.",
      240,
      120,
      13,
    );
    expect(inside).toEqual({ x: 10, y: 8 });

    const pushed = clampNoteTextOffset(
      { x: 5000, y: 5000 },
      "Gain stage\nShort body.",
      240,
      120,
      13,
    );
    expect(pushed.x).toBeLessThanOrEqual(240);
    expect(pushed.y).toBeLessThanOrEqual(120);

    const negative = clampNoteTextOffset(
      { x: -5000, y: -5000 },
      "Gain stage\nShort body.",
      240,
      120,
      13,
    );
    expect(negative.x).toBeGreaterThanOrEqual(-14);
    expect(negative.y).toBeGreaterThanOrEqual(-28);
  });

  it("keeps painted glyph edges, not line boxes, inside the frame", () => {
    const text = "Gain stage\nShort body.";
    const width = 240;
    const height = 120;
    const fontSize = 13;
    const { firstLine, lastLine, baselineSpan } = noteTextMetrics(
      text,
      width,
      fontSize,
    );

    const top = clampNoteTextOffset(
      { x: 0, y: -5000 },
      text,
      width,
      height,
      fontSize,
    );
    const paintedTop =
      NOTE_TEXT_TOP +
      top.y -
      firstLine.fontSize * NOTE_TEXT_ASCENT_RATIO;
    expect(paintedTop).toBeCloseTo(4);

    const bottom = clampNoteTextOffset(
      { x: 0, y: 5000 },
      text,
      width,
      height,
      fontSize,
    );
    const paintedBottom =
      NOTE_TEXT_TOP +
      bottom.y +
      baselineSpan +
      lastLine.fontSize * NOTE_TEXT_DESCENT_RATIO;
    expect(paintedBottom).toBeCloseTo(height - 4);
  });
});
