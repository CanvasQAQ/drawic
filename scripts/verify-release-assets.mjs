import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const sums = (await readFile(resolve("release/SHA256SUMS.txt"), "utf8"))
  .trim()
  .split("\n")
  .filter(Boolean)
  .map((line) => {
    const match = /^([a-f0-9]{64})  (.+)$/.exec(line);
    if (!match) {
      throw new Error(`Invalid checksum line: ${line}`);
    }
    return { digest: match[1], name: match[2] };
  });

await access(resolve("release/UNSIGNED-RELEASE.txt"));

const expectedNames = [
  /^Drawic-.+-Unsigned-Preview-windows-x64\.zip$/,
  /^Drawic-.+-Unsigned-Preview-macos-x64\.dmg$/,
  /^Drawic-.+-Unsigned-Preview-macos-arm64\.dmg$/,
  /^Drawic-.+-Unsigned-Preview-macos-x64\.zip$/,
  /^Drawic-.+-Unsigned-Preview-macos-arm64\.zip$/,
  /^Drawic-.+-Unsigned-Preview-linux-x64\.AppImage$/,
  /^Drawic-.+-Unsigned-Preview-linux-x64\.deb$/,
];
const names = sums.map((entry) => entry.name);
const matchesExpected =
  names.length === expectedNames.length &&
  expectedNames.every((pattern) =>
    names.some((name) => pattern.test(name)),
  );
if (!matchesExpected) {
  console.error(
    "The release profile must contain Windows x64, macOS x64/arm64, and Linux x64 packages.",
  );
  console.error(`Checksummed files: ${sums.map((entry) => entry.name).join(", ") || "none"}`);
  process.exit(1);
}

console.log(`Release asset manifest passed with ${sums.length} platform packages.`);
