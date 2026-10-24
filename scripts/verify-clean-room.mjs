import { createHash } from "node:crypto";
import { access, readFile, readdir } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";

const requiredFiles = [
  "CLEAN_ROOM.md",
  "PROVENANCE.md",
  "THIRD_PARTY_NOTICES.md",
  "LICENSE",
  "src/renderer/assets/device-symbols/manifest.json",
  "src/renderer/assets/device-symbols/asset-lock.json",
  "src/renderer/assets/device-libraries/drawic-built-in.drawiclib.json",
];
for (const file of requiredFiles) {
  await access(resolve(file));
}

const excludedSourceMarkers = [
  /cascode[-_ ]?ai/i,
  /analog[-_ ]?canvas/i,
  /schematic[-_ ]?draft/i,
  /LXY-freshman/i,
  /\/srv\/workspaces\/drawic/i,
];
const sourceExtensions = new Set([".ts", ".tsx", ".css", ".html", ".json"]);
const failures = [];

async function visit(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "assets") {
        await visit(path);
      }
      continue;
    }
    if (!sourceExtensions.has(extname(entry.name))) {
      continue;
    }
    const text = await readFile(path, "utf8");
    for (const marker of excludedSourceMarkers) {
      if (marker.test(text)) {
        failures.push(`${relative(".", path)} contains excluded source marker ${marker}`);
      }
    }
  }
}
await visit(resolve("src"));
await visit(resolve("scripts"));

const lock = JSON.parse(
  await readFile(resolve("src/renderer/assets/device-symbols/asset-lock.json"), "utf8"),
);
for (const file of lock.files) {
  const bytes = await readFile(resolve("src/renderer/assets/device-symbols", file.path));
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (digest !== file.sha256) {
    failures.push(`Asset hash mismatch: ${file.path}`);
  }
}

if (lock.copiedFonts !== false) {
  failures.push("The approved asset import must not copy fonts.");
}
if (
  lock.files.length !== lock.svgCount ||
  lock.svgCount < lock.entryCount
) {
  failures.push(
    `Asset ledger is incomplete: ${lock.files.length} locked files for ${lock.svgCount} declared appearances.`,
  );
}

const runtimeLibrary = JSON.parse(
  await readFile(
    resolve("src/renderer/assets/device-libraries/drawic-built-in.drawiclib.json"),
    "utf8",
  ),
);
if (runtimeLibrary.format !== "drawic-device-library" || runtimeLibrary.schemaVersion !== 1) {
  failures.push("Generated device library has an unexpected format or schema.");
}
if (
  !Array.isArray(runtimeLibrary.devices) ||
  runtimeLibrary.devices.length < lock.entryCount
) {
  failures.push("Generated device library is missing primary device records.");
}
if (
  runtimeLibrary.devices?.some(
    (device) =>
      /<script\b|foreignObject|\son[a-z]+\s*=|https?:\/\//i.test(device.artwork?.body ?? ""),
  )
) {
  failures.push("Generated device library contains active or external SVG content.");
}

if (failures.length > 0) {
  console.error("Clean-room audit failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(
  `Clean-room audit passed: ${lock.files.length} approved SVG hashes, one ${runtimeLibrary.devices.length}-appearance library, and no excluded source markers found.`,
);
