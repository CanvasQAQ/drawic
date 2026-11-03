import { afterEach } from "vitest";

afterEach(() => {
  if (typeof document !== "undefined") {
    document.body.innerHTML = "";
  }
});

// jsdom has no layout engine. Desktop tests cover positioning and real element sizes.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
if (typeof HTMLElement !== "undefined") {
  HTMLElement.prototype.scrollIntoView ??= () => {};
  HTMLElement.prototype.hasPointerCapture ??= () => false;
}
