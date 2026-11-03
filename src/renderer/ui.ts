export { AlertDialog, Button, ContextMenu, Flex, TextField, Theme } from "@radix-ui/themes";

// Radix Themes 3.3 types highContrast as never with exactOptionalPropertyTypes.
// Use its matching theme class so destructive buttons meet contrast in both modes.
export const destructiveButtonProps = { color: "red", className: "rt-high-contrast" } as const;
