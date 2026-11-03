import React from "react";
import { Button as RadixButton, Theme } from "@radix-ui/themes";
import type { Theme as Appearance } from "./theme";

export { AlertDialog, Checkbox, ContextMenu, Dialog, DropdownMenu, Flex, IconButton,
  Select, TextArea, TextField } from "@radix-ui/themes";

// A portalled control owns keyboard interaction while it is open. Full-window
// device workspaces also have dialog semantics but keep their editor shortcuts.
export function ownsShortcut(event: KeyboardEvent) {
  return event.defaultPrevented || (event.target instanceof Element &&
    Boolean(event.target.closest('.rt-BaseDialogContent, [role="menu"], [role="listbox"]')));
}

export function Button({ variant = "soft", color = variant === "solid" ? undefined : "gray", className, ...props }: React.ComponentProps<typeof RadixButton>) {
  // Radix Themes 3.3 types highContrast as never with exactOptionalPropertyTypes.
  const classes = [className, color === "red" && "rt-high-contrast"].filter(Boolean).join(" ");
  return <RadixButton {...props} variant={variant} {...(color && { color })} className={classes} />;
}

export function AppTheme({ appearance, children }: {
  appearance: Appearance;
  children: React.ReactElement;
}) {
  return <Theme asChild appearance={appearance} accentColor="violet" grayColor="slate"
    radius="small" scaling="95%" panelBackground="solid" hasBackground={false}>
    {children}
  </Theme>;
}
