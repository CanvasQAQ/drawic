import type { DeviceSymbol } from "./library";
import type { SymbolSide } from "./model";

export const PIN_AUDIT_FORMAT = "drawic-pin-direction-audit" as const;
export const PIN_AUDIT_SCHEMA_VERSION = 1 as const;

export type PinDirections = Readonly<Record<string, SymbolSide>>;

export interface PinDirectionCorrection {
  deviceId: string;
  deviceTitle: string;
  pinId: string;
  pinName: string;
  from: SymbolSide;
  to: SymbolSide;
}

export interface PinPositionWarning {
  deviceId: string;
  pinId: string;
  message: string;
}

export interface PinDirectionAudit {
  format: typeof PIN_AUDIT_FORMAT;
  schemaVersion: typeof PIN_AUDIT_SCHEMA_VERSION;
  reviewedAt: string;
  source: {
    manifestFile: "src/renderer/assets/device-symbols/manifest.json";
    libraryId: string;
    libraryRevision: string;
  };
  reviewedPinCount: number;
  corrections: PinDirectionCorrection[];
}

export function pinAuditKey(deviceId: string, pinId: string): string {
  return `${deviceId}\u0000${pinId}`;
}

export function initialPinDirections(
  symbols: readonly DeviceSymbol[],
): Record<string, SymbolSide> {
  return Object.fromEntries(
    symbols.flatMap((symbol) =>
      symbol.pins.map((pin) => [
        pinAuditKey(symbol.id, pin.id),
        pin.direction,
      ]),
    ),
  );
}

export function pinDirectionCorrections(
  symbols: readonly DeviceSymbol[],
  directions: PinDirections,
): PinDirectionCorrection[] {
  return symbols.flatMap((symbol) =>
    symbol.pins.flatMap((pin) => {
      const to = directions[pinAuditKey(symbol.id, pin.id)] ?? pin.direction;
      return to === pin.direction
        ? []
        : [
            {
              deviceId: symbol.id,
              deviceTitle: symbol.label,
              pinId: pin.id,
              pinName: pin.name,
              from: pin.direction,
              to,
            },
          ];
    }),
  );
}

export function pinPositionWarnings(
  symbol: DeviceSymbol,
  directions: PinDirections,
): PinPositionWarning[] {
  const box = symbol.selectionBox ?? symbol.frame;
  const centerX = symbol.frame.x + symbol.frame.width / 2;
  const centerY = symbol.frame.y + symbol.frame.height / 2;
  const tolerance = 2.5;
  return symbol.pins.flatMap((pin) => {
    if (typeof pin.x !== "number" || typeof pin.y !== "number") {
      return [];
    }
    const direction = directions[pinAuditKey(symbol.id, pin.id)] ?? pin.direction;
    const x = centerX + pin.x;
    const y = centerY + pin.y;
    const onSide =
      direction === "west"
        ? x <= box.x + tolerance
        : direction === "east"
          ? x >= box.x + box.width - tolerance
          : direction === "north"
            ? y <= box.y + tolerance
            : y >= box.y + box.height - tolerance;
    return onSide
      ? []
      : [
          {
            deviceId: symbol.id,
            pinId: pin.id,
            message: `${pin.name || pin.id} is not on the visible ${direction} edge. Regeneration will recalculate its contact point.`,
          },
        ];
  });
}

export function buildPinDirectionAudit(options: {
  symbols: readonly DeviceSymbol[];
  directions: PinDirections;
  libraryId: string;
  libraryRevision: string;
  reviewedAt: string;
}): PinDirectionAudit {
  return {
    format: PIN_AUDIT_FORMAT,
    schemaVersion: PIN_AUDIT_SCHEMA_VERSION,
    reviewedAt: options.reviewedAt,
    source: {
      manifestFile: "src/renderer/assets/device-symbols/manifest.json",
      libraryId: options.libraryId,
      libraryRevision: options.libraryRevision,
    },
    reviewedPinCount: options.symbols.reduce(
      (count, symbol) => count + symbol.pins.length,
      0,
    ),
    corrections: pinDirectionCorrections(options.symbols, options.directions),
  };
}
