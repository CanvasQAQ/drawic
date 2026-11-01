// @vitest-environment node
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  DEVICE_LIBRARY_FORMAT,
  deviceLibraryToMxLibrary,
  loadDeviceLibrary,
  parseDeviceLibrary,
  parseMxLibraryTitles,
  serializeDeviceLibraryFile,
  type DeviceLibraryRecord,
} from "../src/core/library";
import { buildDeviceLibraryFile } from "../src/core/deviceLibraryRegistry";
import {
  NAME_BASE_FONT_SIZE,
  layoutNodeLabels,
} from "../src/core/labels";
import { symbolLabelPosition } from "../src/core/geometry";
import { createEmptyPage } from "../src/core/model";

async function readBuiltInLibrary() {
  const text = await readFile(
    new URL(
      "../src/renderer/assets/device-libraries/drawic-built-in.drawiclib.json",
      import.meta.url,
    ),
    "utf8",
  );
  return parseDeviceLibrary(JSON.parse(text));
}

describe("single-file device library", () => {
  it("contains every approved primary device and alternate appearance", async () => {
    const library = await readBuiltInLibrary();
    expect(library.format).toBe(DEVICE_LIBRARY_FORMAT);
    expect(library.id).toBe("drawic-built-in");
    expect(library.source.entryCount).toBe(109);
    expect(library.devices).toHaveLength(120);
    expect(new Set(library.devices.map((device) => device.id)).size).toBe(120);
    expect(library.devices.every((device) => device.artwork.body.includes("<"))).toBe(
      true,
    );
  });

  it("stores exact normalized pin positions and decorative label anchors", async () => {
    const library = loadDeviceLibrary(await readBuiltInLibrary());
    const resistor = library.byId.get("resistor");
    expect(resistor?.pins.map((pin) => [pin.key, pin.x, pin.y])).toEqual([
      ["1", 0, -20],
      ["2", 0, 20],
    ]);
    expect(resistor?.labelAnchors.reference.x).toBeGreaterThan(
      (resistor?.frame.width ?? 0) / 2,
    );
    expect(resistor?.labelAnchors.value.y).toBeGreaterThan(
      resistor?.labelAnchors.reference.y ?? 0,
    );
  });

  it("stores visible-ink selection boxes independently from placement frames", async () => {
    const library = await readBuiltInLibrary();
    const ground = library.devices.find((device) => device.id === "ground");
    const resistor = library.devices.find((device) => device.id === "resistor");
    expect(ground?.selectionBox).toBeDefined();
    expect(resistor?.selectionBox).toBeDefined();
    expect(ground!.selectionBox!.width).toBeLessThan(ground!.frame.width);
    expect(resistor!.selectionBox!.height).toBeLessThan(resistor!.frame.height);
    expect(
      library.devices.filter(
        (device) =>
          device.selectionBox &&
          (device.selectionBox.width < device.frame.width - 1 ||
            device.selectionBox.height < device.frame.height - 1),
      ).length,
    ).toBeGreaterThan(100);
    for (const device of library.devices) {
      const box = device.selectionBox ?? device.frame;
      const centerX = device.frame.x + device.frame.width / 2;
      const centerY = device.frame.y + device.frame.height / 2;
      for (const pin of device.pins) {
        expect(centerX + pin.x).toBeGreaterThanOrEqual(box.x - 0.001);
        expect(centerX + pin.x).toBeLessThanOrEqual(box.x + box.width + 0.001);
        expect(centerY + pin.y).toBeGreaterThanOrEqual(box.y - 0.001);
        expect(centerY + pin.y).toBeLessThanOrEqual(box.y + box.height + 0.001);
      }
    }
  });

  it("stores unpadded ink bounds for the accepted NMOS and Resistor label samples", async () => {
    const library = loadDeviceLibrary(await readBuiltInLibrary());
    const nmos = library.byId.get("nmos")!;
    const resistor = library.byId.get("resistor")!;
    expect(nmos.labelBounds).toEqual({
      x: -20,
      y: -20,
      width: 30.581395,
      height: 40,
    });
    expect(resistor.labelBounds).toEqual({
      x: -4.988372,
      y: -20,
      width: 10.360465,
      height: 40,
    });

    const page = createEmptyPage("Built-in labels");
    const nmosNode = {
      id: "m1",
      symbolId: "nmos",
      reference: "M1",
      value: "NMOS",
      x: 100,
      y: 100,
      rotation: 0 as const,
      mirrored: false,
    };
    const nmosLayout = layoutNodeLabels(nmosNode, nmos, page, {
      showValue: false,
    });
    expect(
      symbolLabelPosition({ ...nmosNode, labelLayout: nmosLayout }, nmos, "reference"),
    ).toEqual({
      point: { x: 115, y: Math.round(100 + NAME_BASE_FONT_SIZE * 0.72 / 2) },
      anchor: "start",
    });
  });

  it("keeps the bundled three-terminal MOS symbols free of bulk pins", async () => {
    const library = await readBuiltInLibrary();
    const mosIds = [
      "nmos",
      "pmos",
      "depletion-nmos",
      "depletion-pmos",
      "ndmos",
      "pdmos",
    ];
    for (const id of mosIds) {
      const device = library.devices.find((candidate) => candidate.id === id);
      expect(device?.pins.map((pin) => pin.key)).toEqual(["D", "G", "S"]);
      expect(device?.pins.some((pin) => pin.role === "bulk")).toBe(false);
      const contactPoints = device!.pins.map((pin) => `${pin.x}:${pin.y}`);
      expect(new Set(contactPoints).size).toBe(contactPoints.length);
    }
    for (const id of mosIds) {
      const base = library.devices.find((candidate) => candidate.id === `${id}--base`);
      expect(base?.variantOf).toBe(id);
      expect(base?.variantId).toBe("base");
      expect(base?.pins.map((pin) => pin.key)).toEqual(["D", "G", "S", "B"]);
      expect(base?.pins.find((pin) => pin.key === "B")?.direction).toBe("east");
    }
  });

  it("never assigns two pins of one device to the same contact point", async () => {
    const library = await readBuiltInLibrary();
    for (const device of library.devices) {
      const contactPoints = device.pins.map((pin) => `${pin.x}:${pin.y}`);
      expect(
        new Set(contactPoints).size,
        `${device.id} contains overlapping pin contact points`,
      ).toBe(contactPoints.length);
    }
  });

  it("preserves source variants and builds the 4-terminal MOS appearances", async () => {
    const sourceRoot = new URL("../src/renderer/assets/device-symbols/", import.meta.url);
    const manifest = JSON.parse(
      await readFile(new URL("manifest.json", sourceRoot), "utf8"),
    ) as {
      entries: Array<{
        id: string;
        file: string;
        primaryVariant: string;
        pins: Array<{ key: string; role: string }>;
        variants: Array<{ id: string; file: string; default: boolean }>;
      }>;
    };
    const mosIds = new Set([
      "nmos",
      "pmos",
      "depletion-nmos",
      "depletion-pmos",
      "ndmos",
      "pdmos",
    ]);
    let baseVariants = 0;
    for (const entry of manifest.entries) {
      for (const variant of entry.variants) {
        await readFile(new URL(`svg/${variant.file}`, sourceRoot), "utf8");
      }
      if (!mosIds.has(entry.id)) {
        continue;
      }
      const markup = await readFile(new URL(`svg/${entry.file}`, sourceRoot), "utf8");
      const variant = markup.match(/\bdata-variant\s*=\s*["']([^"']+)["']/i)?.[1];
      expect(variant).toMatch(/-3terminal$/);
      expect(entry.primaryVariant).toBe(variant);
      expect(entry.pins.some((pin) => pin.role === "bulk")).toBe(true);
      expect(entry.variants).toContainEqual(
        expect.objectContaining({ id: "base", default: false }),
      );
      baseVariants += 1;
    }
    expect(baseVariants).toBe(6);
  });

  it("ships sanitized themeable artwork without executable or fixed dark content", async () => {
    const library = await readBuiltInLibrary();
    for (const device of library.devices) {
      expect(device.artwork.body).not.toMatch(/<script\b|foreignObject|\son[a-z]+=/i);
      expect(device.artwork.body).not.toMatch(/(?:fill|stroke)=["'](?:black|#000000?)["']/i);
      expect(device.artwork.body).not.toMatch(/https?:\/\//i);
    }
  });

  it("rejects duplicate ids and unsupported versions", async () => {
    const library = await readBuiltInLibrary();
    expect(() =>
      parseDeviceLibrary({
        ...library,
        devices: [library.devices[0]!, library.devices[0]!],
      }),
    ).toThrow(/Duplicate device id/);
    expect(() => parseDeviceLibrary({ ...library, schemaVersion: 999 })).toThrow(
      /version is not supported/,
    );
  });

  it("converts the single-file library to a draw.io mxlibrary interchange", async () => {
    const library = await readBuiltInLibrary();
    const mxLibrary = deviceLibraryToMxLibrary(library);
    expect(parseMxLibraryTitles(mxLibrary)).toHaveLength(120);
    expect(mxLibrary).toContain('"title": "Resistor"');
    expect(mxLibrary).toContain("data:image/svg+xml;base64,");
  });
});

describe("editable device artwork in library schema version 2", () => {
  function recordWithShapes(
    shapes: DeviceLibraryRecord["artwork"]["shapes"] = [
      { id: "shape-1", kind: "circle", cx: 0, cy: 0, r: 6 },
    ],
  ): DeviceLibraryRecord {
    return {
      id: "custom-a",
      title: "Custom A",
      category: "custom",
      keywords: [],
      electrical: true,
      palette: true,
      frame: { x: -10, y: -10, width: 20, height: 20 },
      artwork: {
        type: "svg",
        viewBox: "-10 -10 20 20",
        body: "",
        shapes,
        source: "custom.svg",
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
      metadata: { sourceCollection: "user", sourceRevision: null },
    };
  }

  it("regenerates the rendered body from shapes and ignores a tampered body", () => {
    const library = buildDeviceLibraryFile({
      id: "drawic-user",
      title: "Custom devices",
      collection: "user",
      devices: [recordWithShapes()],
    });
    expect(library.schemaVersion).toBe(2);
    const raw = JSON.parse(serializeDeviceLibraryFile(library)) as {
      schemaVersion: number;
      devices: DeviceLibraryRecord[];
    };
    raw.devices[0]!.artwork.body = '<rect x="0" y="0" width="1" height="1"/>';

    const parsed = parseDeviceLibrary(raw, { sanitize: true });
    expect(parsed.schemaVersion).toBe(2);
    expect(parsed.devices[0]!.artwork.shapes).toHaveLength(1);
    expect(parsed.devices[0]!.artwork.body).toContain("<circle");
    expect(parsed.devices[0]!.artwork.body).not.toContain("<rect");
  });

  it("retains SVG source and editable shapes together across library parsing", () => {
    const original = recordWithShapes();
    const baseBody = '<path d="M -10 0 L 10 0" stroke="currentColor"/>';
    original.artwork.baseBody = baseBody;
    original.artwork.body = baseBody + original.artwork.body;
    const library = buildDeviceLibraryFile({
      id: "drawic-user", title: "Custom devices", collection: "user", devices: [original],
    });
    const parsed = parseDeviceLibrary(JSON.parse(serializeDeviceLibraryFile(library)), { sanitize: true });
    expect(parsed.devices[0]!.artwork.baseBody).toContain("<path");
    expect(parsed.devices[0]!.artwork.shapes).toHaveLength(1);
    expect(parsed.devices[0]!.artwork.body).toContain("<path");
    expect(parsed.devices[0]!.artwork.body).toContain("<circle");
  });

  it("escapes text primitives instead of emitting markup", () => {
    const library = buildDeviceLibraryFile({
      id: "drawic-user",
      title: "Custom devices",
      collection: "user",
      devices: [
        recordWithShapes([
          {
            id: "shape-1",
            kind: "text",
            x: 0,
            y: 0,
            text: "<script>alert(1)</script>",
          },
        ]),
      ],
    });
    const parsed = parseDeviceLibrary(
      JSON.parse(serializeDeviceLibraryFile(library)),
      { sanitize: true },
    );
    const body = parsed.devices[0]!.artwork.body;
    expect(body).toContain("&lt;script&gt;");
    expect(body).not.toMatch(/<script\b/i);
  });

  it("still accepts version 1 libraries with an opaque body", () => {
    const versionOne = {
      format: DEVICE_LIBRARY_FORMAT,
      schemaVersion: 1,
      id: "drawic-user",
      title: "Custom devices",
      revision: "legacy",
      source: { collection: "user", manifestVersion: 1, entryCount: 1 },
      devices: [
        {
          ...recordWithShapes(),
          artwork: {
            type: "svg",
            viewBox: "-10 -10 20 20",
            body: '<rect x="-4" y="-4" width="8" height="8" fill="#000"/>',
            source: "custom.svg",
            sourceSha256: "0",
          },
        },
      ],
    };
    const parsed = parseDeviceLibrary(versionOne, { sanitize: true });
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.devices[0]!.artwork.shapes).toBeUndefined();
    expect(parsed.devices[0]!.artwork.body).toContain('fill="currentColor"');
  });
});
