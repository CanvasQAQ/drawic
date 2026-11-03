# ADR 014: User device libraries and project embedding

Status: accepted, 2026-11-01

Related: [ADR 001](001-layered-security.md),
[ADR 005](005-pages-and-single-file-device-library.md), and
[DEVICE_LIBRARY_PLAN.md](../DEVICE_LIBRARY_PLAN.md).

## Context

Drawic ships one generated, immutable device library. Components reference
devices by stable `symbolId`, and wires bind to `deviceId + pinId`. A user cannot
add devices, and a project that references a device outside the built-in library
cannot be opened elsewhere. The pin audit screen is a developer review tool and
does not persist device edits.

The product needs local authoring of custom devices, sharing of device
libraries, and portability of projects that use them.

## Decision

1. Device libraries have three layers:
   - **built-in**: generated and immutable, shipped with the application;
   - **user**: one `user.drawiclib.json` file under
     `app.getPath("userData")/device-libraries/`;
   - **embedded**: an optional per-project snapshot.
   Resolution order for a `symbolId` is built-in, embedded, user, then missing.
   A built-in ID can never be overridden.
2. The user library uses the existing `drawic-device-library` format and
   contains only custom devices. Imports and saves are validated with the core
   parser, and untrusted artwork is sanitized before use.
3. The main process owns the user library file. The renderer uses four narrow
   bridge operations: load, save, import, and export. Main validates the sender,
   payload, and size, and writes atomically. No generic filesystem API is
   exposed.
4. Projects use document schema version 4 and may carry an optional
   `embeddedLibrary`. On save, the renderer embeds only referenced non-built-in
   devices. A normal save keeps the existing embedded record for each device
   and uses the user library for devices without a snapshot.
   Version 3 documents are accepted and normalized to 4;
   future versions are rejected.
5. The embedded snapshot wins over the local user library for the same ID, so a
   shared project renders the same way for its recipient. Refreshing a project
   snapshot from the user library requires **Refresh project devices**.
6. Editable device artwork extends the library format to schema version 2 with
   optional `artwork.shapes` made of constrained primitives. The rendered SVG
   body is regenerated from those primitives. Built-in records have no editable
   source and remain immutable. Cloning preserves the SVG geometry in a new
   user record. That copy exposes allowlisted SVG element attributes in the
   editor; edits use the same undo history, draft save, and library persistence
   as primitive artwork without converting or approximating the original paths.
   When new primitives are drawn over a copied SVG, `artwork.baseBody` retains
   the original fragment and `artwork.shapes` retains the editable primitives.
   The rendered body is reconstructed from both on load. New primitive geometry
   snaps to the 1-unit grid; new or moved pins snap to the 10-unit grid.
   Existing imported contacts remain at their recorded positions until moved.
7. Device creation is limited to the primitive set documented in the plan. The
   editor is not a general-purpose vector editor.

## Consequences

- Custom devices are local-first and portable through library export or project
  embedding.
- A project opened without the author's library still renders and connects when
  it was saved with an embedded snapshot.
- Editing a device in the user library does not retroactively change saved
  projects.
- The device library format and the project format now have explicit version
  compatibility rules that must be tested.
- draw.io public format and behavior documentation informed the interoperability
  design. No source, tests, styles, or internal structures were inspected.
