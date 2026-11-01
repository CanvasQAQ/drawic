# Drawic user device libraries and manager

Status: implemented, 2026-11-01

Progress: PR 1–4 are implemented. No release has been tagged for this work.

Related: [ADR 001](adr/001-layered-security.md),
[ADR 005](adr/005-pages-and-single-file-device-library.md),
[ADR 011](adr/011-component-name-labels.md),
[DEVICE_PIN_AUDIT.md](DEVICE_PIN_AUDIT.md), and
[AGENT_WORKFLOW.md](AGENT_WORKFLOW.md).

This document records the implementation plan and design decisions. See the
README and agent workflow for current behavior.

## 1. Summary

Before this work, Drawic shipped one immutable, generated device library and a
developer-facing pin audit screen. This plan added:

1. a managed user library stored outside the application bundle;
2. a device library manager that replaces the pin audit entry point and keeps
   the existing audit as one tab;
3. in-app authoring of custom device artwork and pins;
4. user library import and export for sharing between users;
5. project embedding of referenced non-built-in devices so a shared project
   opens without the author's user library.

The built-in library stays generated, immutable, and shipped with the app. User
devices never override built-in device IDs.

## 2. Goals and non-goals

### Goals

- Let a user create a device by drawing its artwork, placing pins, and editing
  metadata, then place it like any built-in device.
- Keep custom devices across sessions and make them available in the palette.
- Share a single user library file with another user.
- Open a shared project on another machine without a missing-device failure.
- Preserve the existing pin audit and its correction-export workflow for the
  built-in library.
- Keep the renderer sandboxed: no Node.js, filesystem, shell, or generic IPC.

### Non-goals for this plan

- Editing built-in devices or overriding a built-in ID.
- Bezier path editing, fills, gradients, boolean operations, and layers in the
  device editor.
- Importing arbitrary third-party SVG files as editable artwork. Imported
  library records may carry an opaque sanitized SVG body, but the shape editor
  only edits Drawic primitives.
- Cloud sync or any runtime network access.
- Full draw.io document or library round-trip beyond the existing mxlibrary
  adapter.

## 3. Baseline before implementation

- The **Pin audit** screen is a tile in the **Export & tools** modal
  (`src/renderer/App.tsx`, `PinAuditScreen.tsx`). It reviews every built-in
  device, keeps direction edits in component state only, and exports a
  `drawic-pin-direction-audit` JSON document. Applying corrections is a manual
  manifest edit plus `npm run build:devices`.
- The built-in library is a generated single file,
  `src/renderer/assets/device-libraries/drawic-built-in.drawiclib.json`,
  parsed once at module scope in `App.tsx`. The renderer has no runtime device
  loading and no user library.
- Device persistence does not exist. All persistent writes go through narrow
  typed IPC methods in `src/shared/bridge.ts` and `src/main/main.ts`.
- Projects store `symbolId` on components; wires reference
  `deviceId + pinId`. A device missing from the resolved library breaks
  rendering and connectivity.
- ADR 005 anticipates custom devices as records in one user library file.

## 4. Architecture

### 4.1 Library layers

| Layer | Source | Mutability | Purpose |
| --- | --- | --- | --- |
| Built-in | Generated JSON bundled with the app | Immutable | Shipped catalog |
| User | `userData/device-libraries/user.drawiclib.json` | Editable | Authoring source, shareable file |
| Embedded | `DrawicDocument.embeddedLibrary` | Per project snapshot | Portability for referenced non-built-in devices |

Custom device IDs use the form `custom-<slug>-<suffix>` and must be unique
across the built-in and user layers. Imports and saves reject duplicates.

### 4.2 Resolution

For a `symbolId`, resolution order is:

1. built-in layer (built-ins can never be overridden);
2. the open project's embedded library;
3. the local user library;
4. otherwise the device is missing.

The project's embedded snapshot wins over the local user library when both
define the same ID. This makes a shared project render the same way for its
recipient. Editing a custom device in the user library does not silently change
an existing project; the manager offers an explicit **Refresh embedded devices
from library** action.

The palette shows built-in devices, user devices, and the open project's
embedded devices (grouped as "This project") so a recipient can place more
instances.

### 4.3 User library storage and IPC

- Location: `app.getPath("userData")/device-libraries/user.drawiclib.json`.
- The main process owns the file. Writes use the existing atomic
  temp-file-plus-rename helper in `src/main/fileStore.ts`.
- The renderer keeps a draft in React state and saves explicitly. Unsaved
  device edits are confirmed before closing the manager.
- Narrow IPC operations, each validated in main for sender, shape, and size:

| Bridge method | Direction | Behavior |
| --- | --- | --- |
| `loadUserDeviceLibrary()` | main → renderer | Read and return the file, or `null` |
| `saveUserDeviceLibrary(request)` | renderer → main | Validate, sanitize, atomically write |
| `importDeviceLibrary()` | main → renderer | Native open dialog, validate, sanitize, return records |
| `exportDeviceLibrary(request)` | renderer → main | Native save dialog, atomically write |

Content is capped at 10 MB. The main process re-parses the payload with the core
library parser before writing. No generic filesystem or path API is exposed.

### 4.4 Library file format

The file keeps `format: "drawic-device-library"` and `schemaVersion: 1`.

- It contains only custom devices; built-ins are never written to the user
  library.
- `revision` is recomputed from the serialized device array.
- `source` uses `collection: "user"` and `entryCount`.
- Device records reuse the existing `DeviceLibraryRecord` shape: ID, title,
  category, keywords, electrical flags, palette flag, frame, selection box,
  label anchors, sanitized SVG artwork, pins, SPICE metadata, and provenance.

A later phase adds `schemaVersion: 2` with an optional `artwork.shapes` field
(see 4.6). The parser accepts 1 and 2. A v1 record has no editable shape source;
it can still be rendered, placed, cloned, and re-pinned.

### 4.5 Project format and embedded library

`DOCUMENT_SCHEMA_VERSION` moves from 3 to 4 and adds an optional field:

```text
DrawicDocument
  schemaVersion: 4
  embeddedLibrary?: DeviceLibraryFile
```

- On save, collect every `symbolId` referenced by component nodes on all pages,
  subtract built-in IDs, and embed the full records (deduplicated). Preserve an
  existing project snapshot for that ID; use the current user record for a new
  reference. Use
  `id: "drawic-embedded"`, a fresh `revision`, and
  `source.collection: "embedded"`.
- The explicit refresh action replaces existing snapshots with live in-memory
  user records, including unsaved library edits. A normal save does not
  silently change an existing device appearance.
- The parser accepts v3 and v4. A v3 document loads with no embedded library and
  is saved as v4. A future format version is still rejected.
- Embedded records are untrusted input: they are parsed and their artwork is
  sanitized on open, exactly like library imports.
- Embedded devices are not editable in place. The manager can copy one into the
  local user library, which is the path to editing it.

### 4.6 Editable artwork (phase 3 schema extension)

The device editor stores a constrained primitive list under the optional
`artwork.shapes` field (library `schemaVersion: 2`). `artwork.body` remains the
render target.

Primitive kinds:

- line;
- polyline (optionally closed);
- rectangle;
- circle / ellipse;
- arc;
- text.

Rules:

- Stroke-only, using `currentColor`, so canvas and light/dark themes agree.
- No external references, images, scripts, event handlers, or `foreignObject`.
- Serialization is deterministic; IDs are stable and ordering is normalized.
- `selectionBox` and `labelBounds` are computed from primitive and pin bounds.
- When `shapes` is present, the parser regenerates `body` from `shapes` and
  ignores the stored body. This removes tampering and drift.
- Drawing coordinates follow the existing generated-library convention: the
  frame center is the origin and pin coordinates are relative to it. The
  generator remains the reference; round-trip tests pin the convention.
- Pins remain `DeviceLibraryPin` records with `id`, `key`, `name`, `role`,
  `direction`, and relative `x`/`y`. The editor derives direction from the
  nearest frame edge and lets the user override it.

### 4.7 Import, export, and conflicts

- **Export** writes the whole user library as `.drawiclib.json`. Selected-device
  export is a later addition.
- **Import** validates in the main process and returns normalized records.
- Conflict policy:
  - same ID and same revision: skip;
  - same ID and different content: ask the user to keep the local device,
    replace it, or import it as a copy with a new ID;
  - otherwise: add.
- Imported devices become local user devices. They are embedded only when a
  project references them.

### 4.8 Security and clean-room

- The renderer keeps `contextIsolation`, sandbox, no Node integration, and
  `connect-src 'none'`.
- Main validates the sender, payload shape, and size for every new operation.
- The build-time SVG sanitizer moves to `src/core/svgSanitize.ts` as the single
  implementation. `scripts/build-device-library.mjs` imports the compiled
  module, so `build:devices` runs `build:node` first. Sanitizer unit tests and a
  generator determinism check cover the shared path.
- The library parser gains a sanitize option: the bundled built-in library is
  trusted and used as generated, while user, imported, and embedded content is
  parsed and sanitized. Trust is decided by the code path, never by a field in
  the file.
- Device records are rejected if artwork contains scripts, event handlers,
  `foreignObject`, or external/`javascript:` references.
- The clean-room boundary is preserved. Only public draw.io format and behavior
  documentation informed the design; no source, tests, styles, or internal
  structures were inspected.

### 4.9 Entry points

- The **PINS — Audit pin directions** tile in **Export & tools** becomes
  **DEVICES — Device library** and opens the manager.
- A **Tools → Device library** native menu command is added and routed through
  the existing `AppCommand` bridge.
- The manager has two tabs, **Browse** and **Custom**. The audit is available under Browse → Maintenance tools.
- The left palette gains a source filter (All / Built-in / Custom / This
  project) and a **Manage devices** action.

## 5. Phased delivery

### PR 1 — data foundation

Deliverables:

- `src/core/library.ts`: sanitize option and user-library helpers.
- `src/core/deviceLibraryRegistry.ts` (new): merge, resolve, referenced-ID
  collection, ID conflict detection.
- `src/core/svgSanitize.ts` (new): sanitizer extracted from the generator.
- `src/core/model.ts` / `src/core/project.ts`: project schema v4, optional
  `embeddedLibrary`, v3 compatibility.
- `src/main/deviceLibraryStore.ts` (new) and `src/main/main.ts`: load, save,
  import, and export handlers.
- `src/shared/bridge.ts` and `src/preload/index.ts`: four narrow methods.
- `src/renderer/App.tsx`: load the user library at startup, keep the merged
  library in state, and resolve embedded devices for the open project.
- `scripts/build-device-library.mjs`: import the shared sanitizer.
- ADR 014 and workflow/README updates.

Exit criteria: unit tests cover merge, precedence, import conflicts, library
round trips, project embedding, and v3 project compatibility. No user-visible
UI changes yet.

### PR 2 — device library manager

Deliverables:

- `src/renderer/components/DeviceLibraryScreen.tsx` (new) with Browse, Audit,
  and Custom tabs.
- Reusable device preview and pin-row components extracted from
  `PinAuditScreen.tsx`; the audit tab keeps the correction export unchanged.
- Custom tab: list, search, rename, delete, duplicate, import, export, refresh
  embedded devices.
- App wiring, palette source filter, Tools menu command, and keyboard handling.
- Styles for the manager in `src/renderer/styles.css`.

Exit criteria: built-in audit behavior and tests are unchanged; import/export
and conflict flows are covered; custom list operations persist.

### PR 3 — device editor

Deliverables:

- `src/core/deviceArtwork.ts` (new): primitive types, deterministic serializer,
  bounds, validation.
- Library `schemaVersion: 2` with `artwork.shapes`; parser accepts 1 and 2 and
  regenerates the body from shapes.
- `src/renderer/components/DeviceEditor.tsx` (new) with grid snapping,
  selection, move/resize, line, polyline, rectangle, circle/ellipse, arc, text,
  and undo/redo.
- Pin tool: place, move, rename, role, direction override.
- Validation before save: unique pin IDs and contact points, pins inside the
  frame, non-empty artwork, label anchors.
- Save to the user library and immediate palette refresh.

Exit criteria: serializer determinism and validation tests pass; a device
created in the editor can be placed, wired, saved, and reopened.

### PR 4 — polish and compatibility

Deliverables:

- Clone a built-in device into the user library with read-only artwork,
  editable metadata and pins.
- Selected-device export.
- Missing-device placeholder and console/session message.
- Refresh embedded devices from the user library.
- Release notes and documentation updates.

Exit criteria: the acceptance scenarios in section 9 pass.

Release notes and the version bump are deferred until a release is prepared.

## 6. Test plan

| Area | Test |
| --- | --- |
| Library merge and resolution | `tests/deviceLibraryRegistry.test.ts` (new) |
| User library load/save/import/export validation | `tests/deviceLibraryStore.test.ts` (new) |
| Project embedding and v3 compatibility | `tests/embeddedDevices.test.ts` (new) |
| Artwork primitives and deterministic serialization | `tests/deviceArtwork.test.ts` (new) |
| SVG sanitizer | `tests/svgSanitize.test.ts` (new) |
| Manager screen and tabs | `tests/deviceLibraryScreen.test.tsx` (new) |
| Editor interactions and validation | `tests/deviceEditor.test.tsx` (new) |
| Palette and source filtering | `tests/libraryPanel.test.tsx` (extend) |
| Audit regression | `tests/pinAudit.test.tsx` (extend) |
| Generated library integrity | `tests/deviceLibrary.test.ts` (extend) |

Tests must not depend on the clock, the user's home directory, the network, or
absolute developer paths. IPC tests use temporary directories.

## 7. Validation

Run for every phase:

```bash
npm run typecheck
npm test
npm run verify:offline
npm run verify:clean-room
npm run verify:docs
npm run build
```

Run the packaged smoke test when Electron startup or packaged resources change:

```bash
npm run dist:dir
xvfb-run -a npm run smoke:packaged
```

## 8. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| The editor grows into a full vector-drawing tool | Hard MVP list in section 4.6; defer bezier, fills, layers, and SVG import |
| Shared projects drift from local device edits | Embedded snapshot wins; explicit refresh action |
| Schema changes break older projects | Accept v3 on read, normalize to v4 on save, reject future versions |
| Sanitizer divergence between build and runtime | One core module; generator imports the compiled module; determinism check |
| ID collisions between users | Namespaced IDs plus conflict handling on import |
| Large project files | Embed only referenced non-built-in devices; cap import/library size |
| Pin geometry and direction disagree | One shared edge/direction helper used by editor, audit, and generator |

## 9. Acceptance scenarios

1. A user draws a device, adds pins, names it, saves it, and places it in a
   schematic; wires bind to its pins and survive save/reopen.
2. The user exports the user library and imports it into a second profile; the
   devices appear in the palette and can be placed.
3. The user shares a project without the library; the recipient opens it, sees
   the custom devices, and can place additional instances.
4. A project saved before this feature (schema v3) opens and saves as v4 without
   losing content.
5. The built-in pin audit still exports corrections with the same document
   shape.
6. The renderer has no new Node.js, filesystem, or network access; all audits
   pass.

## 10. Open questions

- Should selected-device export ship with the manager (PR 2) or the polish
  phase (PR 4)? Current recommendation: PR 4.
- Should an embedded device be editable in place? Current recommendation: no;
  copy it into the user library first.
- Should the project offer an "embed devices" toggle on save? Current
  recommendation: no; always embed referenced non-built-in devices.
- Should the editor support rotation of primitives in v1? Current
  recommendation: yes for whole-device placement only; primitive rotation is out
  of scope.

## Appendix A — data sketches

User library file:

```json
{
  "format": "drawic-device-library",
  "schemaVersion": 1,
  "id": "drawic-user",
  "title": "Custom devices",
  "revision": "sha256(devices)",
  "source": { "collection": "user", "manifestVersion": 1, "entryCount": 1 },
  "devices": []
}
```

Project embedding:

```json
{
  "schemaVersion": 4,
  "kind": "drawic-drawing",
  "embeddedLibrary": {
    "format": "drawic-device-library",
    "schemaVersion": 1,
    "id": "drawic-embedded",
    "title": "Embedded devices",
    "revision": "sha256(devices)",
    "source": { "collection": "embedded", "manifestVersion": 1, "entryCount": 1 },
    "devices": []
  },
  "pages": []
}
```

## Appendix B — ADR 014 outline

ADR 014 records these decisions:

1. Three library layers with built-in, embedded, then user resolution order.
2. Built-in devices are immutable and cannot be overridden.
3. One user library file per installation, with explicit save and narrow IPC.
4. Projects embed referenced non-built-in device snapshots when saved.
5. The library format gains optional editable primitives in schema version 2;
   the rendered body is regenerated from them.
6. Custom content is sanitized on every untrusted read path.
7. The device editor is intentionally limited to the primitive set above.
