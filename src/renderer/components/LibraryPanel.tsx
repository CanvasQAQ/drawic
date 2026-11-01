import { FilterSelect } from "./FilterSelect";
import { catalogFilter, type CatalogSource } from "../../core/deviceCatalog";
import React, { useMemo, useState } from "react";
import type { DeviceSymbol } from "../../core/library";
import {
  BUILT_IN_DEVICE_LIBRARY_ID,
  EMBEDDED_DEVICE_LIBRARY_ID,
  USER_DEVICE_LIBRARY_ID,
} from "../../core/deviceLibraryRegistry";
import { Icon } from "./Icons";

type LibrarySource = "all" | CatalogSource;
const origins: Partial<Record<string, CatalogSource>> = {
  [BUILT_IN_DEVICE_LIBRARY_ID]: "built-in",
  [USER_DEVICE_LIBRARY_ID]: "custom",
  [EMBEDDED_DEVICE_LIBRARY_ID]: "project",
};

interface LibraryPanelProps {
  symbols: readonly DeviceSymbol[];
  selectedSymbolId: string | null;
  onSelect: (symbol: DeviceSymbol) => void;
  onCollapse: () => void;
  onManageDevices?: () => void;
}

function SymbolPreview({ symbol }: { symbol: DeviceSymbol }) {
  const frame = symbol.frame;
  return (
    <svg
      className="symbol-preview"
      viewBox={symbol.viewBox || `${frame.x} ${frame.y} ${frame.width} ${frame.height}`}
      aria-hidden="true"
    >
      <g dangerouslySetInnerHTML={{ __html: symbol.svgBody }} />
    </svg>
  );
}

export function LibraryPanel({
  symbols,
  selectedSymbolId,
  onSelect,
  onCollapse,
  onManageDevices,
}: LibraryPanelProps) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [source, setSource] = useState<LibrarySource>("all");
  const categories = useMemo(
    () => [...new Set(symbols.map((symbol) => symbol.category))].sort(),
    [symbols],
  );
  const filtered = useMemo(() => {
    const matches = catalogFilter(query, category, source);
    return symbols
      .filter(symbol => symbol.palette && matches(symbol, origins[symbol.libraryId]))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [symbols, query, category, source]);

  return (
    <aside className="library-panel" aria-label="Device library">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Drawic symbols</span>
          <h2>Device library</h2>
        </div>
        <button
          className="icon-button"
          type="button"
          title="Hide device library"
          aria-label="Hide device library"
          onClick={onCollapse}
        >
          <Icon name="close" />
        </button>
      </div>
      <label className="search-field">
        <span className="sr-only">Search devices</span>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="10" cy="10" r="6" />
          <path d="m15 15 5 5" />
        </svg>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search symbols"
          type="search"
        />
      </label>
      <div className="category-field"><span>Category</span>
        <FilterSelect label="Category" value={category} onChange={setCategory}
          options={[{ value: "all", label: "All categories" }, ...categories.map(value => ({ value, label: value }))]} />
      </div>
      <div className="category-field"><span>Source</span>
        <FilterSelect label="Source" value={source} onChange={value => setSource(value as typeof source)}
          options={[{ value: "all", label: "All sources" }, { value: "built-in", label: "Built-in" },
            { value: "custom", label: "Custom" }, { value: "project", label: "This project" }]} />
      </div>
      <div className="library-count" aria-live="polite">
        {filtered.length} placeable {filtered.length === 1 ? "symbol" : "symbols"}
        {onManageDevices ? (
          <button
            type="button"
            className="text-button library-manage"
            onClick={onManageDevices}
          >
            Manage devices
          </button>
        ) : null}
      </div>
      <div className="symbol-grid">
        {filtered.map((symbol) => (
          <button
            type="button"
            className={`symbol-tile${selectedSymbolId === symbol.id ? " is-active" : ""}`}
            key={symbol.id}
            onClick={() => onSelect(symbol)}
            title={`${symbol.label} · ${symbol.pins.length} pins`}
            aria-pressed={selectedSymbolId === symbol.id}
          >
            <SymbolPreview symbol={symbol} />
            <span className="symbol-label">{symbol.label}</span>
            <span className="symbol-meta">
              {symbol.category} · {symbol.pins.length}p
            </span>
          </button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <div className="empty-library">
          No symbols match this filter.
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setQuery("");
              setCategory("all");
              setSource("all");
            }}
          >
            Clear filters
          </button>
        </div>
      ) : null}
    </aside>
  );
}
