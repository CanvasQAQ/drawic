import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const requiredPatterns = [
  /-.+-Unsigned-Preview-windows-x64-setup\.exe$/,
  /-.+-Unsigned-Preview-windows-x64-portable\.exe$/,
  /-.+-Unsigned-Preview-windows-x64\.zip$/,
  /-.+-Unsigned-Preview-macos-x64\.dmg$/,
  /-.+-Unsigned-Preview-macos-x64\.zip$/,
  /-.+-Unsigned-Preview-macos-arm64\.dmg$/,
  /-.+-Unsigned-Preview-macos-arm64\.zip$/,
  /-.+-Unsigned-Preview-linux-x64\.AppImage$/,
  /-.+-Unsigned-Preview-linux-x64\.deb$/,
  /-.+-Unsigned-Preview-linux-x64\.tar\.gz$/,
  /-source\.zip$/,
];

const sums = (await readFile(resolve("release/SHA256SUMS.txt"), "utf8"))
  .trim()
  .split("\n")
  .map((line) => line.slice(66));
await access(resolve("release/UNSIGNED-PREVIEW.txt"));

const missing = requiredPatterns.filter(
  (pattern) => !sums.some((file) => pattern.test(file)),
);
if (missing.length > 0) {
  console.error("Missing required release assets:");
  for (const pattern of missing) {
    console.error(`- ${pattern}`);
  }
  process.exit(1);
}
console.log(`Release asset manifest passed with ${sums.length} files.`);
