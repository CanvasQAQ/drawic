import { describe, expect, it } from "vitest";
import {
  commitHistory,
  createHistory,
  redoHistory,
  undoHistory,
} from "../src/core/history";

describe("document history", () => {
  it("treats each commit as one undo step", () => {
    let history = createHistory({ x: 0 });
    history = commitHistory(history, { x: 10 });
    history = commitHistory(history, { x: 20 });
    history = undoHistory(history);
    expect(history.present.x).toBe(10);
    history = undoHistory(history);
    expect(history.present.x).toBe(0);
    expect(undoHistory(history)).toBe(history);
  });

  it("preserves redo history until a new commit", () => {
    let history = createHistory({ label: "a" });
    history = commitHistory(history, { label: "b" });
    history = undoHistory(history);
    history = redoHistory(history);
    expect(history.present.label).toBe("b");
    history = undoHistory(history);
    history = commitHistory(history, { label: "c" });
    expect(history.future).toEqual([]);
  });

  it("does not create undo noise for identical state objects", () => {
    const initial = { x: 0 };
    const history = createHistory(initial);
    expect(commitHistory(history, initial)).toBe(history);
  });
});
