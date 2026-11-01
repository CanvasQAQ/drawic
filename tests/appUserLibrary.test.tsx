import React from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildDeviceLibraryFile } from "../src/core/deviceLibraryRegistry";
import { addComponent } from "../src/core/editor";
import {
  loadDeviceLibrary,
  parseDeviceLibraryText,
  serializeDeviceLibraryFile,
  type DeviceLibraryRecord,
} from "../src/core/library";
import { createDocument, parseProjectText, serializeProject } from "../src/core/model";
import { App } from "../src/renderer/App";

const customDevice: DeviceLibraryRecord = {
  id: "custom-a",
  title: "Custom A",
  category: "custom",
  keywords: ["custom"],
  electrical: true,
  palette: true,
  frame: { x: -10, y: -10, width: 20, height: 20 },
  artwork: {
    type: "svg",
    viewBox: "0 0 20 20",
    body: '<path d="M -10 0 L 10 0" fill="none" stroke="currentColor"/>',
    source: "custom-a.svg",
    sourceSha256: "0",
  },
  pins: [
    {
      id: "1",
      key: "1",
      name: "1",
      role: "passive",
      direction: "west",
      side: "west",
      x: -10,
      y: 0,
    },
  ],
  labelAnchors: {
    reference: { x: 10, y: -6, anchor: "start" },
    value: { x: 10, y: 6, anchor: "start" },
  },
  spice: { prefix: "X", defaultValue: "", supported: false },
  metadata: { sourceCollection: "user", sourceRevision: null },
};

function userLibraryText(): string {
  return serializeDeviceLibraryFile(
    buildDeviceLibraryFile({
      id: "drawic-user",
      title: "Custom devices",
      collection: "user",
      devices: [customDevice],
    }),
  );
}

function createBridge(content: string | null): Window["drawic"] {
  const unsubscribe = (): void => undefined;
  return {
    platform: "linux",
    version: "test",
    openProject: vi.fn().mockResolvedValue(null),
    saveProject: vi.fn().mockResolvedValue({ canceled: true }),
    openRecentProject: vi.fn().mockResolvedValue(null),
    getRecentProjects: vi.fn().mockResolvedValue([]),
    exportSchematic: vi.fn().mockResolvedValue({ canceled: true }),
    importSpice: vi.fn().mockResolvedValue(null),
    saveSpice: vi.fn().mockResolvedValue({ canceled: true }),
    savePinAudit: vi.fn().mockResolvedValue({ canceled: true }),
    loadUserDeviceLibrary: vi.fn().mockResolvedValue(content),
    saveUserDeviceLibrary: vi.fn().mockResolvedValue(undefined),
    importDeviceLibrary: vi.fn().mockResolvedValue({ canceled: true }),
    exportDeviceLibrary: vi.fn().mockResolvedValue({ canceled: true }),
    checkpoint: vi.fn().mockResolvedValue(undefined),
    clearRecovery: vi.fn().mockResolvedValue(undefined),
    getRecovery: vi.fn().mockResolvedValue(null),
    getLaunchProject: vi.fn().mockResolvedValue(null),
    setDocumentDirty: vi.fn(),
    finishClose: vi.fn(),
    isWindowMaximized: vi.fn().mockResolvedValue(false),
    minimizeWindow: vi.fn(),
    toggleWindowMaximize: vi.fn(),
    closeWindow: vi.fn(),
    onCommand: vi.fn(() => unsubscribe),
    onProjectOpen: vi.fn(() => unsubscribe),
    onWindowMaximizedChange: vi.fn(() => unsubscribe),
  };
}

describe("App user device library", () => {
  let container: HTMLElement;
  let root: Root;

  beforeEach(() => {
    Object.defineProperty(window, "drawic", {
      configurable: true,
      value: createBridge(userLibraryText()),
    });
    localStorage.clear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    flushSync(() => root.render(<App />));
  });

  afterEach(() => {
    root.unmount();
    container.remove();
    Reflect.deleteProperty(window, "drawic");
    document.documentElement.removeAttribute("data-theme");
  });

  it("merges the user library into the palette at startup", async () => {
    await vi.waitFor(() =>
      expect(container.textContent).toContain("Custom A"),
    );
    expect(container.textContent).toContain("Resistor");
  });

  it("opens the device manager from the palette", async () => {
    await vi.waitFor(() =>
      expect(container.textContent).toContain("Custom A"),
    );
    const manage = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Manage devices"),
    ) as HTMLButtonElement | undefined;
    expect(manage).toBeTruthy();
    flushSync(() => manage!.click());
    expect(container.querySelector(".device-library-screen")).not.toBeNull();

    const customTab = [
      ...container.querySelectorAll(".device-library-tabs button"),
    ].find((button) => button.textContent?.includes("Custom")) as
      | HTMLButtonElement
      | undefined;
    flushSync(() => customTab!.click());
    expect(container.textContent).toContain("Custom A");
    expect(container.textContent).toContain("Save library");
  });

  it("keeps the embedded device snapshot in memory after saving a project", async () => {
    const user = loadDeviceLibrary(parseDeviceLibraryText(userLibraryText()));
    const initial = createDocument({ id: "project", pageId: "page", now: "2026-11-01T00:00:00.000Z" });
    const document = addComponent(initial, "page", {
      id: "node",
      symbol: user.byId.get("custom-a")!,
      reference: "X1",
      point: { x: 0, y: 0 },
      library: user.symbols,
      now: "2026-11-01T00:00:00.000Z",
    });
    const bridge = createBridge(userLibraryText());
    vi.mocked(bridge.getLaunchProject).mockResolvedValue({
      path: "/tmp/project.drawic.json",
      content: serializeProject(document),
    });
    vi.mocked(bridge.saveProject).mockResolvedValue({
      canceled: false,
      path: "/tmp/project.drawic.json",
    });
    root.unmount();
    Object.defineProperty(window, "drawic", { configurable: true, value: bridge });
    root = createRoot(container);
    flushSync(() => root.render(<App />));

    await vi.waitFor(() => {
      expect(container.querySelector(".component-node")).not.toBeNull();
      expect(container.textContent).toContain("Custom A");
    });
    flushSync(() =>
      (container.querySelector('[aria-label="Save"]') as HTMLButtonElement).click(),
    );
    await vi.waitFor(() => expect(bridge.saveProject).toHaveBeenCalledOnce());
    const request = vi.mocked(bridge.saveProject).mock.calls[0]![0];
    expect(parseProjectText(request.content).embeddedLibrary?.devices[0]?.id).toBe("custom-a");
    await vi.waitFor(() => expect(container.textContent).toContain("Local file synced"));
    flushSync(() =>
      (container.querySelector(".library-manage") as HTMLButtonElement).click(),
    );
    expect(container.querySelector(".device-source.is-project")).not.toBeNull();
  });
});
