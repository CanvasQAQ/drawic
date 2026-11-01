// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  loadDeviceLibrary,
  type DeviceLibraryFile,
  type DeviceLibraryRecord,
} from "../src/core/library";
import {
  buildDeviceLibraryFile,
  embedReferencedDevices,
} from "../src/core/deviceLibraryRegistry";
import { addComponent } from "../src/core/editor";
import {
  createDocument,
  parseProjectText,
  serializeProject,
  type DrawicDocument,
} from "../src/core/model";

const FIXED_TIME = "2026-11-01T00:00:00.000Z";

function record(
  id: string,
  title: string,
  body = '<path d="M -10 0 L 10 0"/>',
): DeviceLibraryRecord {
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
      body,
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

function fixture(): {
  document: DrawicDocument;
  embedded: DrawicDocument;
} {
  const builtIn = buildDeviceLibraryFile({
    id: "drawic-built-in",
    title: "Built-in",
    collection: "built-in",
    devices: [record("resistor", "Resistor")],
  });
  const user = buildDeviceLibraryFile({
    id: "drawic-user",
    title: "Custom devices",
    collection: "user",
    devices: [record("custom-a", "Custom A")],
  });
  const available = buildDeviceLibraryFile({
    id: "all",
    title: "All",
    collection: "test",
    devices: [...builtIn.devices, ...user.devices],
  });
  const symbols = loadDeviceLibrary(available);
  let document = createDocument({ id: "project", now: FIXED_TIME });
  const pageId = document.pages[0]!.id;
  for (const [index, symbolId] of ["resistor", "custom-a"].entries()) {
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
      now: FIXED_TIME,
    });
  }
  const embedded = embedReferencedDevices(document, {
    builtIn: loadDeviceLibrary(builtIn),
    userLibrary: user as DeviceLibraryFile,
  }).document;
  return { document, embedded };
}

describe("embedded project device library", () => {
  it("round-trips referenced custom devices without the user library", () => {
    const { embedded } = fixture();
    expect(embedded.embeddedLibrary?.devices.map((device) => device.id)).toEqual([
      "custom-a",
    ]);

    const parsed = parseProjectText(serializeProject(embedded));
    expect(parsed.schemaVersion).toBe(4);
    expect(parsed.embeddedLibrary?.id).toBe("drawic-embedded");
    expect(parsed.embeddedLibrary?.devices.map((device) => device.id)).toEqual([
      "custom-a",
    ]);
    expect(parsed.embeddedLibrary?.devices[0]?.pins.map((pin) => [pin.key, pin.x])).toEqual([
      ["1", -10],
      ["2", 10],
    ]);
  });

  it("keeps the project snapshot on normal save and updates it only on refresh", () => {
    const { embedded } = fixture();
    const revisedUser = buildDeviceLibraryFile({
      id: "drawic-user",
      title: "Custom devices",
      collection: "user",
      devices: [record("custom-a", "Revised Custom A")],
    });
    const builtIn = loadDeviceLibrary(
      buildDeviceLibraryFile({
        id: "drawic-built-in",
        title: "Built-in",
        collection: "built-in",
        devices: [record("resistor", "Resistor")],
      }),
    );

    const saved = embedReferencedDevices(embedded, {
      builtIn,
      userLibrary: revisedUser,
    }).document;
    expect(saved.embeddedLibrary?.devices[0]?.title).toBe("Custom A");

    const refreshed = embedReferencedDevices(embedded, {
      builtIn,
      userLibrary: revisedUser,
      refreshExisting: true,
    }).document;
    expect(refreshed.embeddedLibrary?.devices[0]?.title).toBe("Revised Custom A");
  });

  it("accepts schema version 3 projects and normalizes them to version 4", () => {
    const { embedded } = fixture();
    const text = JSON.stringify({
      ...embedded,
      schemaVersion: 3,
      embeddedLibrary: undefined,
    });
    const parsed = parseProjectText(text);
    expect(parsed.schemaVersion).toBe(4);
    expect(parsed.embeddedLibrary).toBeUndefined();
    expect(parsed.pages).toHaveLength(1);
  });

  it("rejects a version 3 project that carries an embedded library", () => {
    const { embedded } = fixture();
    expect(() =>
      parseProjectText(JSON.stringify({ ...embedded, schemaVersion: 3 })),
    ).toThrow(/version 3 project cannot contain/i);
  });

  it("rejects future schema versions", () => {
    const { embedded } = fixture();
    expect(() =>
      parseProjectText(JSON.stringify({ ...embedded, schemaVersion: 5 })),
    ).toThrow(/newer Drawic format/i);
  });

  it("sanitizes untrusted embedded artwork on open", () => {
    const { embedded } = fixture();
    const library = embedded.embeddedLibrary!;
    const device = library.devices[0]!;
    const parsed = parseProjectText(
      serializeProject({
        ...embedded,
        embeddedLibrary: {
          ...library,
          devices: [
            {
              ...device,
              artwork: {
                ...device.artwork,
                body: '<rect fill="#000" href="https://example.com/x"/>',
              },
            },
          ],
        },
      }),
    );
    const body = parsed.embeddedLibrary?.devices[0]?.artwork.body ?? "";
    expect(body).toContain('fill="currentColor"');
    expect(body).not.toContain("href=");
    expect(body).not.toContain("https://example.com");
  });

  it("rejects executable embedded artwork", () => {
    const { embedded } = fixture();
    const library = embedded.embeddedLibrary!;
    const device = library.devices[0]!;
    expect(() =>
      parseProjectText(
        serializeProject({
          ...embedded,
          embeddedLibrary: {
            ...library,
            devices: [
              {
                ...device,
                artwork: {
                  ...device.artwork,
                  body: "<script>alert(1)</script>",
                },
              },
            ],
          },
        }),
      ),
    ).toThrow(/executable content/i);
  });

  it("is stable across repeated save and open", () => {
    const { embedded } = fixture();
    const first = parseProjectText(serializeProject(embedded));
    const second = parseProjectText(serializeProject(first));
    expect(second.embeddedLibrary).toEqual(first.embeddedLibrary);
    expect(second.pages).toEqual(first.pages);
  });
});
