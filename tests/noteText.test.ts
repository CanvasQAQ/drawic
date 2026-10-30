import { describe, expect, it } from "vitest";
import {
  clampNoteTextOffset,
  layoutNoteText,
  noteContentHeight,
} from "../src/core/noteText";

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

  it("computes a content height that clears the header and text", () => {
    const short = noteContentHeight("Note", 240, 13);
    const long = noteContentHeight(
      "Gain stage\nSets closed-loop gain and input impedance for the first stage.",
      160,
      13,
    );
    expect(short).toBeGreaterThanOrEqual(60);
    expect(long).toBeGreaterThan(short);
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

});
