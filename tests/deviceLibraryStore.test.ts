// @vitest-environment node
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  parseDeviceLibrary,
  serializeDeviceLibraryFile,
  type DeviceLibraryRecord,
} from "../src/core/library";
import { buildDeviceLibraryFile } from "../src/core/deviceLibraryRegistry";
import {
  importDeviceLibraryFile,
  loadUserDeviceLibrary,
  normalizeDeviceLibraryText,
  saveUserDeviceLibrary,
  userDeviceLibraryPath,
} from "../src/main/deviceLibraryStore";

function record(body: string): DeviceLibraryRecord {
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
      viewBox: "0 0 20 20",
      body,
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
}

function libraryText(body = '<rect fill="#000" href="https://example.com/x"/>') {
  return serializeDeviceLibraryFile(
    buildDeviceLibraryFile({
      id: "drawic-user",
      title: "Custom devices",
      collection: "user",
      devices: [record(body)],
    }),
  );
}

describe("user device library storage", () => {
  let directory = "";

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "drawic-library-test-"));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("normalizes and sanitizes imported library text", () => {
    const normalized = normalizeDeviceLibraryText(libraryText());
    expect(normalized.endsWith("\n")).toBe(true);
    const body = parseDeviceLibrary(JSON.parse(normalized)).devices[0]!.artwork.body;
    expect(body).toBe('<rect fill="currentColor"/>');
    expect(normalized).not.toContain("href=");
    expect(normalized).not.toContain("https://example.com");
  });

  it("rejects malformed or executable libraries", () => {
    expect(() => normalizeDeviceLibraryText("{")).toThrow(/valid JSON/i);
    expect(() =>
      normalizeDeviceLibraryText(
        libraryText('<rect fill="#000"/><script>alert(1)</script>'),
      ),
    ).toThrow(/executable content/i);
    expect(() =>
      normalizeDeviceLibraryText(
        JSON.stringify({ format: "other", schemaVersion: 1, devices: [] }),
      ),
    ).toThrow(/not a Drawic device library/i);
  });

  it("round-trips the user library through the managed location", async () => {
    const path = userDeviceLibraryPath(join(directory, "userData"));
    expect(path.endsWith(join("device-libraries", "user.drawiclib.json"))).toBe(
      true,
    );
    expect(await loadUserDeviceLibrary(path)).toBeNull();

    await saveUserDeviceLibrary(path, libraryText());
    const loaded = await loadUserDeviceLibrary(path);
    expect(loaded).toBe(normalizeDeviceLibraryText(libraryText()));
  });

  it("imports a library file and rejects directories", async () => {
    const file = join(directory, "shared.drawiclib.json");
    await writeFile(file, libraryText(), "utf8");
    expect(await importDeviceLibraryFile(file)).toBe(
      normalizeDeviceLibraryText(libraryText()),
    );

    const folder = join(directory, "folder");
    await mkdir(folder);
    await expect(importDeviceLibraryFile(folder)).rejects.toThrow(
      /not a regular file/i,
    );
  });

  it("refuses a missing path on import", async () => {
    await expect(
      importDeviceLibraryFile(join(directory, "missing.drawiclib.json")),
    ).rejects.toThrow(/not a regular file/i);
  });
});
