# Drawic v0.1.1 — Unsigned Preview

This patch release adds an automatically packaged Windows x64 application ZIP
alongside the existing NSIS installer and portable EXE.

## Windows downloads

- `Drawic-0.1.1-Unsigned-Preview-windows-x64.zip`: unpack and run without an
  installer. This is the recommended download when a browser blocks direct EXE
  downloads.
- `Drawic-0.1.1-Unsigned-Preview-windows-x64-setup.exe`: NSIS installer.
- `Drawic-0.1.1-Unsigned-Preview-windows-x64-portable.exe`: single portable EXE.

The ZIP itself is not code-signed. Files inside remain unsigned, so Windows
SmartScreen may still show an “Unknown publisher” warning when the application
is launched. This cannot be removed without a trusted Windows code-signing
certificate.

## Other platforms

- macOS x64 and arm64 DMG/ZIP packages remain unsigned.
- Linux x64 AppImage, DEB, and tar.gz packages remain unsigned.
- Verify all downloads with `SHA256SUMS.txt`.

## Application scope

Drawic 0.1.1 contains the same local-first editing, recovery, SPICE, ERC, and
SVG/PNG/PDF export capabilities as 0.1.0. There is no cloud service, telemetry,
or runtime network access.
