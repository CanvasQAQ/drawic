# ADR 001: Layered desktop boundary

Status: accepted, 2026-10-23

## Decision

Drawic separates pure schematic behavior from desktop privileges:

1. `core` is platform-neutral TypeScript with no Electron, filesystem, network, or
   DOM dependency.
2. `renderer` is React and SVG with Node integration disabled, context isolation
   enabled, and Chromium sandboxing enabled.
3. `preload` exposes only a fixed, typed bridge.
4. `main` owns native dialogs, file reads/writes, recovery, formatting, and the
   lifecycle of the window.

The main process also rejects any non-local navigation, denies new windows and
permissions, and cancels HTTP(S), WebSocket, and WebSocket-secure requests at the
session boundary.

## Consequences

Renderer compromise cannot directly access files or spawn processes. Every file
operation requires an explicit native selection except recovery data under
Drawic's user-data directory. New privileged features must add a narrow bridge
operation and tests; they may not expose a generic filesystem or shell API.
