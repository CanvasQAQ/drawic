import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { AppTheme } from "../src/renderer/ui";

export function TestTheme({ children }: { children: React.ReactNode }) {
  return <AppTheme appearance="dark"><div>{children}</div></AppTheme>;
}

export function createThemedRoot(container: HTMLElement): Root {
  const root = createRoot(container);
  return {
    render: children => root.render(<TestTheme>{children}</TestTheme>),
    unmount: () => root.unmount(),
  };
}
