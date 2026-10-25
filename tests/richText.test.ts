import { describe, expect, it } from "vitest";
import {
  referenceFromRichTextRuns,
  richTextRunsForReference,
} from "../src/core/richText";
import type { RichTextRun } from "../src/core/model";

describe("Reference rich text", () => {
  it("keeps a multi-character Base independent from its Subscript", () => {
    const runs: RichTextRun[] = [
      { text: "XU", bold: true, italic: true, script: "normal" },
      { text: "TAIL", bold: true, italic: false, script: "subscript" },
    ];
    expect(referenceFromRichTextRuns(runs)).toBe("XU_TAIL");
    expect(richTextRunsForReference("XU_TAIL", runs)).toEqual(runs);
  });

  it("resolves rich runs from an unmatched ordinary Reference", () => {
    expect(richTextRunsForReference("NOTE")).toEqual([
      { text: "NOTE", bold: false, italic: false, script: "normal" },
    ]);
  });

  it("preserves run styling when the Reference text changes", () => {
    const runs = richTextRunsForReference("M1");
    const changed = richTextRunsForReference("M22", runs);
    expect(changed[0]).toMatchObject({
      text: "M",
      bold: true,
      italic: true,
      script: "normal",
    });
    expect(changed[1]).toMatchObject({
      text: "22",
      bold: true,
      italic: false,
      script: "subscript",
    });
  });
});
