import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { access, mkdir, open, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";

const MAX_PROJECT_BYTES = 50 * 1024 * 1024;

export async function atomicWriteFile(path: string, data: string | Uint8Array): Promise<void> {
  const target = resolve(path);
  await mkdir(dirname(target), { recursive: true });
  const temporary = join(
    dirname(target),
    `.${process.pid}-${randomUUID()}.${extname(target).replace(/^\./, "") || "tmp"}.tmp`,
  );
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(data);
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rename(temporary, target);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}

export async function readProjectFile(path: string): Promise<string> {
  const details = await stat(path);
  if (!details.isFile()) {
    throw new Error("Selected project path is not a regular file.");
  }
  if (details.size > MAX_PROJECT_BYTES) {
    throw new Error("Project exceeds the 50 MB safety limit.");
  }
  return readFile(path, "utf8");
}

export async function readOptionalJson<T>(path: string, fallback: T): Promise<T> {
  try {
    await access(path, constants.R_OK);
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return fallback;
  }
}

export async function writeJson(path: string, value: unknown): Promise<void> {
  await atomicWriteFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

export function addProjectExtension(filePath: string): string {
  return filePath.toLowerCase().endsWith(".drawic.json") ? filePath : `${filePath}.drawic.json`;
}

export function isDrawicProjectPath(filePath: string): boolean {
  return filePath.toLowerCase().endsWith(".drawic.json");
}
