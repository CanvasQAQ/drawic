import type { Diagnostic } from "../../core/model";
import { Icon } from "./Icons";

interface ErcPanelProps {
  diagnostics: Diagnostic[];
  onClose: () => void;
  onSelectItem: (itemId: string) => void;
}

export function ErcPanel({ diagnostics, onClose, onSelectItem }: ErcPanelProps) {
  const errors = diagnostics.filter((item) => item.severity === "error").length;
  const warnings = diagnostics.length - errors;
  return (
    <section className="erc-panel" aria-label="Electrical rules check results">
      <header>
        <div>
          <span className="eyebrow">Electrical rules</span>
          <h2>{diagnostics.length === 0 ? "No issues found" : `${errors} errors · ${warnings} warnings`}</h2>
        </div>
        <button className="icon-button" type="button" onClick={onClose} aria-label="Close ERC results">
          <Icon name="close" />
        </button>
      </header>
      {diagnostics.length === 0 ? (
        <p className="erc-empty">
          <Icon name="check" /> The active page passes the basic Drawic 0.2 checks.
        </p>
      ) : (
        <ul>
          {diagnostics.map((diagnostic, index) => (
            <li key={`${diagnostic.code}_${diagnostic.itemId ?? index}`}>
              <button
                type="button"
                onClick={() => diagnostic.itemId && onSelectItem(diagnostic.itemId)}
                disabled={!diagnostic.itemId}
              >
                <span className={`severity severity-${diagnostic.severity}`}>
                  {diagnostic.severity === "error" ? "ERROR" : "WARN"}
                </span>
                <span>{diagnostic.message}</span>
                <code>{diagnostic.code}</code>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
