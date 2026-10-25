// @vitest-environment node
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  DEVICE_LIBRARY_FORMAT,
  deviceLibraryToMxLibrary,
  loadDeviceLibrary,
  parseMxLibraryTitles,
  parseDeviceLibrary,
} from "../src/core/library";
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
