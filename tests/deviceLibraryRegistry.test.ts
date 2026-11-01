// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  loadDeviceLibrary,
  type DeviceLibraryFile,
  type DeviceLibraryRecord,
} from "../src/core/library";
import {
  buildDeviceLibraryFile,
  copyDeviceRecord,
  deviceLibraryConflicts,
  embedReferencedDevices,
  mergeDeviceSymbols,
  mergeImportedDeviceLibrary,
  missingSymbolIds,
  referencedSymbolIds,
  resolveDeviceSymbol,
  uniqueDeviceId,
} from "../src/core/deviceLibraryRegistry";
import { addComponent } from "../src/core/editor";
import { createDocument, type DrawicDocument } from "../src/core/model";

function record(id: string, title = id): DeviceLibraryRecord {
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
      viewBox: "0 0 20 20",
      body: '<path d="M -10 0 L 10 0"/>',
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
      {
        id: "2",
        key: "2",
        name: "2",
        role: "passive",
        direction: "east",
        side: "east",
        x: 10,
        y: 0,
      },
    ],
    labelAnchors: {
      reference: { x: 10, y: -6, anchor: "start" },
      value: { x: 10, y: 6, anchor: "start" },
    },
    spice: { prefix: "X", defaultValue: "", supported: false },
    metadata: { sourceCollection: "test", sourceRevision: null },
  };
}

function library(
  id: string,
  records: DeviceLibraryRecord[],
): DeviceLibraryFile {
  return buildDeviceLibraryFile({
    id,
    title: id,
    collection: "test",
    devices: records,
  });
}

function documentWithSymbols(
  available: DeviceLibraryFile,
  symbolIds: readonly string[],
): DrawicDocument {
  const symbols = loadDeviceLibrary(available);
  let document = createDocument({
    id: "project",
    now: "2026-11-01T00:00:00.000Z",
  });
  const pageId = document.pages[0]!.id;
  symbolIds.forEach((symbolId, index) => {
    const symbol = symbols.byId.get(symbolId);
    if (!symbol) {
      throw new Error(`Missing test symbol ${symbolId}.`);
    }
    document = addComponent(document, pageId, {
      symbol,
      point: { x: index * 40, y: 0 },
      id: `node-${index}`,
      reference: `X${index}`,
      library: symbols.symbols,
      now: "2026-11-01T00:00:00.000Z",
    });
  });
  return document;
}

describe("device library layers", () => {
  it("resolves built-in before embedded before user definitions", () => {
    const builtIn = loadDeviceLibrary(
      library("built-in", [record("shared", "Built-in")]),
    );
    const embedded = loadDeviceLibrary(
      library("embedded", [
        record("shared", "Embedded"),
        record("project-only", "Project"),
      ]),
    );
    const user = loadDeviceLibrary(
      library("user", [
        record("shared", "User"),
        record("project-only", "User project"),
        record("user-only", "User"),
      ]),
    );
    const layers = { builtIn, embedded, user };

    expect(resolveDeviceSymbol(layers, "shared")?.label).toBe("Built-in");
    expect(resolveDeviceSymbol(layers, "project-only")?.label).toBe("Project");
    expect(resolveDeviceSymbol(layers, "user-only")?.label).toBe("User");
    expect(resolveDeviceSymbol(layers, "missing")).toBeUndefined();

    const merged = new Map(
      mergeDeviceSymbols(layers).map((symbol) => [symbol.id, symbol]),
    );
    expect(merged.get("shared")?.label).toBe("Built-in");
    expect(merged.get("project-only")?.label).toBe("Project");
    expect(merged.get("user-only")?.label).toBe("User");
  });

  it("collects unique referenced symbol ids and reports missing devices", () => {
    const builtInFile = library("built-in", [record("resistor")]);
    const userFile = library("user", [record("custom-a")]);
    const document = documentWithSymbols(
      library("all", [...builtInFile.devices, ...userFile.devices]),
      ["custom-a", "resistor", "custom-a"],
    );

    expect(referencedSymbolIds(document)).toEqual(["custom-a", "resistor"]);
    expect(
      missingSymbolIds(document, {
        builtIn: loadDeviceLibrary(builtInFile),
      }),
    ).toEqual(["custom-a"]);
    expect(
      missingSymbolIds(document, {
        builtIn: loadDeviceLibrary(builtInFile),
        user: loadDeviceLibrary(userFile),
      }),
    ).toEqual([]);
  });
});

describe("project device embedding", () => {
  it("embeds only referenced non-built-in devices", () => {
    const builtInFile = library("built-in", [record("resistor")]);
    const userFile = library("user", [
      record("custom-a"),
      record("custom-b"),
    ]);
    const document = documentWithSymbols(
      library("all", [...builtInFile.devices, ...userFile.devices]),
      ["resistor", "custom-a"],
    );

    const result = embedReferencedDevices(document, {
      builtIn: loadDeviceLibrary(builtInFile),
      userLibrary: userFile,
    });

    expect(result.missing).toEqual([]);
    expect(result.document.embeddedLibrary?.id).toBe("drawic-embedded");
    expect(
      result.document.embeddedLibrary?.devices.map((device) => device.id),
    ).toEqual(["custom-a"]);
    expect(result.document.embeddedLibrary?.source.entryCount).toBe(1);
    expect(result.document.embeddedLibrary?.revision).toBe(
      buildDeviceLibraryFile({
        id: "drawic-embedded",
        title: "Embedded devices",
        collection: "embedded",
        devices: [record("custom-a")],
      }).revision,
    );
  });

  it("preserves an existing embedded snapshot when the user library lacks it", () => {
    const builtInFile = library("built-in", [record("resistor")]);
    const userFile = library("user", [record("custom-a")]);
    const document = documentWithSymbols(
      library("all", [...builtInFile.devices, ...userFile.devices]),
      ["custom-a"],
    );
    const first = embedReferencedDevices(document, {
      builtIn: loadDeviceLibrary(builtInFile),
      userLibrary: userFile,
    });
    const second = embedReferencedDevices(first.document, {
      builtIn: loadDeviceLibrary(builtInFile),
    });

    expect(second.missing).toEqual([]);
    expect(second.document.embeddedLibrary?.devices.map((device) => device.id)).toEqual([
      "custom-a",
    ]);
    expect(JSON.stringify(second.document.embeddedLibrary)).toBe(
      JSON.stringify(first.document.embeddedLibrary),
    );
  });

  it("omits the embedded library when nothing is referenced and reports missing ids", () => {
    const builtInFile = library("built-in", [record("resistor")]);
    const empty = documentWithSymbols(
      library("all", builtInFile.devices),
      ["resistor"],
    );
    const noCustom = embedReferencedDevices(empty, {
      builtIn: loadDeviceLibrary(builtInFile),
    });
    expect(noCustom.document.embeddedLibrary).toBeUndefined();
    expect(noCustom.missing).toEqual([]);

    const missing = documentWithSymbols(
      library("all", [...builtInFile.devices, record("custom-ghost")]),
      ["custom-ghost"],
    );
    const result = embedReferencedDevices(missing, {
      builtIn: loadDeviceLibrary(builtInFile),
    });
    expect(result.document.embeddedLibrary).toBeUndefined();
    expect(result.missing).toEqual(["custom-ghost"]);
  });
});

describe("import conflicts", () => {
  it("distinguishes identical and conflicting device ids", () => {
    const existing = library("user", [record("custom-a"), record("custom-b")]);
    const incoming = library("imported", [
      record("custom-a"),
      record("custom-b", "Changed"),
      record("custom-c"),
    ]);

    expect(deviceLibraryConflicts(existing, incoming)).toEqual([
      { id: "custom-a", identical: true },
      { id: "custom-b", identical: false },
    ]);
    expect(deviceLibraryConflicts(null, incoming)).toEqual([]);
  });
});

describe("user library import policies", () => {
  const existing = library("user", [record("custom-a", "Local")]);
  const incoming = library("incoming", [
    record("custom-a", "Imported"),
    record("custom-b", "New"),
  ]);

  it("keeps local conflicts and adds new devices", () => {
    const result = mergeImportedDeviceLibrary(existing, incoming, "keep-local");
    expect(
      result.library.devices.find((device) => device.id === "custom-a")?.title,
    ).toBe("Local");
    expect(result.library.devices.map((device) => device.id)).toEqual([
      "custom-a",
      "custom-b",
    ]);
    expect(result.added).toBe(1);
    expect(result.skipped).toBe(1);
  });

  it("replaces local conflicts when requested", () => {
    const result = mergeImportedDeviceLibrary(existing, incoming, "replace");
    expect(
      result.library.devices.find((device) => device.id === "custom-a")?.title,
    ).toBe("Imported");
    expect(result.added).toBe(2);
    expect(result.skipped).toBe(0);
  });

  it("imports conflicts as copies with new ids", () => {
    const result = mergeImportedDeviceLibrary(existing, incoming, "copy");
    expect(result.library.devices).toHaveLength(3);
    expect(
      result.library.devices.find((device) => device.id === "custom-a")?.title,
    ).toBe("Local");
    const copy = result.library.devices.find(
      (device) => device.id === "custom-a-2",
    );
    expect(copy?.title).toBe("Imported (copy)");
  });

  it("generates stable custom ids", () => {
    expect(uniqueDeviceId("resistor", new Set())).toBe("custom-resistor");
    expect(
      uniqueDeviceId("custom-resistor", new Set(["custom-resistor"])),
    ).toBe("custom-resistor-2");
    expect(
      uniqueDeviceId(
        "op amp",
        new Set(["custom-op-amp", "custom-op-amp-2"]),
      ),
    ).toBe("custom-op-amp-3");
  });

  it("deep-copies records for a clone", () => {
    const original = record("custom-a", "Original");
    const copy = copyDeviceRecord(original, "custom-a-2", "Copy");
    copy.pins[0]!.x = 99;
    expect(original.pins[0]!.x).toBe(-10);
    expect(copy.id).toBe("custom-a-2");
  });
});
