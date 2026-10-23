# Drawic 0.2.1 — Unsigned Preview

This preview focuses on making schematic editing feel direct and predictable.
It publishes one Windows x64 application ZIP while the Windows workflow is
stabilizing.

## Highlights

- Device rotation, mirroring, and movement now keep connected wire endpoints on
  their pins, including a live wire preview while a device drag is in progress.
- Automatic orthogonal routing avoids other devices and drawing shapes, while
  preferring direct or minimum-bend paths.
- Every wire segment has a handle, including pin-bound segments. Manual edits
  preserve both electrical endpoints.
- Text, net labels, rectangles, and ellipses can be moved directly on the canvas,
  edited in place with a double-click, and resized with corner handles.
- Component reference and value labels can be selected and moved independently,
  renamed in place, hidden with Delete, and restored from Properties.
- Ports are emphasized only while the Wire tool is active.
- Mouse-wheel zoom is direct and pointer-centered. Press `F` to fit the page.
- Device-library previews preserve transparent symbol interiors and visible
  internal text, fixing blank-looking blocks for components such as D Flip-Flop.

## Validation

The release pipeline runs strict TypeScript checks, 57 automated tests, offline
and clean-room audits, renderer and desktop builds, Windows ZIP packaging, and
a packaged Electron smoke test before publishing.

## Unsigned Windows Preview

This release contains one Windows x64 application ZIP. Windows SmartScreen may
warn because the executable and ZIP are unsigned. Verify the download against
`SHA256SUMS.txt` before running it.

## Known limitations

- Automatic routing treats devices, rectangles, and ellipses as obstacles; it
  does not route around other wires or text.
- Text editing is plain text without rich formatting or rotated edit boxes.
- Multiple drawing shapes cannot yet be resized as one group.
- macOS and Linux release packages are paused while the Windows preview workflow
  is evaluated.
