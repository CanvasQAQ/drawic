// @vitest-environment node
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import packageJson from "../package.json";

describe("release packaging", () => {
  it("builds only the Windows x64 ZIP while the release profile is being stabilized", () => {
    const targets = packageJson.build.win.target;
    expect(targets.map((target) => target.target)).toEqual(["zip"]);
    for (const target of targets) {
      expect(target.arch).toEqual(["x64"]);
    }
    expect(packageJson.build).not.toHaveProperty("mac");
    expect(packageJson.build).not.toHaveProperty("linux");
    expect(packageJson.build).not.toHaveProperty("nsis");
    expect(packageJson.build).not.toHaveProperty("portable");
    expect(packageJson.build.win.artifactName).toContain("Unsigned-Preview");
    expect(packageJson.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("publishes, verifies, and prunes the tagged Windows ZIP workflow", async () => {
    const workflow = await readFile(".github/workflows/release.yml", "utf8");
    const verifier = await readFile("scripts/verify-release-assets.mjs", "utf8");
    expect(workflow).toContain("--win zip --x64");
    expect(workflow).toContain("-name '*.zip'");
    expect(workflow).toContain("node scripts/verify-release-assets.mjs");
    expect(workflow).toContain("node scripts/prune-github-releases.mjs");
    expect(workflow).not.toContain("--linux");
    expect(workflow).not.toContain("--mac");
    expect(workflow).not.toContain("source-package");
    expect(verifier).toContain("Unsigned-Preview-windows-x64\\.zip");
  });

  it("accepts a release manifest containing exactly one Windows ZIP", async () => {
    const directory = await mkdtemp(join(tmpdir(), "drawic-release-"));
    try {
      await mkdir(join(directory, "release"));
      await writeFile(
        join(directory, "release", "Drawic-0.2.1-Unsigned-Preview-windows-x64.zip"),
        "test archive",
      );
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
      expect(verification.stdout).toContain("Windows package");
      await writeFile(
        join(directory, "release", "Drawic-0.2.1-Unsigned-Preview-windows-x64-setup.exe"),
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
      expect(rejected.stderr).toContain("exactly one Windows x64 ZIP");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
