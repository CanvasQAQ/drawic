import React, { useEffect, useState, type ReactNode } from "react";
import type { Theme } from "../theme";
import { DrawicMark } from "./DrawicMark";

interface TitleBarProps {
  documentTitle: string;
  platform: string;
  theme: Theme;
  onToggleTheme: () => void;
}

function ThemeIcon({ theme }: { theme: Theme }) {
  return theme === "dark" ? (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="3.2" />
      <path d="M10 2v2.2M10 15.8V18M2 10h2.2M15.8 10H18M4.3 4.3l1.6 1.6M14.1 14.1l1.6 1.6M15.7 4.3l-1.6 1.6M5.9 14.1l-1.6 1.6" />
    </svg>
  ) : (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M15.8 12.2A6.3 6.3 0 0 1 7.8 4.2 6.4 6.4 0 1 0 15.8 12.2Z" />
    </svg>
  );
}

export function TitleBar({
  documentTitle,
  platform,
  theme,
  onToggleTheme,
}: TitleBarProps): ReactNode {
  const isMac = platform === "darwin";
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    let active = true;
    void window.drawic
      .isWindowMaximized()
      .then((value) => {
        if (active) {
          setMaximized(value);
        }
      })
      .catch(() => undefined);
    const unsubscribe = window.drawic.onWindowMaximizedChange((value) => {
      setMaximized(value);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return (
    <header
      className={`window-titlebar${isMac ? " is-mac" : ""}`}
      data-testid="window-titlebar"
      data-platform={platform}
    >
      <div
        className="window-titlebar-drag"
        onDoubleClick={() => {
          if (!isMac) {
            window.drawic.toggleWindowMaximize();
          }
        }}
      >
        <span className="window-titlebar-mark">
          <DrawicMark />
        </span>
        <span className="window-titlebar-brand">Drawic</span>
        <span className="window-titlebar-title">{documentTitle}</span>
      </div>

      <div className="window-titlebar-actions">
        <button
          type="button"
          className="window-theme-button"
          aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
          title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
          onClick={onToggleTheme}
        >
          <ThemeIcon theme={theme} />
          <span>{theme === "dark" ? "Light" : "Dark"}</span>
        </button>

        {!isMac ? (
          <div className="window-controls" aria-label="Window controls">
            <button
              type="button"
              className="window-control"
              aria-label="Minimize window"
              title="Minimize"
              onClick={() => window.drawic.minimizeWindow()}
            >
              <svg viewBox="0 0 12 12" aria-hidden="true">
                <path d="M2 6.5h8" />
              </svg>
            </button>
            <button
              type="button"
              className="window-control"
              aria-label={maximized ? "Restore window" : "Maximize window"}
              title={maximized ? "Restore" : "Maximize"}
              onClick={() => window.drawic.toggleWindowMaximize()}
            >
              {maximized ? (
                <svg viewBox="0 0 12 12" aria-hidden="true">
                  <path d="M4 3V1.5h6.5V8H9M1.5 4H8v6.5H1.5z" />
                </svg>
              ) : (
                <svg viewBox="0 0 12 12" aria-hidden="true">
                  <rect x="1.8" y="1.8" width="8.4" height="8.4" />
                </svg>
              )}
            </button>
            <button
              type="button"
              className="window-control window-control-close"
              aria-label="Close window"
              title="Close"
              onClick={() => window.drawic.closeWindow()}
            >
              <svg viewBox="0 0 12 12" aria-hidden="true">
                <path d="m2.2 2.2 7.6 7.6M9.8 2.2 2.2 9.8" />
              </svg>
            </button>
          </div>
        ) : null}
      </div>
    </header>
  );
}
