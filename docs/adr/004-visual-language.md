# ADR 004: Drawic visual language

Status: accepted, 2026-10-23

## Decision

Drawic uses a deep blue-black shell, warm amber action states, teal electrical
net highlights, and a warm paper drawing surface. Tool glyphs are original SVG
paths or text labels. Selection uses both a border pattern and fill; diagnostics
use text severity labels; network emphasis uses pins and stroke in addition to
color. Minimum window size is 900 × 640, with collapsible side panels.

## Consequences

The UI does not depend on external fonts, icon packages, remote CSS, or copied
screens. The symbol grid displays only approved manifest metadata and bundled
static artwork.

## Current shell and theme rules

The application shell uses a slate surface, violet selection and primary actions,
cyan informational accents, and separate success, warning and destructive roles.
All workspaces use the paired light and dark tokens in `appearance.css`.
Paper, device ink, electrical highlighting and document-authored colors are
independent of the shell. The title bar uses one light/dark toggle; a saved system preference remains
supported without a separate selector. The preference is local to the application
and theme changes do not enter history. Toolbar groups use whitespace and short,
muted separators. Library filters use themed, keyboard-accessible popovers.
The device browser shows all matching artwork and pin directions in a responsive grid, and the local Agent entry lives in the upper-right title bar.
At small desktop widths, narrower side columns reserve space for the canvas
and keep its zoom and grid controls reachable while the inspector is open.
