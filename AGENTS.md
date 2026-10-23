# Drawic agent entrypoint

This file is mandatory reading for every implementation agent working in this
repository. Read [docs/AGENT_WORKFLOW.md](docs/AGENT_WORKFLOW.md) before changing
code.

## Project

Drawic is an original, local-first, offline desktop schematic and drawing editor
built with Electron, TypeScript, React, SVG, Vite, Vitest, and electron-builder.

The current document model uses independent drawing pages. There is no Cell,
Top page, or hierarchy. Version `0.2.0` introduced a single-file device library
containing many self-contained device records.

## Non-negotiable rules

1. Preserve the clean-room boundary in `CLEAN_ROOM.md`. Do not inspect or copy
   source, tests, styles, screenshots, or internal structures from comparable
   editors. Public format and platform documentation is allowed.
2. Treat approved device artwork as static visual input. Do not infer product
   architecture from its source package.
3. Never add runtime network access. The Electron session must continue to block
   HTTP(S) and WebSocket requests, and renderer CSP must retain
   `connect-src 'none'`.
4. Renderer code must not gain Node.js, filesystem, shell, or arbitrary IPC
   access. Add only narrow typed operations to the preload bridge.
5. Do not commit credentials, signing certificates, tokens, user data, absolute
   developer paths, host names, or local environment files.
6. Do not hand-edit the generated
   `src/renderer/assets/device-libraries/drawic-built-in.drawiclib.json`.
   Update its generator and regenerate it.
7. Do not use destructive Git commands or overwrite another agent's work.
8. Every behavior change needs a focused test or a documented reason why an
   automated test is not practical.

## Before editing

```bash
git status --short --branch
npm ci --include=dev
npm run typecheck
npm test
```

Read the relevant ADR under `docs/adr/` before changing document structure,
connectivity, security boundaries, the visual language, or the device library.

## Required validation

At minimum, code changes must pass:

```bash
npm run typecheck
npm test
npm run verify:offline
npm run verify:clean-room
npm run build
```

Changes affecting Electron startup or packaged resources must also pass the
packaged smoke test on the relevant platform. Use `xvfb-run` on headless Linux.

## Handoff requirement

End every task with:

- the user-visible outcome;
- changed files or modules;
- exact validation commands and results;
- known limitations or follow-up work;
- whether anything was committed, tagged, or released.

Detailed architecture, file ownership, testing, release, and troubleshooting
instructions live in [docs/AGENT_WORKFLOW.md](docs/AGENT_WORKFLOW.md).
