import { build } from "esbuild";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const result = await build({
  entryPoints: ["src/agent/stdio.mjs"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  outfile: "dist/agent/stdio.cjs",
  metafile: true,
});

const packages = new Set();
for (const input of Object.keys(result.metafile.inputs)) {
  const match = input.match(/^(.*node_modules\/(?:@[^/]+\/)?[^/]+)/);
  if (match) packages.add(match[1]);
}
const notices = [];
for (const directory of [...packages].sort()) {
  const files = (await readdir(directory)).filter(name => /^(licen[cs]e|notice)(\.|$)/i.test(name));
  for (const file of files) notices.push(directory + "\n" + await readFile(resolve(directory,file),"utf8"));
}
await writeFile("dist/agent/NOTICES.txt", notices.join("\n\n"));
