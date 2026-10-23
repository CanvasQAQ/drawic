# Drawic

Drawic is a local-first, cross-platform schematic editor for analog and
mixed-signal work. It runs as a desktop Electron application, keeps project data
on the local machine, and performs no runtime network requests.

This repository is an original implementation. See [CLEAN_ROOM.md](CLEAN_ROOM.md)
for the development boundary and [PROVENANCE.md](PROVENANCE.md) for asset and
dependency lineage.

## Preview status

Version 0.2.0 is an **Unsigned Preview**. The editor uses independent drawing
pages and a single-file device library, and can produce project, SPICE, SVG, PNG,
and PDF files. User-editable libraries, Spectre/SCS, and local MCP are explicitly
not implemented.

All release installers use names containing `Unsigned-Preview`. Windows
SmartScreen and macOS Gatekeeper warnings are expected because no signing
certificate is configured.

## Implemented in 0.2

- Searchable, category-filtered symbol library with 109 bundled symbols and
  continuous placement mode. All device records are stored in one
  `.drawiclib.json` file, with sanitized themeable artwork, exact pin positions,
  label anchors, search terms, and SPICE metadata.
- Selection, Shift multi-selection, marquee selection, grid movement, deletion,
  rotation, and mirroring.
- Ctrl+wheel zoom centered on the pointer, Ctrl+0 reset, Space-drag panning, and
  visible placement previews.
- Point-to-point wiring by clicking one device port and then another, with exact
  port snapping and anchor-backed connectivity.
- Orthogonal wire segment handles that adjust routing without changing the
  electrical endpoint.
- Distinct crossing, endpoint, and explicit junction semantics, with connected
  network highlighting. Junctions do not mask the wire.
- Component reference/value fields, free text, named net labels, and properties.
- Independent drawing pages with creation, rename, duplicate, delete, reorder,
  and tab switching. Page switching is view state and does not mark a document
  dirty.
- Basic rectangle and ellipse drawing tools.
- New/open/save/save-as, recent projects, dirty-state tracking, and debounced
  unsaved-work recovery.
- Save/discard/cancel protection when replacing a dirty document or closing an
  application window.
- Basic SPICE import and deterministic SPICE export. Unsupported device classes
  are named in comments instead of being silently converted.
- Self-contained SVG and PNG export, plus a deterministic local PDF built from
  the rasterized diagram.
- Basic ERC for empty/duplicate references, dangling pins, invalid wire
  geometry, missing symbols, and conflicting labels.

## Development

Requirements: Node.js 22+, npm 10+, and the platform prerequisites for Electron.

```bash
npm ci
npm run typecheck
npm test
npm run build
npm start
```

The production application loads a local Vite build. Drawic never starts an HTTP
development server in normal application execution.

```bash
npm run verify:offline
npm run verify:clean-room
npm run dist:dir
npm run smoke:packaged
```

Linux packaging smoke uses `xvfb-run`. Release packaging is performed by the
tag-driven GitHub Actions workflow, which builds Windows, macOS x64, macOS
arm64, and Linux artifacts on native runners.

## Project files and local data

Projects use the `.drawic.json` extension. Schema version 2 is strict: a document
with an unknown future version is rejected rather than guessed at. The retired
Cell-oriented preview format is explicitly rejected and is not migrated. IDs are
stable UUIDs. Project saves write a temporary sibling file, flush it, and
atomically rename it over the destination.

Electron stores mutable desktop data under its platform-specific `userData`
directory:

- `settings.json`: the ten most recent project paths.
- `recovery/*.drawic.json`: atomic unsaved-work checkpoints.
- `recovery/latest.json`: the newest checkpoint pointer.

The exact base directory is shown by Electron's platform convention, normally:

- Windows: `%APPDATA%\Drawic`
- macOS: `~/Library/Application Support/Drawic`
- Linux: `$XDG_CONFIG_HOME/Drawic` or `~/.config/Drawic`

Saved projects remain wherever the user selects them. Drawic has no cloud
service, sync, account, telemetry, or update-check request.

## Interaction notes

- Choose a symbol in the library, then click the canvas repeatedly to place
  copies. Press Escape to leave placement mode.
- The Wire tool supports click-start, move preview, and click-finish. Clicking a
  device port before and after creates a wire bound to both ports.
- Ctrl+wheel zooms around the pointer. Ctrl+0 resets the view. Hold Space and
  drag to pan.
- Select a wire to reveal routing handles at movable orthogonal segments.
- A wire endpoint touching another wire connects them. Interior crossings do not
  connect until the Junction tool adds an explicit junction.
- Net labels with identical text merge their networks.
- Drag a component to move selected components. Hold Shift while dragging to
  constrain movement to one axis.
- Hold Shift while selecting to add or remove an item.
- Menu commands provide Save, Save As, Undo, Redo, Delete, Rotate, Mirror,
  Import SPICE, Export SPICE, and diagram export.

## Security and offline behavior

- Renderer: Chromium sandbox, context isolation, no Node integration, CSP with
  `connect-src 'none'`.
- Preload: a fixed, typed API only.
- Main: native dialogs, atomic local filesystem operations, recovery, and export.
- All HTTP(S), WebSocket, and secure-WebSocket requests are cancelled at the
  Electron session boundary.
- New windows, navigation, and permission requests are denied.

## Known limitations

- PDF is a raster-backed PDF, not a vector or searchable PDF.
- Electrical simulation is not embedded; Drawic exports text netlists.
- Devices outside the basic SPICE mapping are visually editable but explicitly
  omitted on SPICE export.
- Page artwork is independent; electrical connectivity is never inferred
  between pages.
- All 0.2 packages are unsigned.

The Windows release includes an unpacked application ZIP alongside NSIS and
portable EXE files. A ZIP avoids a direct EXE download and can reduce browser
download blocking, but the unsigned executable inside still triggers Windows
SmartScreen on first launch.

## License

Original Drawic source is MIT licensed. Bundled static device artwork has a
separate owner-authorized distribution basis documented in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Third-party software licenses
remain with their respective projects.
