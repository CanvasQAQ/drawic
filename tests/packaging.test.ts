// @vitest-environment node
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import packageJson from "../package.json";

describe("release packaging", () => {
  it("builds NSIS, portable, and ZIP artifacts for Windows x64", () => {
    const targets = packageJson.build.win.target;
    expect(targets.map((target) => target.target)).toEqual([
      "nsis",
      "portable",
      "zip",
    ]);
    for (const target of targets) {
      expect(target.arch).toEqual(["x64"]);
    }
    expect(packageJson.build.win.artifactName).toContain("Unsigned-Preview");
    expect(packageJson.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("uploads the Windows ZIP in the tagged release workflow", async () => {
    const workflow = await readFile(".github/workflows/release.yml", "utf8");
    const verifier = await readFile("scripts/verify-release-assets.mjs", "utf8");
    expect(workflow).toContain("--win nsis portable zip --x64");
    expect(workflow).toContain("-name '*.exe' -o -name '*.zip'");
    expect(workflow).toContain("node scripts/verify-release-assets.mjs");
    expect(verifier).toContain("Unsigned-Preview-windows-x64\\.zip");
  });
});
