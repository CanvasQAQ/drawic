// @vitest-environment node
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import packageJson from "../package.json";

describe("release packaging", () => {
  it("builds Windows, macOS x64/arm64, and Linux x64 packages", () => {
    expect(
      packageJson.build.win.target.map((target) => target.target),
    ).toEqual(["zip"]);
    expect(packageJson.build.win.target[0]?.arch).toEqual(["x64"]);
    expect(
      packageJson.build.mac.target.map((target) => target.target),
    ).toEqual(["dmg", "zip"]);
    for (const target of packageJson.build.mac.target) {
      expect(target.arch).toEqual(["x64", "arm64"]);
    }
    expect(
      packageJson.build.linux.target.map((target) => target.target),
    ).toEqual(["AppImage", "deb"]);
    for (const target of packageJson.build.linux.target) {
      expect(target.arch).toEqual(["x64"]);
    }
    expect(packageJson.build).not.toHaveProperty("nsis");
    expect(packageJson.build).not.toHaveProperty("portable");
    expect(packageJson.build.win.artifactName).toContain("Unsigned-Preview");
    expect(packageJson.build.mac.artifactName).toContain("macos-${arch}");
    expect(packageJson.build.linux.artifactName).toContain("linux-x64");
    expect(packageJson.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("publishes, verifies, and prunes the tagged cross-platform workflow", async () => {
    const workflow = await readFile(".github/workflows/release.yml", "utf8");
    const verifier = await readFile("scripts/verify-release-assets.mjs", "utf8");
    expect(workflow).toContain("--win zip --x64");
    expect(workflow).toContain("--mac dmg zip --x64 --arm64");
    expect(workflow).toContain("--linux AppImage deb --x64");
    expect(workflow).toContain("macos-latest");
    expect(workflow).toContain("-name 'Drawic-*-windows-x64.zip'");
    expect(workflow).toContain("node scripts/verify-release-assets.mjs");
    expect(workflow).toContain("node scripts/prune-github-releases.mjs");
    expect(workflow).not.toContain("source-package");
    expect(verifier).toContain("Unsigned-Preview-macos-arm64\\.zip");
    expect(verifier).toContain("Unsigned-Preview-linux-x64\\.AppImage");
  });

  it("accepts a release manifest containing all platform packages", async () => {
    const directory = await mkdtemp(join(tmpdir(), "drawic-release-"));
    try {
      await mkdir(join(directory, "release"));
      const names = [
        "Drawic-0.3.0-Unsigned-Preview-windows-x64.zip",
        "Drawic-0.3.0-Unsigned-Preview-macos-x64.dmg",
        "Drawic-0.3.0-Unsigned-Preview-macos-arm64.dmg",
        "Drawic-0.3.0-Unsigned-Preview-macos-x64.zip",
        "Drawic-0.3.0-Unsigned-Preview-macos-arm64.zip",
        "Drawic-0.3.0-Unsigned-Preview-linux-x64.AppImage",
        "Drawic-0.3.0-Unsigned-Preview-linux-x64.deb",
      ];
      for (const name of names) {
        await writeFile(join(directory, "release", name), `test ${name}`);
      }
      await writeFile(join(directory, "release", "UNSIGNED-RELEASE.txt"), "unsigned");
      const checksums = spawnSync(
        process.execPath,
        [resolve("scripts/generate-checksums.mjs")],
        { cwd: directory, encoding: "utf8" },
      );
      expect(checksums.status, checksums.stderr).toBe(0);
      const verification = spawnSync(
        process.execPath,
        [resolve("scripts/verify-release-assets.mjs")],
        { cwd: directory, encoding: "utf8" },
      );
      expect(verification.status, verification.stderr).toBe(0);
      expect(verification.stdout).toContain("platform packages");
      await writeFile(
        join(directory, "release", "Drawic-0.3.0-Unsigned-Preview-windows-x64-setup.exe"),
        "unexpected installer",
      );
      spawnSync(process.execPath, [resolve("scripts/generate-checksums.mjs")], {
        cwd: directory,
        encoding: "utf8",
      });
      const rejected = spawnSync(
        process.execPath,
        [resolve("scripts/verify-release-assets.mjs")],
        { cwd: directory, encoding: "utf8" },
      );
      expect(rejected.status).toBe(1);
      expect(rejected.stderr).toContain(
        "Windows x64, macOS x64/arm64, and Linux x64",
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
