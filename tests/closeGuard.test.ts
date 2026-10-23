import { describe, expect, it } from "vitest";
import {
  UNSAVED_CLOSE_PROMPT,
  interpretCloseResponse,
} from "../src/main/closeGuard";
import {
  WINDOW_MIN_HEIGHT,
  WINDOW_MIN_WIDTH,
} from "../src/main/windowConfig";

describe("desktop close protection", () => {
  it("maps native Save, Discard, and Cancel choices explicitly", () => {
    expect(interpretCloseResponse(0)).toBe("save");
    expect(interpretCloseResponse(1)).toBe("discard");
    expect(interpretCloseResponse(2)).toBe("cancel");
    expect(interpretCloseResponse(99)).toBe("cancel");
  });

  it("offers all three unsaved choices and uses Cancel as the escape action", () => {
    expect(UNSAVED_CLOSE_PROMPT.buttons).toEqual(["Save", "Discard", "Cancel"]);
    expect(UNSAVED_CLOSE_PROMPT.cancelId).toBe(2);
  });

  it("enforces a usable minimum window size", () => {
    expect(WINDOW_MIN_WIDTH).toBeGreaterThanOrEqual(800);
    expect(WINDOW_MIN_HEIGHT).toBeGreaterThanOrEqual(600);
  });
});
