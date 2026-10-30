import { describe, expect, it } from "vitest";
import type { Annotation, DrawingShape, RichTextRun } from "../src/core/model";
import {
  annotationTextRuns,
  normalizeRichTextRuns,
  noteFallbackTextRuns,
  plainTextToRuns,
  richTextRunsEqual,
  richTextRunsForText,
  runsToPlainText,
  shapeTextRuns,
  sliceRichTextRuns,
  splitRichTextRunsByLine,
} from "../src/core/textRuns";

function run(
  text: string,
  overrides: Partial<RichTextRun> = {},
): RichTextRun {
  return {
    text,
    bold: overrides.bold ?? false,
    italic: overrides.italic ?? false,
    script: overrides.script ?? "normal",
    ...(overrides.color ? { color: overrides.color } : {}),
    ...(overrides.fontSizeScale
      ? { fontSizeScale: overrides.fontSizeScale }
      : {}),
  };
}

describe("rich text run helpers", () => {
  it("normalizes empty and adjacent runs without changing text", () => {
    const runs = normalizeRichTextRuns([
      run("", { bold: true }),
      run("A", { bold: true }),
      run("B", { bold: true }),
      run("C"),
    ]);
    expect(runs).toEqual([run("AB", { bold: true }), run("C")]);
    expect(runsToPlainText(runs)).toBe("ABC");
  });

  it("creates multiline plain runs and splits them back into lines", () => {
    const runs = plainTextToRuns("one\ntwo", { bold: true });
    expect(runs).toEqual([
      run("one\n", { bold: true }),
      run("two", { bold: true }),
    ]);
    expect(splitRichTextRunsByLine(runs).map(runsToPlainText)).toEqual([
      "one",
      "two",
    ]);
  });

  it("slices styled runs and keeps formatting metadata", () => {
    const runs = [
      run("bold", { bold: true }),
      run("italic", { italic: true }),
      run("sub", { script: "subscript" }),
    ];
    expect(sliceRichTextRuns(runs, 2, 8)).toEqual([
      run("ld", { bold: true }),
      run("ital", { italic: true }),
    ]);
  });

  it("compares runs including color and font-size metadata", () => {
    expect(richTextRunsEqual([run("A", { bold: true })], [run("A", { bold: true })])).toBe(true);
    expect(richTextRunsEqual([run("A")], [run("A", { bold: true })])).toBe(false);
    expect(
      richTextRunsEqual(
        [run("A", { color: "#ff0000" })],
        [run("A", { color: "#00ff00" })],
      ),
    ).toBe(false);
  });

  it("uses stored runs only when they compose the field text", () => {
    const stored = [run("A", { bold: true }), run("B")];
    expect(richTextRunsForText("AB", stored)).toEqual(stored);
    expect(
      richTextRunsForText("AC", stored, { italic: true }),
    ).toEqual([run("AC", { italic: true })]);
  });

  it("derives annotation fallback runs from legacy bold and italic", () => {
    const annotation: Annotation = {
      id: "t1",
      kind: "text",
      text: "Hello",
      x: 0,
      y: 0,
      size: 16,
      bold: true,
      italic: true,
    };
    expect(annotationTextRuns(annotation)).toEqual([
      run("Hello", { bold: true, italic: true }),
    ]);
  });

  it("keeps note heading styling for legacy note text", () => {
    const shape: DrawingShape = {
      id: "n1",
      kind: "note",
      x: 0,
      y: 0,
      width: 240,
      height: 100,
      rotation: 0,
      stroke: "#b98433",
      fill: "#f2c777",
      text: "Heading\nBody",
    };
    expect(shapeTextRuns(shape)).toEqual(noteFallbackTextRuns("Heading\nBody"));
    expect(shapeTextRuns(shape)[0]).toMatchObject({ bold: true });
    expect(shapeTextRuns(shape)[1]).toMatchObject({ bold: false });
  });

  it("uses legacy textBold for rectangle fallback runs", () => {
    const shape: DrawingShape = {
      id: "s1",
      kind: "rectangle",
      x: 0,
      y: 0,
      width: 100,
      height: 60,
      rotation: 0,
      stroke: "#263d48",
      fill: "transparent",
      text: "Label",
      textBold: false,
    };
    expect(shapeTextRuns(shape)).toEqual([run("Label")]);
  });

  it("prefers valid stored shape runs over fallback styling", () => {
    const stored = [run("Bo", { bold: true }), run("dy")];
    const shape: DrawingShape = {
      id: "s2",
      kind: "rectangle",
      x: 0,
      y: 0,
      width: 100,
      height: 60,
      rotation: 0,
      stroke: "#263d48",
      fill: "transparent",
      text: "Body",
      textBold: false,
      richText: stored,
    };
    expect(shapeTextRuns(shape)).toEqual(stored);
  });
});
