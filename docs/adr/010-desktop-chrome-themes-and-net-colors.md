# ADR 010: Desktop chrome, local themes, and Net colors

Status: accepted, 2026-10-25

## Decision

Drawic owns a compact application title bar instead of using the default
Windows and Linux frame. On macOS the window uses `hiddenInset` with native
traffic lights at the top-left; on Windows and Linux the renderer draws
minimize, maximize/restore, and close controls. Window actions are exposed only
through narrow typed preload methods that validate the main window sender.
Native close behavior, including dirty-project protection, remains in the main
process.

Light and dark themes are renderer view preferences, not document data. The
selected theme is persisted in local storage, applied through semantic CSS
variables, and defaults to the existing dark visual language. Theme switching
does not modify the project or create an undo entry.

Canvas viewBox geometry must track the actual SVG element size. A resize
observer preserves the view center and drawing scale while recomputing the
viewBox aspect ratio whenever panels, window size, or other layout changes alter
the canvas. This prevents letterbox bands without using non-uniform SVG
scaling.

A Net may store one optional `color` as a six-digit hexadecimal value. The
color is visual metadata owned by the Net, so every wire in that Net renders
with the same color and its Junctions use the same color. SVG export preserves
both wire and Junction colors. Selecting a Net for emphasis may still use the
interaction highlight independently. Net color is not electrical identity and
does not affect connectivity or ERC.

An unselected Junction renders as one compact, Net-colored vertex marker. The
larger selection ring is rendered only on the selected Junction.

Canonicalization preserves Net color. When multiple Net objects merge, the
first stored explicit color in page order is retained. Clearing color returns
the Net to the theme's default wire color.

## Consequences

- Windows and Linux no longer depend on native title-bar styling.
- macOS keeps platform-standard traffic lights and accessibility behavior.
- The application can switch appearance without rewriting documents.
- Canvas content remains uniformly scaled during responsive layout changes.
- A Net color round-trips through schema version 3 as an additive optional
  field; documents without it retain the existing appearance.
