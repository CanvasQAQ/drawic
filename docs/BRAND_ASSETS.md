# Drawic brand assets

Drawic uses one original MOSFET-based brand mark for the application icon, the
window title bar, the HTML favicon, and the platform installers. No third-party
icon set, icon font, or template is bundled.

The initial concept was supplied by the repository owner as
`drawic-icon.svg` (a MOSFET symbol on a warm paper tile). It was adapted for
production in this repository: the tile received a consistent icon-grid clear
space, the glyph was optically centered, stroke geometry was regularized, and
compact variants were drawn for small raster sizes.

## Source files

| Path | Role |
| --- | --- |
| `build/icon.svg` | Master app icon, 1024 × 1024, transparent outer margin |
| `build/icon-small.svg` | Compact 32 px tile used for 32 px rasters |
| `build/icon-tiny.svg` | Simplified 16 px tile used for 16–24 px rasters |
| `build/icon.png` | 1024 × 1024 PNG rendered from the master |
| `build/icon.icns` | macOS icon set |
| `build/icon.ico` | Windows icon set (16, 24, 32, 48, 64, 128, 256) |
| `build/icons/` | Linux icon theme sizes (16–1024) |
| `src/renderer/public/icon.png` | Runtime window and Dock icon (512) |
| `src/renderer/public/favicon-16.png` | Browser favicon, 16 px |
| `src/renderer/public/favicon-32.png` | Browser favicon, 32 px |
| `src/renderer/components/DrawicMark.tsx` | In-app title-bar mark matching `icon-small.svg` |

## Design specification

- Canvas: 1024 × 1024.
- Tile: rounded square at 80,80 sized 864 × 864 with a 192 px radius.
- Paper gradient: `#FFF6E7` → `#FFEDD6` → `#FFE1B8`.
- Ink gradient for the glyph: `#17324F` → `#0E2236`.
- Glyph: MOSFET gate, channel, drain and source leads, channel arrow, and three
  terminal dots. No text is embedded in the icon.
- Small variants keep the tile full bleed and drop the channel arrow and inner
  detail so the mark remains legible at 16–32 px.
- The in-app mark uses flat colors from the same palette so it stays crisp in
  both themes.

## How the platform files are wired

- `package.json` points Windows at `build/icon.ico`, macOS at
  `build/icon.icns`, and Linux at `build/icons`.
- `src/main/main.ts` sets the runtime window icon from
  `dist/renderer/icon.png` and uses the same file for the macOS Dock while
  running unpackaged.
- `src/renderer/index.html` declares the two favicons and the window title.
- `src/renderer/components/TitleBar.tsx` renders `DrawicMark`.

## Regenerating

The master SVG is the source of truth. Rasterization is a manual, macOS-friendly
step because the repository does not ship a rasterizer dependency. It requires
`rsvg-convert` (librsvg), ImageMagick (`magick`), and `iconutil`.

```bash
# master and Linux icon theme
rsvg-convert -w 1024 -h 1024 build/icon.svg -o build/icon.png
mkdir -p build/icons
rsvg-convert -w 16 -h 16 build/icon-tiny.svg -o build/icons/16x16.png
rsvg-convert -w 24 -h 24 build/icon-tiny.svg -o build/icons/24x24.png
rsvg-convert -w 32 -h 32 build/icon-small.svg -o build/icons/32x32.png
for size in 48 64 128 256 512 1024; do
  rsvg-convert -w "$size" -h "$size" build/icon.svg -o "build/icons/${size}x${size}.png"
done

# Windows ICO
magick build/icons/16x16.png build/icons/24x24.png build/icons/32x32.png \
  build/icons/48x48.png build/icons/64x64.png build/icons/128x128.png \
  build/icons/256x256.png build/icon.ico

# macOS ICNS
mkdir -p build/icon.iconset
cp build/icons/16x16.png build/icon.iconset/icon_16x16.png
rsvg-convert -w 32 -h 32 build/icon-small.svg -o build/icon.iconset/icon_16x16@2x.png
cp build/icon.iconset/icon_16x16@2x.png build/icon.iconset/icon_32x32.png
rsvg-convert -w 64 -h 64 build/icon.svg -o build/icon.iconset/icon_32x32@2x.png
cp build/icons/128x128.png build/icon.iconset/icon_128x128.png
cp build/icons/256x256.png build/icon.iconset/icon_128x128@2x.png
cp build/icons/256x256.png build/icon.iconset/icon_256x256.png
cp build/icons/512x512.png build/icon.iconset/icon_256x256@2x.png
cp build/icons/512x512.png build/icon.iconset/icon_512x512.png
cp build/icons/1024x1024.png build/icon.iconset/icon_512x512@2x.png
iconutil -c icns build/icon.iconset -o build/icon.icns
rm -rf build/icon.iconset

# runtime copy used by the Electron shell and HTML favicon links
cp build/icons/512x512.png src/renderer/public/icon.png
rsvg-convert -w 16 -h 16 build/icon-tiny.svg -o src/renderer/public/favicon-16.png
rsvg-convert -w 32 -h 32 build/icon-small.svg -o src/renderer/public/favicon-32.png
```

`npm test` includes `tests/brandAssets.test.ts`, which checks that the committed
PNG/ICO/ICNS files exist, have valid headers, carry the expected sizes, and
match the icon paths declared in `package.json`.
