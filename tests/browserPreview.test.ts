import { describe, expect, it, vi } from "vitest";
import { parseProjectText } from "../src/core/model";
import { parseDeviceLibraryText } from "../src/core/library";
import {
  createPreviewBridge,
  previewProjectText,
  previewUserLibraryText,
} from "../src/renderer/preview/bridge";

describe("browser preview bridge", () => {
  it("provides deterministic, usable sample content", async () => {
    expect(previewProjectText()).toBe(previewProjectText());
    const project = parseProjectText(previewProjectText());
    expect(project.title).toBe("Preview Circuit");
    expect(project.pages[0]?.nodes.map((node) => node.reference)).toEqual(["R1", "C1", "GND1"]);
    const library = parseDeviceLibraryText(previewUserLibraryText());
    expect(library.devices.map((device) => device.title)).toEqual(["Preview sensor"]);
    expect(library.devices[0]?.artwork.shapes).toHaveLength(2);
    expect(library.devices[0]?.artwork.body).toContain("<circle");
    expect(library.devices[0]?.pins.map((pin) => pin.id)).toEqual(["in", "out"]);
    const bridge = createPreviewBridge(vi.fn());
    expect((await bridge.getLaunchProject())?.content).toBe(previewProjectText());
    expect(await bridge.loadUserDeviceLibrary()).toBe(previewUserLibraryText());
  });

  it("cancels file actions and reports preview mode without touching storage", async () => {
    const notify = vi.fn();
    const bridge = createPreviewBridge(notify);
    expect(await bridge.openProject()).toBeNull();
    expect(await bridge.saveProject({ path: null, suggestedName: "x", content: "x", projectId: "x" })).toEqual({ canceled: true });
    expect(await bridge.exportSchematic({ kind: "svg", suggestedName: "x", svg: "<svg/>" })).toEqual({ canceled: true });
    expect(await bridge.importDeviceLibrary()).toEqual({ canceled: true });
    await bridge.saveUserDeviceLibrary({ content: "{}" });
    bridge.closeWindow();
    expect(notify).toHaveBeenCalledTimes(6);
    expect(notify.mock.calls.every(([message]) => String(message).includes("预览模式"))).toBe(true);
  });
});
