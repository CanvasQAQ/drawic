export type Theme = "light" | "dark";

export type { AppearancePreference as ThemePreference } from "../shared/bridge";
import type { AppearancePreference as ThemePreference } from "../shared/bridge";
export const SYSTEM_DARK_QUERY = "(prefers-color-scheme: dark)";

export const THEME_STORAGE_KEY = "drawic.theme";

export function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark";
}

export function readThemePreference(
  storage: Pick<Storage, "getItem"> | undefined = globalThis.localStorage,
): ThemePreference {
  try {
    const stored = storage?.getItem(THEME_STORAGE_KEY);
    return isTheme(stored) || stored === "system" ? stored : "dark";
  } catch {
    return "dark";
  }
}

export function effectiveTheme(preference: ThemePreference, systemDark: boolean): Theme {
  return preference === "system" ? (systemDark ? "dark" : "light") : preference;
}

export function resolveInitialTheme(storage?: Pick<Storage, "getItem">): Theme {
  return effectiveTheme(readThemePreference(storage), globalThis.matchMedia?.(SYSTEM_DARK_QUERY).matches ?? true);
}

export function applyThemeToDocument(
  theme: Theme,
  target: Document = document,
): void {
  target.documentElement.dataset.theme = theme;
  target.documentElement.style.colorScheme = theme;
}

export function persistTheme(
  theme: ThemePreference,
  storage: Pick<Storage, "setItem"> | undefined = globalThis.localStorage,
): void {
  try {
    storage?.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Theme persistence is optional when storage is unavailable.
  }
}
