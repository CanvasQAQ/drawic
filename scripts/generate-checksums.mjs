import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const releaseDirectory = resolve("release");
const files = (await readdir(releaseDirectory, { withFileTypes: true }))
  .filter(
    (entry) =>
      entry.isFile() &&
      !entry.name.startsWith("builder-") &&
      entry.name !== "SHA256SUMS.txt" &&
      entry.name !== "UNSIGNED-PREVIEW.txt" &&
      entry.name !== "UNSIGNED-RELEASE.txt",
  )
  .map((entry) => entry.name)
  .sort();

if (files.length === 0) {
  throw new Error("No release files were found.");
}

const hashFile = async (file) => {
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(join(releaseDirectory, file))) {
    digest.update(chunk);
  }
  return digest.digest("hex");
};

const lines = [];
for (const file of files) {
  lines.push(`${await hashFile(file)}  ${file}`);
}
await writeFile(join(releaseDirectory, "SHA256SUMS.txt"), `${lines.join("\n")}\n`);
console.log(`Wrote hashes for ${files.length} release files.`);
