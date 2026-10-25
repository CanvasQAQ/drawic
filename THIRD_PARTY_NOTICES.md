# Third-party notices

## Drawic original code

Copyright © 2026 CanvasQAQ. Released under the MIT License in `LICENSE`.

## Device symbol artwork

The bundled static device SVG collection was supplied to this project by
CanvasQAQ on 2026-10-24 and is used under the repository owner's explicit
authorization for Drawic. It is distributed as SVG artwork and pin metadata,
not as source code. File-level SHA-256 values and the exact supplied revision
identifier are recorded in `PROVENANCE.md` and
`src/renderer/assets/device-symbols/asset-lock.json`. The runtime representation
is generated into the single self-contained file
`src/renderer/assets/device-libraries/drawic-built-in.drawiclib.json`.

The supplied package contained no standalone license file. The release owner's
written authorization in the product brief is the documented distribution
basis. Redistributors should preserve this notice and provenance ledger.

## Runtime software

Drawic packages the following principal open-source components. Full license
texts and transitive notices are included by each package in the installed
application where required by that package.

- Electron — MIT — https://github.com/electron/electron
- React and React DOM — MIT — https://github.com/facebook/react
- Lexical, `@lexical/react`, and `@lexical/rich-text` — MIT —
  https://github.com/facebook/lexical
- Chromium and its bundled third-party components — notices are shipped with
  Electron's distributable.
- Vite — MIT — https://github.com/vitejs/vite
- esbuild — MIT — https://github.com/evanw/esbuild
- TypeScript — Apache-2.0 — https://github.com/microsoft/TypeScript
- Vitest — MIT — https://github.com/vitest-dev/vitest
- electron-builder — MIT — https://github.com/electron-userland/electron-builder

Build-time-only packages are not exposed as a network service by Drawic.

## Standards and documentation

References to SPICE syntax and SVG, PNG, and PDF formats describe public
interchange conventions. No third-party sample circuit, icon set, typeface, or
documentation text is bundled.
