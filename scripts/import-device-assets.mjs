import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

const sourceRoot = process.env.DRAWIC_ASSET_SOURCE;
if (!sourceRoot) {
  throw new Error("Set DRAWIC_ASSET_SOURCE to the root of the approved device-symbol package.");
}

const source = resolve(sourceRoot);
const destination = resolve("src/renderer/assets/device-symbols");
const manifestPath = join(source, "manifest.json");
const original = JSON.parse(await readFile(manifestPath, "utf8"));

if (original.schemaVersion !== 1 || !Array.isArray(original.entries)) {
  throw new Error("Unsupported source device manifest.");
}

const sha256 = (data) => createHash("sha256").update(data).digest("hex");
const files = [];
const entries = [];
const allowedCategories = new Set();

await mkdir(join(destination, "svg"), { recursive: true });
await mkdir(join(destination, "svg", "variants"), { recursive: true });

for (const entry of original.entries) {
  if (
    typeof entry.id !== "string" ||
    typeof entry.category !== "string" ||
    typeof entry.primaryFile !== "string" ||
    !Array.isArray(entry.pins)
  ) {
    throw new Error(`Malformed source manifest entry: ${String(entry.id)}`);
  }

  allowedCategories.add(entry.category);
  const sourceFile = resolve(source, entry.primaryFile);
  const relativeFile = `svg/${entry.id}.svg`;
  const targetFile = resolve(destination, relativeFile);
  const svg = await readFile(sourceFile);
  await mkdir(dirname(targetFile), { recursive: true });
  await copyFile(sourceFile, targetFile);
  files.push({ path: relativeFile, sha256: sha256(svg), bytes: svg.byteLength });

  const variants = [];
  for (const variant of Array.isArray(entry.variants) ? entry.variants : []) {
    if (
      typeof variant.id !== "string" ||
      typeof variant.file !== "string" ||
      !variant.id.trim() ||
      !variant.file.trim()
    ) {
      throw new Error(`Malformed variant in source entry: ${entry.id}`);
    }
    const variantSource = resolve(source, variant.file);
    const expectedPrefix = `${join(source, "svg", "variants")}${process.platform === "win32" ? "\\" : "/"}`;
    if (!variantSource.startsWith(expectedPrefix)) {
      throw new Error(`Variant path escapes variants directory: ${variant.file}`);
    }
    const variantFile = `svg/variants/${basename(variant.file)}`;
    const variantTarget = resolve(destination, variantFile);
    const variantSvg = await readFile(variantSource);
    await mkdir(dirname(variantTarget), { recursive: true });
    await copyFile(variantSource, variantTarget);
    files.push({
      path: variantFile,
      sha256: sha256(variantSvg),
      bytes: variantSvg.byteLength,
    });
    variants.push({
      id: variant.id,
      file: variantFile.replace(/^svg\//, ""),
      default: Boolean(variant.default),
    });
  }

  entries.push({
    id: entry.id,
    label:
      typeof entry.name === "string" && entry.name.trim()
        ? entry.name
        : entry.id
            .split("-")
            .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
            .join(" "),
    category: entry.category,
    electrical: Boolean(entry.electricalDevice),
    palette: Boolean(entry.paletteEligible),
    frame: {
      x: Number(entry.viewBox?.x ?? 0),
      y: Number(entry.viewBox?.y ?? 0),
      width: Number(entry.viewBox?.width ?? 48),
      height: Number(entry.viewBox?.height ?? 48),
    },
    pins: entry.pins.map((pin) => ({
      key: String(pin.name),
      role: String(pin.role),
      side: String(pin.direction),
    })),
    file: relativeFile.replace(/^svg\//, ""),
    primaryVariant: String(entry.primaryVariant ?? "base"),
    variants,
  });
}

entries.sort((a, b) => a.id.localeCompare(b.id));
const outputManifest = {
  manifestVersion: 1,
  collection: "Drawic Device Symbols",
  sourceRevision: original.sourceCommit ?? original.sourceRevision ?? null,
  categories: [...allowedCategories].sort(),
  entries,
};
await writeFile(join(destination, "manifest.json"), `${JSON.stringify(outputManifest, null, 2)}\n`);

files.sort((a, b) => a.path.localeCompare(b.path));
const lock = {
  source: "analog-canvas-device-svg-20261024/device-svg-export",
  suppliedBy: "CanvasQAQ",
  suppliedOn: "2026-10-24",
  usageBasis: "User-supplied static artwork and pin metadata; authorized for Drawic releases by the repository owner.",
  copiedFonts: false,
  entryCount: entries.length,
  svgCount: files.length,
  files,
};
await writeFile(join(destination, "asset-lock.json"), `${JSON.stringify(lock, null, 2)}\n`);

console.log(`Imported ${entries.length} symbols and ${files.length} SVG appearances.`);
