import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const documents = [
  "AGENTS.md",
  "README.md",
  "CLEAN_ROOM.md",
  "PROVENANCE.md",
  "docs/AGENT_WORKFLOW.md",
  "docs/BRAND_ASSETS.md",
  "docs/COMPONENT_NAME_LABELS.md",
  "docs/DEVICE_PIN_AUDIT.md",
  "docs/adr/005-pages-and-single-file-device-library.md",
  "docs/adr/009-net-owned-wire-graph.md",
  "docs/adr/010-desktop-chrome-themes-and-net-colors.md",
  "docs/adr/011-component-name-labels.md",
];

const forbiddenPatterns = [
  { name: "Unix home path", pattern: /\/(?:home|Users)\/[^/\s`]+/g },
  { name: "Windows user path", pattern: /\b[A-Z]:\\Users\\[^\\\s`]+/gi },
  {
    name: "GitHub token",
    pattern: /\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g,
  },
  { name: "private key", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  { name: "workspace mount", pattern: /\/srv\/workspaces(?:\/|\b)/g },
  {
    name: "localhost URL",
    pattern: /\b(?:https?|wss?):\/\/(?:localhost|127\.0\.0\.1|\[::1\])/gi,
  },
];

const failures = [];
for (const file of documents) {
  const path = resolve(file);
  try {
    await access(path);
  } catch {
    failures.push(`${file}: required agent document is missing`);
    continue;
  }
  const text = await readFile(path, "utf8");
  for (const { name, pattern } of forbiddenPatterns) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) {
      failures.push(`${file}: contains ${name}`);
    }
  }
}

if (failures.length > 0) {
  console.error("Documentation privacy audit failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(
  `Documentation privacy audit passed for ${documents.length} agent-facing documents.`,
);
