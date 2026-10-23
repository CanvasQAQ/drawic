import type { SymbolDefinition, SymbolSide } from "./model";

export interface RawSymbolManifest {
  manifestVersion: number;
  collection: string;
  categories: string[];
  entries: Array<{
    id: string;
    label: string;
    category: string;
    electrical: boolean;
    palette: boolean;
    frame: { x: number; y: number; width: number; height: number };
    pins: Array<{ key: string; role: string; side: SymbolSide }>;
    file: string;
  }>;
}

export function extractSvgBody(markup: string): string {
  const withoutHeader = markup
    .replace(/^\uFEFF/, "")
    .replace(/<\?xml[\s\S]*?\?>/i, "")
    .replace(/<!--[\s\S]*?-->/g, "");
  const match = withoutHeader.match(/<svg\b[^>]*>([\s\S]*?)<\/svg>/i);
  if (!match?.[1]) {
    throw new Error("A bundled symbol is not a valid SVG document.");
  }
  return match[1].replace(/<title\b[\s\S]*?<\/title>/gi, "").replace(/<desc\b[\s\S]*?<\/desc>/gi, "");
}

export function buildSymbolLibrary(
  manifest: RawSymbolManifest,
  files: Record<string, string>,
): SymbolDefinition[] {
  if (manifest.manifestVersion !== 1) {
    throw new Error(`Unsupported symbol manifest version ${manifest.manifestVersion}.`);
  }
  return manifest.entries
    .map((entry) => {
      const markup = files[`./assets/device-symbols/svg/${entry.file}`] ??
        files[`./assets/device-symbols/${entry.file}`];
      if (!markup) {
        throw new Error(`Missing bundled SVG for ${entry.id}.`);
      }
      return {
        id: entry.id,
        label: entry.label,
        category: entry.category,
        electrical: entry.electrical,
        palette: entry.palette,
        frame: entry.frame,
        pins: entry.pins,
        file: entry.file,
        svgBody: extractSvgBody(markup),
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function symbolById(
  library: readonly SymbolDefinition[],
  symbolId: string,
): SymbolDefinition | undefined {
  return library.find((symbol) => symbol.id === symbolId);
}

export function suggestedReference(
  symbol: SymbolDefinition,
  existingReferences: readonly string[],
): string {
  const prefixes: Record<string, string> = {
    resistor: "R",
    "variable-resistor": "R",
    capacitor: "C",
    "variable-capacitor": "C",
    inductor: "L",
    "variable-inductor": "L",
    "voltage-source": "V",
    "pulse-voltage-source": "V",
    "current-source": "I",
    diode: "D",
    "zener-diode": "D",
    nmos: "M",
    pmos: "M",
    npn: "Q",
    pnp: "Q",
    ground: "GND",
  };
  const prefix = prefixes[symbol.id] ?? symbol.id.replace(/[^a-z0-9]/gi, "").slice(0, 2).toUpperCase();
  let number = 1;
  while (existingReferences.includes(`${prefix}${number}`)) {
    number += 1;
  }
  return `${prefix}${number}`;
}

export function defaultDeviceValue(symbolId: string): string {
  switch (symbolId) {
    case "resistor":
    case "variable-resistor":
      return "1k";
    case "capacitor":
    case "variable-capacitor":
      return "1u";
    case "inductor":
    case "variable-inductor":
      return "1m";
    case "voltage-source":
    case "pulse-voltage-source":
      return "DC 5";
    case "current-source":
      return "DC 1m";
    case "diode":
    case "zener-diode":
      return "D";
    case "nmos":
      return "NMOS";
    case "pmos":
      return "PMOS";
    case "npn":
      return "NPN";
    case "pnp":
      return "PNP";
    default:
      return "";
  }
}
