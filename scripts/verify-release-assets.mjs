import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const expectedPackage = /-.+-Unsigned-Preview-windows-x64\.zip$/;
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
if (sums.length !== 1 || !expectedPackage.test(sums[0]?.name ?? "")) {
  console.error("The temporary release profile must contain exactly one Windows x64 ZIP.");
  console.error(`Checksummed files: ${sums.map((entry) => entry.name).join(", ") || "none"}`);
  process.exit(1);
}

console.log(`Release asset manifest passed with ${sums.length} Windows package.`);
