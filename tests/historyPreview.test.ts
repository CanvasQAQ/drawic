import { describe, expect, it } from "vitest";
import {
  commitHistory,
  createHistory,
  undoHistory,
} from "../src/core/history";
import {
  beginHistoryPreview,
  commitHistoryPreviewMutation,
  createHistoryPreview,
  finishHistoryPreview,
  resetHistoryPreview,
} from "../src/renderer/historyPreview";

interface PreviewDocument {
  value: number;
}

describe("history preview", () => {
  it("collapses a drag gesture into one undo step", () => {
    let history = createHistory<PreviewDocument>({ value: 0 });
    const preview = createHistoryPreview<PreviewDocument>();
    beginHistoryPreview(preview, history.present);

    history = commitHistoryPreviewMutation(
      history,
      (document) => ({ value: document.value + 1 }),
      true,
    );
    history = commitHistoryPreviewMutation(
      history,
      (document) => ({ value: document.value + 1 }),
      true,
    );
    history = finishHistoryPreview(history, preview.base);
    resetHistoryPreview(preview);

    expect(history.present.value).toBe(2);
    expect(history.past).toEqual([{ value: 0 }]);
    expect(undoHistory(history).present.value).toBe(0);
  });

  it("does not add an undo step when a preview made no change", () => {
    let history = createHistory<PreviewDocument>({ value: 0 });
    const preview = createHistoryPreview<PreviewDocument>();
    beginHistoryPreview(preview, history.present);

    history = commitHistoryPreviewMutation(history, (document) => document, true);
    history = finishHistoryPreview(history, preview.base);
    resetHistoryPreview(preview);

    expect(history.past).toHaveLength(0);
    expect(history.present.value).toBe(0);
  });

  it("keeps ordinary commits as separate undo steps", () => {
    let history = createHistory<PreviewDocument>({ value: 0 });
    const preview = createHistoryPreview<PreviewDocument>();

    history = commitHistoryPreviewMutation(
      history,
      (document) => ({ value: document.value + 1 }),
      false,
    );
    history = commitHistoryPreviewMutation(
      history,
      (document) => ({ value: document.value + 1 }),
      false,
    );

    expect(history.past).toHaveLength(2);
    expect(history.present.value).toBe(2);
  });

  it("keeps redo history while a preview is in flight", () => {
    let history = createHistory<PreviewDocument>({ value: 0 });
    history = commitHistory(history, { value: 1 });
    history = undoHistory(history);
    expect(history.future).toHaveLength(1);

    const preview = createHistoryPreview<PreviewDocument>();
    beginHistoryPreview(preview, history.present);
    history = commitHistoryPreviewMutation(
      history,
      (document) => ({ value: document.value + 1 }),
      true,
    );

    expect(history.present.value).toBe(1);
    expect(history.future).toHaveLength(1);
    resetHistoryPreview(preview);
  });
});
