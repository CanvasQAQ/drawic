# Browser preview for Codex

Run `npm run preview:browser` in the repository root. The fixed address is
`http://127.0.0.1:4173/preview.html`. The command binds only to `127.0.0.1` and
fails if port 4173 is already occupied. In Codex, open the side panel's built-in
browser and navigate to that address. Stop the server with Ctrl+C in its terminal.

The preview renders the real React canvas, device palette, library manager, and
device editor. Use **Manage devices**, then **Custom → New device** to reach the
editor, or choose **Edit** on **Preview sensor** to modify its sample artwork.
Its example project and custom device are deterministic. Changes exist
only in the current page session; refreshing restores the sample. A persistent
“预览模式” banner and action feedback identify simulated file and window behavior.
**Save device** updates the in-memory library draft and keeps the editor open.
**Device library** returns to the manager; unsaved device edits prompt to save
or discard. **Save library** would persist the draft in Electron, but is simulated
in browser preview.

This checks layout, theme, pointer interactions, palette browsing, and editor
navigation in a browser. It does not check Electron preload or IPC, native file
dialogs, real persistence, packaged resources, OS window controls, or Electron's
network and CSP enforcement. Use the desktop build and packaged smoke test for
those. The preview has its own HTML entry and development CSP for Vite HMR; the
production renderer entry retains `connect-src 'none'`. Preview files are not
production build inputs and are not included in the Electron package.

The title bar exposes Agent setup in preview, with copyable instructions and an
explicit desktop-only connection notice. No local Agent endpoint is started.
Browse shows an audit-style grid of all matching artwork with pin arrows and
short labels on each card. Clones with SVG artwork expose element geometry editing in the
inspector, while authored primitive devices retain their drawing tools.
