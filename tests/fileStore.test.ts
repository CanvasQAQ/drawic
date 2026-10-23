// @vitest-environment node
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { atomicWriteFile, isDrawicProjectPath } from "../src/main/fileStore";

const directories: string[] = [];

afterEach(async () => {
  for (const directory of directories.splice(0)) {
    await rm(directory, { recursive: true, force: true });
  }
});

describe("atomic local project files", () => {
  it("writes complete content and leaves no temporary sibling", async () => {
    const directory = await mkdtemp(join(tmpdir(), "drawic-file-test-"));
    directories.push(directory);
    const file = join(directory, "roundtrip.drawic.json");
    const content = '{"schemaVersion":2,"kind":"drawic-drawing","pages":[]}\n';
    await atomicWriteFile(file, content);
    expect(await readFile(file, "utf8")).toBe(content);
    expect(await readdir(directory)).toEqual(["roundtrip.drawic.json"]);
    expect(isDrawicProjectPath(file)).toBe(true);
    expect(isDrawicProjectPath(join(directory, "wrong.json"))).toBe(false);
  });

  it("replaces an existing project file in one rename operation", async () => {
    const directory = await mkdtemp(join(tmpdir(), "drawic-file-test-"));
    directories.push(directory);
    const file = join(directory, "replace.drawic.json");
    await atomicWriteFile(file, "first");
    await atomicWriteFile(file, "second");
    expect(await readFile(file, "utf8")).toBe("second");
  });
});
