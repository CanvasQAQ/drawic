const DANGEROUS_ELEMENTS = [
  "script",
  "foreignObject",
  "iframe",
  "object",
  "embed",
  "audio",
  "video",
  "canvas",
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const byteOrderMark = String.fromCharCode(0xfeff);

export function extractSvgBody(markup: string): string {
  const source = markup
    .replace(new RegExp(`^${byteOrderMark}`), "")
    .replace(/<\?xml[\s\S]*?\?>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<!DOCTYPE[\s\S]*?>/gi, "");
  const match = source.match(/<svg\b[^>]*>([\s\S]*?)<\/svg>/i);
  if (!match?.[1]) {
    throw new Error("A bundled symbol is not a valid SVG document.");
  }
  return match[1];
}

export function sanitizeSvgFragment(body: string): string {
  let sanitized = body;
  for (const element of DANGEROUS_ELEMENTS) {
    sanitized = sanitized.replace(
      new RegExp(
        `<${escapeRegExp(element)}\\b[\\s\\S]*?<\\/${escapeRegExp(element)}>`,
        "gi",
      ),
      "",
    );
    sanitized = sanitized.replace(
      new RegExp(`<${escapeRegExp(element)}\\b[^>]*\\/?>`, "gi"),
      "",
    );
  }
  sanitized = sanitized
    .replace(/<title\b[\s\S]*?<\/title>/gi, "")
    .replace(/<desc\b[\s\S]*?<\/desc>/gi, "")
    .replace(/\s+on[a-z][\w:-]*\s*=\s*(?:"[^"]*"|'[^']*')/gi, "")
    .replace(
      /\s+(?:xlink:)?href\s*=\s*(?:"(?:https?:|\/\/|javascript:|data:)[^"]*"|'(?:https?:|\/\/|javascript:|data:)[^']*')/gi,
      "",
    )
    .replace(/\s+(?:xlink:)?href\s*=\s*(?:"[^"]*"|'[^']*')/gi, "")
    .replace(
      /(fill|stroke)\s*=\s*(["'])(?:#000(?:000)?|black)\2/gi,
      '$1="currentColor"',
    )
    .replace(
      /((?:fill|stroke)\s*:\s*)(?:#000(?:000)?|black)\b/gi,
      "$1currentColor",
    )
    .replace(/\s+style\s*=\s*(["'])\s*\1/gi, "")
    .trim();

  if (/<script\b|\son[a-z]+\s*=|javascript:/i.test(sanitized)) {
    throw new Error("SVG sanitization left executable content behind.");
  }
  return sanitized;
}

export function sanitizeSvgBody(markup: string): string {
  return sanitizeSvgFragment(extractSvgBody(markup));
}
