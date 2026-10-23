import { createHash } from "node:crypto";
// @vitest-environment node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import lock from "../src/renderer/assets/device-symbols/asset-lock.json";
import manifest from "../src/renderer/assets/device-symbols/manifest.json";

describe("approved device asset ledger", () => {
  it("contains a complete palette catalog", () => {
    expect(manifest.entries.length).toBe(109);
    expect(manifest.entries.filter((entry) => entry.palette).length).toBeGreaterThan(30);
  });

  it("matches every recorded SHA-256", async () => {
    expect(lock.files).toHaveLength(109);
    for (const file of lock.files) {
      const bytes = await readFile(
        resolve("src/renderer/assets/device-symbols", file.path),
      );
      expect(createHash("sha256").update(bytes).digest("hex"), file.path).toBe(file.sha256);
    }
  });
});
