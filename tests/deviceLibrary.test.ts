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
  it("contains every approved primary device in one self-contained file", async () => {
    const library = await readBuiltInLibrary();
    expect(library.format).toBe(DEVICE_LIBRARY_FORMAT);
    expect(library.id).toBe("drawic-built-in");
    expect(library.devices).toHaveLength(109);
    expect(new Set(library.devices.map((device) => device.id)).size).toBe(109);
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
    expect(parseMxLibraryTitles(mxLibrary)).toHaveLength(109);
    expect(mxLibrary).toContain('"title": "Resistor"');
    expect(mxLibrary).toContain("data:image/svg+xml;base64,");
  });
});
