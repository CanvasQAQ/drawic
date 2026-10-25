import React from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TitleBar } from "../src/renderer/components/TitleBar";
import {
  THEME_STORAGE_KEY,
  applyThemeToDocument,
  persistTheme,
  resolveInitialTheme,
} from "../src/renderer/theme";

function renderTitleBar(platform: string, onToggleTheme = vi.fn()): {
  container: HTMLElement;
  root: Root;
} {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  flushSync(() =>
    root.render(
      <TitleBar
        documentTitle="netcheck"
        platform={platform}
        theme="dark"
        onToggleTheme={onToggleTheme}
      />,
    ),
  );
  return { container, root };
}

describe("window chrome", () => {
  const maximize = vi.fn();
  const minimize = vi.fn();
  const close = vi.fn();
  const toggle = vi.fn();
  const maximizeListener = vi.fn();

  beforeEach(() => {
    maximize.mockReset();
    minimize.mockReset();
    close.mockReset();
    toggle.mockReset();
    localStorage.clear();
    Object.defineProperty(window, "drawic", {
      configurable: true,
      value: {
        isWindowMaximized: maximize.mockResolvedValue(false),
        minimizeWindow: minimize,
        toggleWindowMaximize: toggle,
        closeWindow: close,
        onWindowMaximizedChange: (listener: (value: boolean) => void) => {
          maximizeListener.mockImplementation(listener);
          return vi.fn();
        },
      },
    });
  });

  afterEach(() => {
    document.documentElement.removeAttribute("data-theme");
  });

  it("renders custom controls on Windows and Linux", () => {
    for (const platform of ["win32", "linux"]) {
      const { container, root } = renderTitleBar(platform);
      expect(container.querySelector('[aria-label="Minimize window"]')).not.toBeNull();
      expect(container.querySelector('[aria-label="Maximize window"]')).not.toBeNull();
      expect(container.querySelector('[aria-label="Close window"]')).not.toBeNull();
      root.unmount();
      container.remove();
    }
  });

  it("reserves native traffic-light space and omits duplicate controls on macOS", () => {
    const { container, root } = renderTitleBar("darwin");
    expect(container.querySelector(".window-titlebar")?.classList).toContain("is-mac");
    expect(container.querySelector('[aria-label="Minimize window"]')).toBeNull();
    expect(container.querySelector('[aria-label="Close window"]')).toBeNull();
    root.unmount();
  });

  it("routes window and theme actions through the typed bridge", () => {
    const onToggleTheme = vi.fn();
    const { container, root } = renderTitleBar("win32", onToggleTheme);
    const click = (label: string) =>
      flushSync(() =>
        container
          .querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!
          .dispatchEvent(new MouseEvent("click", { bubbles: true })),
      );
    click("Minimize window");
    click("Maximize window");
    click("Close window");
    click("Switch to light theme");
    expect(minimize).toHaveBeenCalledOnce();
    expect(toggle).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
    expect(onToggleTheme).toHaveBeenCalledOnce();
    root.unmount();
  });

  it("applies and persists the selected theme locally", () => {
    persistTheme("light");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(resolveInitialTheme()).toBe("light");
    applyThemeToDocument("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.style.colorScheme).toBe("light");
  });
});
