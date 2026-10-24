import React, { useEffect, useRef } from "react";
import { Icon } from "./Icons";

export type ConsoleLevel = "info" | "success" | "warning" | "error";

export interface EditorLogEntry {
  id: string;
  at: string;
  level: ConsoleLevel;
  message: string;
}

interface ConsolePanelProps {
  entries: readonly EditorLogEntry[];
  onClear: () => void;
  onClose: () => void;
}

export function ConsolePanel({
  entries,
  onClear,
  onClose,
}: ConsolePanelProps) {
  const outputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [entries.length]);

  return (
    <section className="editor-console" aria-label="Editor console">
      <header>
        <span className="eyebrow">Session log</span>
        <strong>Console</strong>
        <span className="console-count">{entries.length}</span>
        <div>
          <button type="button" onClick={onClear} disabled={entries.length === 0}>
            Clear
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Hide console"
          >
            <Icon name="close" />
          </button>
        </div>
      </header>
      <div
        ref={outputRef}
        className="console-output"
        role="log"
        aria-live="polite"
        aria-relevant="additions"
      >
        {entries.length === 0 ? (
          <p className="console-empty">No messages in this session.</p>
        ) : (
          entries.map((entry) => (
            <div className={`console-line is-${entry.level}`} key={entry.id}>
              <time>{entry.at}</time>
              <span className="console-level">{entry.level}</span>
              <span>{entry.message}</span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
