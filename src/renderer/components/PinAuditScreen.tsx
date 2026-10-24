import React, { useMemo, useState } from "react";
import type { DeviceSymbol } from "../../core/library";
import {
  buildPinDirectionAudit,
  initialPinDirections,
  pinAuditKey,
  pinDirectionCorrections,
  pinPositionWarnings,
  type PinDirections,
} from "../../core/pinAudit";
import type { SymbolSide } from "../../core/model";
import { Icon } from "./Icons";

interface PinAuditScreenProps {
  symbols: readonly DeviceSymbol[];
  libraryId: string;
  libraryRevision: string;
  onClose: () => void;
  onExport: (content: string) => Promise<{ canceled: boolean; path?: string }>;
}

const DIRECTION_LABELS: Record<SymbolSide, string> = {
  north: "North / outward up",
  east: "East / outward right",
  south: "South / outward down",
  west: "West / outward left",
};
const EMPTY_PIN_IDS: ReadonlySet<string> = new Set<string>();

function directionVector(direction: SymbolSide): { x: number; y: number } {
  switch (direction) {
    case "north":
      return { x: 0, y: -1 };
    case "east":
      return { x: 1, y: 0 };
    case "south":
      return { x: 0, y: 1 };
    case "west":
      return { x: -1, y: 0 };
  }
}

function directionArrow(
  point: { x: number; y: number },
  direction: SymbolSide,
  length: number,
): { tip: { x: number; y: number }; shaft: string; head: string; label: { x: number; y: number } } {
  const vector = directionVector(direction);
  const tip = {
    x: point.x + vector.x * length,
    y: point.y + vector.y * length,
  };
  const base = {
    x: tip.x - vector.x * 5,
    y: tip.y - vector.y * 5,
  };
  const perpendicular = { x: -vector.y * 2.5, y: vector.x * 2.5 };
  return {
    tip,
    shaft: `M ${point.x} ${point.y} L ${tip.x} ${tip.y}`,
    head: `M ${base.x + perpendicular.x} ${base.y + perpendicular.y} L ${tip.x} ${tip.y} L ${base.x - perpendicular.x} ${base.y - perpendicular.y}`,
    label: {
      x: tip.x + vector.x * 4,
      y: tip.y + vector.y * 4,
    },
  };
}

function PinAuditPreview({
  symbol,
  directions,
}: {
  symbol: DeviceSymbol;
  directions: PinDirections;
}) {
  const box = symbol.selectionBox ?? symbol.frame;
  const padding = Math.max(20, Math.min(48, Math.max(box.width, box.height) * 0.18));
  const centerX = symbol.frame.x + symbol.frame.width / 2;
  const centerY = symbol.frame.y + symbol.frame.height / 2;
  const arrowLength = Math.max(16, Math.min(30, Math.max(box.width, box.height) * 0.16));
  return (
    <svg
      className="pin-audit-preview"
      viewBox={`${box.x - padding} ${box.y - padding} ${box.width + padding * 2} ${box.height + padding * 2}`}
      role="img"
      aria-label={`${symbol.label} pin direction preview`}
    >
      <rect
        className="pin-audit-selection-box"
        x={box.x}
        y={box.y}
        width={box.width}
        height={box.height}
      />
      <g
        className="pin-audit-art"
        dangerouslySetInnerHTML={{ __html: symbol.svgBody }}
      />
      {symbol.pins.map((pin) => {
        if (typeof pin.x !== "number" || typeof pin.y !== "number") {
          return null;
        }
        const point = { x: centerX + pin.x, y: centerY + pin.y };
        const direction =
          directions[pinAuditKey(symbol.id, pin.id)] ?? pin.direction;
        const arrow = directionArrow(point, direction, arrowLength);
        const labelAnchor =
          direction === "east" ? "start" : direction === "west" ? "end" : "middle";
        return (
          <g
            className="pin-audit-arrow"
            key={pin.id}
            data-preview-pin-id={pin.id}
          >
            <path d={arrow.shaft} />
            <path d={arrow.head} />
            <circle cx={point.x} cy={point.y} r="2.8" />
            <text
              x={arrow.label.x}
              y={arrow.label.y}
              textAnchor={labelAnchor}
              dominantBaseline="central"
            >
              {pin.name || pin.id}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function DeviceAuditCard({
  symbol,
  directions,
  warningPins,
  onChange,
  onReset,
}: {
  symbol: DeviceSymbol;
  directions: PinDirections;
  warningPins: ReadonlySet<string>;
  onChange: (pinId: string, direction: SymbolSide) => void;
  onReset: () => void;
}) {
  const changed = symbol.pins.some(
    (pin) => (directions[pinAuditKey(symbol.id, pin.id)] ?? pin.direction) !== pin.direction,
  );
  return (
    <article
      className={`pin-audit-card${changed ? " has-changes" : ""}`}
      data-audit-device-id={symbol.id}
    >
      <header>
        <div>
          <h3>{symbol.label}</h3>
          <p>
            <code>{symbol.id}</code> · {symbol.category} · {symbol.pins.length} pins
            {symbol.variantId ? ` · variant ${symbol.variantId}` : ""}
          </p>
        </div>
        {changed ? (
          <button type="button" className="text-button" onClick={onReset}>
            Reset
          </button>
        ) : null}
      </header>
      <PinAuditPreview symbol={symbol} directions={directions} />
      <div className="pin-audit-pin-list">
        {symbol.pins.map((pin) => {
          const direction =
            directions[pinAuditKey(symbol.id, pin.id)] ?? pin.direction;
          const corrected = direction !== pin.direction;
          return (
            <div
              className={`pin-audit-pin-row${corrected ? " is-corrected" : ""}${warningPins.has(pin.id) ? " has-warning" : ""}`}
              key={pin.id}
              data-audit-pin-id={pin.id}
            >
              <span className="pin-audit-pin-name" title={`${pin.role} · ${pin.key}`}>
                {pin.name || pin.id}
                <small>{pin.role}</small>
              </span>
              <span className="pin-audit-direction-glyph" aria-hidden="true">
                {direction === "north"
                  ? "↑"
                  : direction === "east"
                    ? "→"
                    : direction === "south"
                      ? "↓"
                      : "←"}
              </span>
              <select
                value={direction}
                aria-label={`${symbol.label} ${pin.name || pin.id} direction`}
                onChange={(event) => onChange(pin.id, event.target.value as SymbolSide)}
              >
                {(Object.keys(DIRECTION_LABELS) as SymbolSide[]).map((side) => (
                  <option key={side} value={side}>
                    {side} — {DIRECTION_LABELS[side].split(" / ")[1]}
                  </option>
                ))}
              </select>
              {corrected ? <span className="pin-audit-change-tag">changed</span> : null}
              {warningPins.has(pin.id) ? (
                <span
                  className="pin-audit-warning"
                  title="The current contact point is not on the overall visible-ink edge. Check the arrow visually; rebuilding will recalculate the point."
                >
                  check position
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    </article>
  );
}

export function PinAuditScreen({
  symbols,
  libraryId,
  libraryRevision,
  onClose,
  onExport,
}: PinAuditScreenProps) {
  const [directions, setDirections] = useState<Record<string, SymbolSide>>(() =>
    initialPinDirections(symbols),
  );
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [changedOnly, setChangedOnly] = useState(false);
  const [warningsOnly, setWarningsOnly] = useState(false);
  const [exportState, setExportState] = useState<
    { kind: "idle" | "saving" | "saved" | "error"; message: string }
  >({ kind: "idle", message: "" });

  const categories = useMemo(
    () => [...new Set(symbols.map((symbol) => symbol.category))].sort(),
    [symbols],
  );
  const corrections = useMemo(
    () => pinDirectionCorrections(symbols, directions),
    [directions, symbols],
  );
  const warningMap = useMemo(() => {
    const result = new Map<string, ReadonlySet<string>>();
    for (const symbol of symbols) {
      const warnings = pinPositionWarnings(symbol, directions);
      result.set(symbol.id, new Set(warnings.map((warning) => warning.pinId)));
    }
    return result;
  }, [directions, symbols]);
  const changedDeviceIds = useMemo(
    () => new Set(corrections.map((correction) => correction.deviceId)),
    [corrections],
  );
  const warningDeviceIds = useMemo(
    () =>
      new Set(
        [...warningMap.entries()]
          .filter(([, pins]) => pins.size > 0)
          .map(([deviceId]) => deviceId),
      ),
    [warningMap],
  );
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return symbols.filter((symbol) => {
      if (category !== "all" && symbol.category !== category) {
        return false;
      }
      if (changedOnly && !changedDeviceIds.has(symbol.id)) {
        return false;
      }
      if (warningsOnly && !warningDeviceIds.has(symbol.id)) {
        return false;
      }
      return (
        !normalized ||
        symbol.label.toLowerCase().includes(normalized) ||
        symbol.id.toLowerCase().includes(normalized) ||
        symbol.variantOf?.toLowerCase().includes(normalized) ||
        symbol.variantId?.toLowerCase().includes(normalized) ||
        symbol.pins.some(
          (pin) =>
            pin.id.toLowerCase().includes(normalized) ||
            pin.name.toLowerCase().includes(normalized) ||
            pin.role.toLowerCase().includes(normalized),
        )
      );
    });
  }, [
    category,
    changedDeviceIds,
    changedOnly,
    query,
    symbols,
    warningDeviceIds,
    warningsOnly,
  ]);
  const reviewedPinCount = useMemo(
    () => symbols.reduce((count, symbol) => count + symbol.pins.length, 0),
    [symbols],
  );

  const updateDirection = (deviceId: string, pinId: string, direction: SymbolSide) => {
    setDirections((current) => ({
      ...current,
      [pinAuditKey(deviceId, pinId)]: direction,
    }));
    setExportState({ kind: "idle", message: "" });
  };

  const resetDevice = (symbol: DeviceSymbol) => {
    setDirections((current) => {
      const next = { ...current };
      for (const pin of symbol.pins) {
        next[pinAuditKey(symbol.id, pin.id)] = pin.direction;
      }
      return next;
    });
    setExportState({ kind: "idle", message: "" });
  };

  const exportCorrections = async () => {
    const report = buildPinDirectionAudit({
      symbols,
      directions,
      libraryId,
      libraryRevision,
      reviewedAt: new Date().toISOString(),
    });
    setExportState({ kind: "saving", message: "Opening save dialog…" });
    try {
      const result = await onExport(`${JSON.stringify(report, null, 2)}\n`);
      setExportState(
        result.canceled
          ? { kind: "idle", message: "Export canceled." }
          : {
              kind: "saved",
              message: `Saved ${corrections.length} correction${corrections.length === 1 ? "" : "s"}.`,
            },
      );
    } catch {
      setExportState({
        kind: "error",
        message: "Could not save the pin audit document.",
      });
    }
  };

  return (
    <section className="pin-audit-screen" role="dialog" aria-modal="true" aria-labelledby="pin-audit-title">
      <header className="pin-audit-header">
        <div>
          <span className="eyebrow">Developer inspection</span>
          <h2 id="pin-audit-title">Device pin direction audit</h2>
          <p>
            Each arrow is the outward escape direction used by automatic routing.
            Arrows should leave the visible lead, never cross the symbol body.
          </p>
        </div>
        <div className="pin-audit-summary">
          <strong>{reviewedPinCount}</strong>
          <span>pins reviewed</span>
          <strong>{corrections.length}</strong>
          <span>corrections</span>
        </div>
        <button
          type="button"
          className="icon-button"
          onClick={onClose}
          aria-label="Close pin audit"
        >
          <Icon name="close" />
        </button>
      </header>

      <div className="pin-audit-controls">
        <label className="search-field pin-audit-search">
          <span className="sr-only">Search devices and pins</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search device, pin, role"
            type="search"
          />
        </label>
        <label className="category-field">
          <span>Category</span>
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="all">All categories</option>
            {categories.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label className="pin-audit-toggle">
          <input
            type="checkbox"
            checked={changedOnly}
            onChange={(event) => setChangedOnly(event.target.checked)}
          />
          Changed only
        </label>
        <label className="pin-audit-toggle">
          <input
            type="checkbox"
            checked={warningsOnly}
            onChange={(event) => setWarningsOnly(event.target.checked)}
          />
          Position warnings
        </label>
        <span className="pin-audit-filter-count">
          {filtered.length} of {symbols.length} devices
        </span>
        <button
          type="button"
          className="text-button"
          disabled={corrections.length === 0}
          onClick={() => {
            setDirections(initialPinDirections(symbols));
            setExportState({ kind: "idle", message: "" });
          }}
        >
          Reset all
        </button>
        <button
          type="button"
          className="primary-button"
          disabled={corrections.length === 0 || exportState.kind === "saving"}
          onClick={() => void exportCorrections()}
        >
          <Icon name="export" />
          Export corrections ({corrections.length})
        </button>
      </div>

      {exportState.message ? (
        <div className={`pin-audit-message is-${exportState.kind}`} role="status">
          {exportState.message}
        </div>
      ) : null}

      <div className="pin-audit-grid">
        {filtered.map((symbol) => (
          <DeviceAuditCard
            key={symbol.id}
            symbol={symbol}
            directions={directions}
            warningPins={warningMap.get(symbol.id) ?? EMPTY_PIN_IDS}
            onChange={(pinId, direction) =>
              updateDirection(symbol.id, pinId, direction)
            }
            onReset={() => resetDevice(symbol)}
          />
        ))}
      </div>
      {filtered.length === 0 ? (
        <div className="pin-audit-empty">
          No devices match the current audit filters.
        </div>
      ) : null}
      <footer className="pin-audit-footer">
        <span>
          Correction files record only changed pins. Apply them to the manifest,
          then regenerate the device library.
        </span>
        <code>{libraryId}@{libraryRevision.slice(0, 12)}</code>
      </footer>
    </section>
  );
}
