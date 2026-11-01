import { stat, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  parseDeviceLibrary,
  serializeDeviceLibraryFile,
} from "../core/library";
import { atomicWriteFile } from "./fileStore";

export const MAX_DEVICE_LIBRARY_BYTES = 10 * 1024 * 1024;
export const USER_DEVICE_LIBRARY_FILE = "user.drawiclib.json";

export function userDeviceLibraryPath(userDataPath: string): string {
  return join(userDataPath, "device-libraries", USER_DEVICE_LIBRARY_FILE);
}

export function normalizeDeviceLibraryText(content: string): string {
  if (new TextEncoder().encode(content).byteLength > MAX_DEVICE_LIBRARY_BYTES) {
    throw new Error("Device libraries over 10 MB are not accepted.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("This file is not valid JSON.");
  }
  const library = parseDeviceLibrary(parsed, { sanitize: true });
  return serializeDeviceLibraryFile(library);
}

async function readDeviceLibraryText(path: string): Promise<string | null> {
  let details;
  try {
    details = await stat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
  if (!details.isFile()) {
    return null;
  }
  if (details.size > MAX_DEVICE_LIBRARY_BYTES) {
    throw new Error("Device libraries over 10 MB are not accepted.");
  }
  return readFile(path, "utf8");
}

export async function loadUserDeviceLibrary(
  path: string,
): Promise<string | null> {
  const content = await readDeviceLibraryText(path);
  return content === null ? null : normalizeDeviceLibraryText(content);
}

export async function saveUserDeviceLibrary(
  path: string,
  content: string,
): Promise<void> {
  await atomicWriteFile(path, normalizeDeviceLibraryText(content));
}

export async function importDeviceLibraryFile(
  path: string,
): Promise<string> {
  const content = await readDeviceLibraryText(path);
  if (content === null) {
    throw new Error("The selected device library is not a regular file.");
  }
  return normalizeDeviceLibraryText(content);
}
