import { commitHistory, type HistoryState } from "../core/history";

export interface HistoryPreviewState<T> {
  active: boolean;
  base: T | null;
}

export function createHistoryPreview<T>(): HistoryPreviewState<T> {
  return { active: false, base: null };
}

/**
 * Marks the next mutations as live previews, remembering the document from
 * before the gesture so the whole gesture can become one undo step.
 */
export function beginHistoryPreview<T>(
  state: HistoryPreviewState<T>,
  document: T,
): void {
  if (state.active) {
    return;
  }
  state.active = true;
  state.base = document;
}

export function resetHistoryPreview<T>(state: HistoryPreviewState<T>): void {
  state.active = false;
  state.base = null;
}

export function commitHistoryPreviewMutation<T>(
  history: HistoryState<T>,
  mutation: (present: T) => T,
  previewing: boolean,
): HistoryState<T> {
  const next = mutation(history.present);
  if (!previewing) {
    return commitHistory(history, next);
  }
  return next === history.present
    ? history
    : { ...history, present: next };
}

/**
 * Closes an active preview and records the document from before the gesture as
 * the undo target for the final previewed value.
 */
export function finishHistoryPreview<T>(
  history: HistoryState<T>,
  base: T | null,
): HistoryState<T> {
  if (base === null || base === history.present) {
    return history;
  }
  return commitHistory({ ...history, present: base }, history.present);
}
