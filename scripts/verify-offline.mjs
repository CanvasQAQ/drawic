import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";

const root = resolve("src");
const runtimeExtensions = new Set([".ts", ".tsx", ".css", ".html"]);
const allowedPatterns = new Set([
  "http://*/*",
  "https://*/*",
  "ws://*/*",
  "wss://*/*",
  "http://www.w3.org/2000/svg",
]);
const failures = [];

async function visit(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === "assets") {
      continue;
    }
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await visit(path);
      continue;
    }
    if (!runtimeExtensions.has(extname(entry.name))) {
      continue;
    }
    const text = await readFile(path, "utf8");
    const sourceName = relative(root, path);
    if (/XMLHttpRequest|new\s+WebSocket|EventSource|axios\.|node-fetch|from\s+["'](?:http|axios|ws)/i.test(text)) {
      failures.push(`${sourceName}: runtime network client detected`);
    }
    for (const match of text.matchAll(/\b(?:https?|wss?):\/\/[^\s"'`)]*/g)) {
      if (!allowedPatterns.has(match[0])) {
        failures.push(`${sourceName}: undeclared endpoint ${match[0]}`);
      }
    }
    for (const match of text.matchAll(/\bfetch\s*\(/g)) {
      failures.push(`${sourceName}: renderer fetch() is not allowed in Drawic runtime code`);
    }
  }
}

await visit(root);

const html = await readFile(resolve("src/renderer/index.html"), "utf8");
if (!html.includes("connect-src 'none'")) {
  failures.push("Renderer CSP must set connect-src 'none'.");
}
if (/node:(?:fs|path|child_process|net|http)/.test(
  await readFile(resolve("src/renderer/App.tsx"), "utf8"),
)) {
  failures.push("Renderer source imports Node.js capabilities.");
}
const main = await readFile(resolve("src/main/main.ts"), "utf8");
if (!main.includes("webRequest.onBeforeRequest") || !main.includes("callback({ cancel: true })")) {
  failures.push("Main process must cancel all HTTP(S) and WebSocket requests.");
}

if (failures.length > 0) {
  console.error("Offline audit failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Offline audit passed: no runtime network clients or remote resources found.");
