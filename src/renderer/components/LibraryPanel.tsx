import { useMemo, useState } from "react";
import type { DeviceSymbol } from "../../core/library";
import { Icon } from "./Icons";

interface LibraryPanelProps {
  symbols: readonly DeviceSymbol[];
  selectedSymbolId: string | null;
  onSelect: (symbol: DeviceSymbol) => void;
  onCollapse: () => void;
}

function SymbolPreview({ symbol }: { symbol: DeviceSymbol }) {
  const frame = symbol.frame;
  return (
    <svg
      className="symbol-preview"
      viewBox={symbol.viewBox || `${frame.x} ${frame.y} ${frame.width} ${frame.height}`}
      style={{ color: "var(--symbol-ink, #dbe5e3)" }}
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
}: LibraryPanelProps) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const categories = useMemo(
    () => [...new Set(symbols.map((symbol) => symbol.category))].sort(),
    [symbols],
  );
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return symbols
      .filter(
        (symbol) =>
          symbol.palette &&
          (category === "all" || symbol.category === category) &&
          (!normalized ||
            symbol.label.toLowerCase().includes(normalized) ||
            symbol.id.toLowerCase().includes(normalized) ||
            symbol.keywords.some((keyword) => keyword.includes(normalized))),
      )
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [symbols, query, category]);

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
      <div className="library-count" aria-live="polite">
        {filtered.length} placeable {filtered.length === 1 ? "symbol" : "symbols"}
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
            }}
          >
            Clear filters
          </button>
        </div>
      ) : null}
    </aside>
  );
}
