import { buildConnectivity } from "./connectivity";
import { nodePinPosition } from "./geometry";
import {
  createEmptyPage,
  createIdentifier,
  type Annotation,
  type ComponentNode,
  type DrawingPage,
  type SymbolDefinition,
} from "./model";

const simpleElements: Record<string, string> = {
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
};

export interface SpiceExportResult {
  text: string;
  unsupportedDevices: string[];
}

function cleanToken(value: string, fallback: string): string {
  const clean = value.trim().replace(/\s+/g, "_");
  return clean || fallback;
}

function uniqueNetNames(
  page: DrawingPage,
  library: readonly SymbolDefinition[],
): Map<string, string> {
  const connectivity = buildConnectivity(page, library);
  const names = new Map<string, string>();
  let counter = 1;
  const groundNetworks = new Set<string>();
  for (const pin of connectivity.pinTerminals) {
    if (pin.symbol.id === "ground") {
      const network = connectivity.networkIdByPin.get(pin.key);
      if (network) {
        groundNetworks.add(network);
      }
    }
  }

  for (const group of connectivity.groups) {
    const networkId = connectivity.networkIdByKey.get(group[0]!)!;
    const canonicalName = connectivity.netNameByGroup.get(networkId);
    if (groundNetworks.has(networkId)) {
      names.set(networkId, "0");
      continue;
    }
    if (canonicalName) {
      names.set(networkId, cleanToken(canonicalName, `N${counter++}`));
      continue;
    }
    let candidate = `N${counter++}`;
    while ([...names.values()].includes(candidate)) {
      candidate = `N${counter++}`;
    }
    names.set(networkId, candidate);
  }
  return names;
}

function pinNet(
  node: ComponentNode,
  symbol: SymbolDefinition,
  pinKey: string,
  connectivity: ReturnType<typeof buildConnectivity>,
  names: Map<string, string>,
): string {
  const index = symbol.pins.findIndex((pin) => pin.key === pinKey);
  if (index < 0) {
    return "0";
  }
  const key = `pin:${node.id}:${index}`;
  const networkId = connectivity.networkIdByPin.get(key);
  return networkId ? (names.get(networkId) ?? "0") : "0";
}

export function exportSpice(
  page: DrawingPage,
  library: readonly SymbolDefinition[],
): SpiceExportResult {
  const connectivity = buildConnectivity(page, library);
  const nets = uniqueNetNames(page, library);
  const symbols = new Map(library.map((symbol) => [symbol.id, symbol]));
  const unsupportedDevices: string[] = [];
  const lines = [
    "* Drawic SPICE netlist",
    `* Page: ${page.name.replace(/[\r\n]/g, " ")}`,
    "* Generated locally; values are normalized only by trimming whitespace.",
  ];

  for (const node of page.nodes) {
    const symbol = symbols.get(node.symbolId);
    if (!symbol) {
      unsupportedDevices.push(`${node.reference || node.id}: missing symbol ${node.symbolId}`);
      continue;
    }
    if (node.symbolId === "ground") {
      continue;
    }
    const deviceKind = symbol.variantOf ?? node.symbolId;
    const prefix = simpleElements[deviceKind];
    if (!prefix) {
      unsupportedDevices.push(`${node.reference || node.id}: ${symbol.label}`);
      continue;
    }
    const ref = cleanToken(node.reference, `${prefix}?`);
    const value = node.value.trim() || "1";
    const net = (pin: string): string => pinNet(node, symbol, pin, connectivity, nets);

    switch (deviceKind) {
      case "resistor":
      case "variable-resistor":
        lines.push(`R${ref.replace(/^R/i, "")} ${net("1")} ${net("2")} ${value}`);
        break;
      case "capacitor":
      case "variable-capacitor":
        lines.push(`C${ref.replace(/^C/i, "")} ${net("1")} ${net("2")} ${value}`);
        break;
      case "inductor":
      case "variable-inductor":
        lines.push(`L${ref.replace(/^L/i, "")} ${net("1")} ${net("2")} ${value}`);
        break;
      case "voltage-source":
      case "pulse-voltage-source": {
        const normalized = value.replace(/^dc\s+/i, "");
        lines.push(`V${ref.replace(/^V/i, "")} ${net("+")} ${net("-")} DC ${normalized}`);
        break;
      }
      case "current-source": {
        const normalized = value.replace(/^dc\s+/i, "");
        lines.push(`I${ref.replace(/^I/i, "")} ${net("+")} ${net("-")} DC ${normalized}`);
        break;
      }
      case "diode":
      case "zener-diode":
        lines.push(`D${ref.replace(/^D/i, "")} ${net("A")} ${net("K")} ${value}`);
        break;
      case "nmos":
      case "pmos": {
        const model = value || (deviceKind === "nmos" ? "NMOS" : "PMOS");
        const hasBulkPin = symbol.pins.some(
          (pin) => pin.role.toLowerCase() === "bulk" || pin.key.toUpperCase() === "B",
        );
        lines.push(
          `M${ref.replace(/^M/i, "")} ${net("D")} ${net("G")} ${net("S")} ${hasBulkPin ? net("B") : net("S")} ${model}`,
        );
        break;
      }
      case "npn":
      case "pnp": {
        const pins = symbol.pins.map((pin) => pin.key);
        const collector = pins.find((key) => /^c$/i.test(key)) ?? pins[0] ?? "C";
        const base = pins.find((key) => /^b$/i.test(key)) ?? pins[1] ?? "B";
        const emitter = pins.find((key) => /^e$/i.test(key)) ?? pins[2] ?? "E";
        const model = value || (deviceKind === "npn" ? "NPN" : "PNP");
        lines.push(
          `Q${ref.replace(/^Q/i, "")} ${net(collector)} ${net(base)} ${net(emitter)} ${model}`,
        );
        break;
      }
    }
  }

  if (unsupportedDevices.length > 0) {
    lines.push("* Not exported by Drawic 0.2:");
    for (const device of unsupportedDevices) {
      lines.push(`* ${device.replace(/[\r\n]/g, " ")}`);
    }
  }
  lines.push(".end");
  return { text: `${lines.join("\n")}\n`, unsupportedDevices };
}

export interface SpiceImportResult {
  page: DrawingPage;
  title?: string;
  warnings: string[];
}

interface ImportedElement {
  reference: string;
  symbolId: string;
  nets: string[];
  value: string;
}

function classifyElement(tokens: string[], warnings: string[]): ImportedElement | null {
  const reference = tokens[0]!;
  const prefix = reference[0]?.toUpperCase();
  if (!prefix) {
    return null;
  }
  if (prefix === "R" && tokens.length >= 4) {
    return { reference, symbolId: "resistor", nets: tokens.slice(1, 3), value: tokens[3]! };
  }
  if (prefix === "C" && tokens.length >= 4) {
    return { reference, symbolId: "capacitor", nets: tokens.slice(1, 3), value: tokens[3]! };
  }
  if (prefix === "L" && tokens.length >= 4) {
    return { reference, symbolId: "inductor", nets: tokens.slice(1, 3), value: tokens[3]! };
  }
  if (prefix === "V" && tokens.length >= 3) {
    const tail = tokens.slice(3);
    const normalized = tail[0]?.toUpperCase() === "DC" ? tail.slice(1).join(" ") : tail.join(" ");
    return { reference, symbolId: "voltage-source", nets: tokens.slice(1, 3), value: normalized || "5" };
  }
  if (prefix === "I" && tokens.length >= 3) {
    const tail = tokens.slice(3);
    const normalized = tail[0]?.toUpperCase() === "DC" ? tail.slice(1).join(" ") : tail.join(" ");
    return { reference, symbolId: "current-source", nets: tokens.slice(1, 3), value: normalized || "1m" };
  }
  if (prefix === "D" && tokens.length >= 3) {
    return { reference, symbolId: "diode", nets: tokens.slice(1, 3), value: tokens[3] ?? "D" };
  }
  if (prefix === "M" && tokens.length >= 6) {
    const model = tokens[5]!.toUpperCase();
    return {
      reference,
      symbolId: model.includes("PMOS") ? "pmos" : "nmos",
      nets: tokens.slice(1, 5),
      value: tokens[5]!,
    };
  }
  if (prefix === "Q" && tokens.length >= 4) {
    const model = tokens[4]?.toUpperCase() ?? "";
    return {
      reference,
      symbolId: model.includes("PNP") ? "pnp" : "npn",
      nets: tokens.slice(1, 4),
      value: tokens[4] ?? "NPN",
    };
  }
  warnings.push(`Skipped unsupported SPICE element: ${tokens.join(" ")}`);
  return null;
}

export function importSpice(
  source: string,
  options?: {
    pageName?: string;
    idFactory?: (prefix: string) => string;
    library?: readonly SymbolDefinition[];
  },
): SpiceImportResult {
  const idFactory = options?.idFactory ?? createIdentifier;
  const page = createEmptyPage(options?.pageName ?? "Imported SPICE", idFactory("page"));
  const warnings: string[] = [];
  let title: string | undefined;
  const logicalLines: string[] = [];
  for (const physical of source.replace(/\r\n?/g, "\n").split("\n")) {
    const line = physical.trim();
    if (!line) {
      continue;
    }
    if (line.startsWith("+") && logicalLines.length > 0) {
      logicalLines[logicalLines.length - 1] += ` ${line.slice(1).trim()}`;
    } else {
      logicalLines.push(line);
    }
  }

  const elements: ImportedElement[] = [];
  for (const line of logicalLines) {
    if (line.startsWith("*")) {
      continue;
    }
    if (/^\.title\b/i.test(line)) {
      title = line.replace(/^\.title\s*/i, "");
      continue;
    }
    if (/^\.end\b/i.test(line) || /^\.model\b/i.test(line) || /^\.param\b/i.test(line)) {
      continue;
    }
    if (line.startsWith(".")) {
      warnings.push(`Ignored unsupported directive: ${line}`);
      continue;
    }
    const tokens = line.split(/\s+/);
    const element = classifyElement(tokens, warnings);
    if (element) {
      elements.push(element);
    }
  }

  const rows = Math.max(1, Math.ceil(Math.sqrt(elements.length)));
  elements.forEach((element, index) => {
    let symbolId = element.symbolId;
    let symbol =
      options?.library?.find((candidate) => candidate.id === symbolId) ??
      syntheticSymbolForImport(symbolId);
    if (
      (symbolId === "nmos" || symbolId === "pmos") &&
      element.nets.length > symbol.pins.length
    ) {
      const bulkVariant = options?.library?.find(
        (candidate) =>
          candidate.variantOf === symbolId &&
          candidate.pins.some(
            (pin) =>
              pin.role.toLowerCase() === "bulk" ||
              pin.key.toUpperCase() === "B",
          ),
      );
      if (bulkVariant) {
        symbolId = bulkVariant.id;
        symbol = bulkVariant;
      }
    }
    const node: ComponentNode = {
      id: idFactory("node"),
      symbolId,
      reference: element.reference,
      value: element.value,
      x: 180 + (index % rows) * 150,
      y: 140 + Math.floor(index / rows) * 140,
      rotation: 0,
      mirrored: false,
    };
    page.nodes.push(node);
    const representableNets = element.nets.slice(0, symbol.pins.length);
    const omittedNets = element.nets.slice(symbol.pins.length);
    if (omittedNets.length > 0) {
      warnings.push(
        `${element.reference}: ${omittedNets.length} terminal net(s) omitted because ${element.symbolId} is three-terminal.`,
      );
    }
    representableNets.forEach((netName, pinIndex) => {
      const point = nodePinPosition(node, symbol, pinIndex);
      const annotation: Annotation = {
        id: idFactory("label"),
        kind: "net",
        text: netName,
        x: point.x,
        y: point.y,
        size: 14,
      };
      page.annotations.push(annotation);
    });
  });

  return { page, ...(title ? { title } : {}), warnings };
}

function syntheticSymbolForImport(symbolId: string): SymbolDefinition {
  const pins: Record<string, string[]> = {
    resistor: ["1", "2"],
    capacitor: ["1", "2"],
    inductor: ["1", "2"],
    "voltage-source": ["+", "-"],
    "current-source": ["+", "-"],
    diode: ["A", "K"],
    nmos: ["D", "G", "S", "B"],
    pmos: ["D", "G", "S", "B"],
    npn: ["C", "B", "E"],
    pnp: ["C", "B", "E"],
  };
  const keys = pins[symbolId] ?? ["1", "2"];
  return {
    id: symbolId,
    label: symbolId,
    category: "import",
    electrical: true,
    palette: false,
    frame: { x: -24, y: -24, width: 48, height: 48 },
    pins: keys.map((key, index) => ({
      key,
      role: "passive",
      side: index === 0 ? "north" : index === 1 ? "south" : index === 2 ? "west" : "east",
    })),
    file: "",
    svgBody: "",
  };
}
