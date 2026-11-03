import React from "react";
import { flushSync } from "react-dom";
import type { Root } from "react-dom/client";
import { createThemedRoot as createRoot } from "./themedRoot";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildDeviceLibraryFile } from "../src/core/deviceLibraryRegistry";
import {
  serializeDeviceLibraryFile,
  type DeviceLibraryFile,
  type DeviceLibraryRecord,
} from "../src/core/library";
import { DeviceLibraryScreen } from "../src/renderer/components/DeviceLibraryScreen";

function record(id: string, title: string): DeviceLibraryRecord {
  return {
    id,
    title,
    category: "test",
    keywords: [],
    electrical: true,
    palette: true,
    frame: { x: -10, y: -10, width: 20, height: 20 },
    artwork: {
      type: "svg",
      viewBox: "-10 -10 20 20",
      body: '<circle cx="0" cy="0" r="6" fill="none" stroke="currentColor"/>',
      source: `${id}.svg`,
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
      reference: { x: 10, y: -3, anchor: "start" },
      value: { x: 10, y: 6, anchor: "start" },
    },
    spice: { prefix: "X", defaultValue: "", supported: false },
    metadata: { sourceCollection: "test", sourceRevision: null },
  };
}

function library(
  id: string,
  devices: DeviceLibraryRecord[],
): DeviceLibraryFile {
  return buildDeviceLibraryFile({
    id,
    title: id,
    collection: id,
    devices,
  });
}

const builtInFile = library("drawic-built-in", [
  record("resistor", "Resistor"),
  record("capacitor", "Capacitor"),
]);
const userFile = library("drawic-user", [record("custom-a", "Custom A")]);
const embeddedFile = library("drawic-embedded", [record("custom-b", "Project B")]);

function button(container: HTMLElement, text: string): HTMLButtonElement {
  const match = [...container.querySelectorAll("button")].find((candidate) =>
    candidate.textContent?.includes(text),
  );
  if (!match) {
    throw new Error(`Button ${text} not found.`);
  }
  return match as HTMLButtonElement;
}

describe("device library manager", () => {
  let container: HTMLElement;
  let root: Root;
  const handlers = {
    onClose: vi.fn(),
    onChangeUserLibrary: vi.fn(),
    onDiscardUserLibrary: vi.fn(),
    onSaveUserLibrary: vi.fn().mockResolvedValue(true),
    onImportLibrary: vi.fn().mockResolvedValue({ canceled: true }),
    onExportLibrary: vi.fn().mockResolvedValue({ canceled: true }),
    onExportAudit: vi.fn().mockResolvedValue({ canceled: true }),
    onRefreshEmbedded: vi.fn(() => ({ kind: "success" as const, message: "Refreshed 1 project device definition(s)." })),
  };

  function render(options: { userDirty?: boolean } = {}) {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    flushSync(() =>
      root.render(
        <DeviceLibraryScreen
          builtInFile={builtInFile}
          userFile={userFile}
          embeddedFile={embeddedFile}
          userDirty={options.userDirty ?? false}
          onClose={handlers.onClose}
          onChangeUserLibrary={handlers.onChangeUserLibrary}
          onDiscardUserLibrary={handlers.onDiscardUserLibrary}
          onSaveUserLibrary={handlers.onSaveUserLibrary}
          onImportLibrary={handlers.onImportLibrary}
          onExportLibrary={handlers.onExportLibrary}
          onExportAudit={handlers.onExportAudit}
          onRefreshEmbedded={handlers.onRefreshEmbedded}
        />,
      ),
    );
  }

  afterEach(() => {
    root.unmount();
    container.remove();
    Object.values(handlers).forEach((handler) => handler.mockClear());
  });

  it("browses built-in, custom, and project devices with source labels", () => {
    render();
    expect(container.querySelector("#device-library-title")?.textContent).toBe("Device library");
    expect(container.querySelector(".device-library-status")).toBeNull();
    expect(container.querySelectorAll(".catalog-card .catalog-preview")).toHaveLength(4);
    expect(container.querySelector(".catalog-detail")).toBeNull();
    expect(container.textContent).toContain("Resistor");
    expect(container.textContent).toContain("Custom A");
    expect(container.textContent).toContain("Project B");
    expect(container.textContent).toContain("Built-in");
    expect(container.textContent).toContain("Custom");
    expect(container.textContent).toContain("This project");
  });

  it("shows pin directions on every card and keeps actions on their card", () => {
    render();
    const resistor = container.querySelector('[data-device-id="resistor"]')!;
    expect(resistor.querySelector('[data-pin-key="1"]')).not.toBeNull();
    expect(resistor.querySelector('table')).toBeNull();
    expect(resistor.querySelector('button')?.textContent).toBe("Clone");
    const custom = container.querySelector('[data-device-id="custom-a"]')!;
    expect(custom.textContent).toContain("Edit");
  });

  it("opens a built-in clone with editable SVG elements and preserves its source record", () => {
    render();
    flushSync(() => (container.querySelector('[data-device-id="resistor"] button') as HTMLButtonElement).click());
    expect(container.querySelector('[aria-label="Artwork element"]')).not.toBeNull();
    expect(button(container, "Line").disabled).toBe(false);
    flushSync(() => button(container, "Save device").click());
    const next = handlers.onChangeUserLibrary.mock.calls[0]![0] as DeviceLibraryFile;
    const clone = next.devices.find(device => device.title === "Resistor (custom)")!;
    expect(clone.id).not.toBe("resistor");
    expect(clone.artwork.body).toBe(builtInFile.devices.find(device => device.id === "resistor")!.artwork.body);
  });

  it("duplicates a custom device into the draft library", () => {
    render();
    flushSync(() => button(container, "Custom").click());
    flushSync(() => button(container, "Duplicate").click());
    expect(handlers.onChangeUserLibrary).toHaveBeenCalledTimes(1);
    const next = handlers.onChangeUserLibrary.mock.calls[0]![0] as DeviceLibraryFile;
    expect(next.devices).toHaveLength(2);
    expect(next.devices.some((device) => device.title.includes("(copy)"))).toBe(true);
  });

  it("opens the pin audit from maintenance tools", () => {
    render();
    flushSync(() => button(container, "Audit").click());
    expect(container.textContent).toContain("Device pin direction audit");
    expect(container.textContent).toContain("Export corrections");
  });

  it("imports conflicting devices as copies", async () => {
    const incoming = library("incoming", [
      record("custom-a", "Imported A"),
      record("custom-b", "Imported B"),
    ]);
    handlers.onImportLibrary.mockResolvedValue({
      canceled: false,
      content: serializeDeviceLibraryFile(incoming),
    });
    render();
    flushSync(() => button(container, "Custom").click());
    flushSync(() => button(container, "Import library").click());
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain("conflicting devices"),
    );
    flushSync(() => button(document.body, "Import as copies").click());
    const next = handlers.onChangeUserLibrary.mock.calls[0]![0] as DeviceLibraryFile;
    expect(next.devices.map((device) => device.id).sort()).toEqual([
      "custom-a",
      "custom-a-2",
      "custom-b",
    ]);
  });

  it("rejects an imported device with a built-in ID", async () => {
    const incoming = library("incoming", [record("resistor", "Replacement")]);
    handlers.onImportLibrary.mockResolvedValue({
      canceled: false,
      content: serializeDeviceLibraryFile(incoming),
    });
    render();
    flushSync(() => button(container, "Custom").click());
    flushSync(() => button(container, "Import library").click());
    await vi.waitFor(() =>
      expect(container.textContent).toContain("built-in device ID resistor cannot be imported"),
    );
    expect(handlers.onChangeUserLibrary).not.toHaveBeenCalled();
  });

  it("refreshes the project's embedded devices", () => {
    render();
    flushSync(() => button(container, "Custom").click());
    flushSync(() => button(container, "Refresh project devices").click());
    expect(handlers.onRefreshEmbedded).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("Refreshed 1 project device");
  });

  it("confirms before discarding unsaved library changes", () => {
    render({ userDirty: true });
    flushSync(() =>
      (
        container.querySelector(
          '[aria-label="Close device library"]',
        ) as HTMLButtonElement
      ).click(),
    );
    expect(document.body.textContent).toContain("Save the custom device library?");
    flushSync(() => button(document.body, "Discard").click());
    expect(handlers.onDiscardUserLibrary).toHaveBeenCalledTimes(1);
    expect(handlers.onClose).toHaveBeenCalledTimes(1);
  });

  it("opens the editor for a new device", () => {
    render();
    flushSync(() => button(container, "Custom").click());
    flushSync(() => button(container, "New device").click());
    expect(container.textContent).toContain("Save device");
    expect(container.querySelector(".device-editor-toolbar-tools")).not.toBeNull();
    expect(container.textContent).toContain("Pick a tool and drag to draw");
  });

  it("saves a device draft without leaving the editor", () => {
    render();
    flushSync(() => button(container, "Custom").click());
    flushSync(() => button(container, "Edit").click());
    flushSync(() => button(container, "Save device").click());
    expect(handlers.onChangeUserLibrary).toHaveBeenCalledTimes(1);
    expect(container.querySelector(".device-editor")).not.toBeNull();
    expect(container.textContent).toContain("Saved to library draft");
    flushSync(() => button(container, "Device library").click());
    expect(container.querySelector(".device-editor")).toBeNull();
    expect(container.querySelector('[aria-label="Custom library"]')).not.toBeNull();
  });
});
