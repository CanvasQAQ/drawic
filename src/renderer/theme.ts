export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "drawic.theme";

export function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark";
}

export function resolveInitialTheme(
  storage: Pick<Storage, "getItem"> | undefined = globalThis.localStorage,
): Theme {
  try {
    const stored = storage?.getItem(THEME_STORAGE_KEY);
    return isTheme(stored) ? stored : "dark";
  } catch {
    return "dark";
  }
}

export function applyThemeToDocument(
  theme: Theme,
  target: Document = document,
): void {
  target.documentElement.dataset.theme = theme;
  target.documentElement.style.colorScheme = theme;
}

export function persistTheme(
  theme: Theme,
  storage: Pick<Storage, "setItem"> | undefined = globalThis.localStorage,
): void {
  try {
    storage?.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Theme persistence is optional when storage is unavailable.
  }
}
