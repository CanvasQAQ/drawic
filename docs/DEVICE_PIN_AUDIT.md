# Device pin direction audit

The Device pin audit screen is a local developer review tool for the bundled
device library. It does not edit the active project or write the generated
library directly.

## Open the audit

Select **Pin audit** in the main toolbar. The screen shows every built-in
device with:

- the sanitized device artwork;
- the visible-ink selection box generated from that artwork;
- every normalized pin contact point;
- a teal arrow in the configured outward escape direction.

Automatic routing uses that arrow direction for the mandatory 20-unit pin
escape. An arrow must leave the visible lead and point away from the device
body. Use search, category, changed-only, and position-warning filters to spot
likely mistakes.

## Record corrections

Change a pin's direction with the four-direction selector in its row. The
preview updates immediately. A `position` flag means the stored contact point
is not on the selected overall visible-ink edge. Some valid pins sit just
inside decorative artwork, so use the arrow as the final visual check. A flag
is expected after changing direction because pin coordinates are recalculated
when the library is rebuilt.

The Device pin audit stores changes only for the current audit session. Choose
**Export corrections** to write a JSON document containing changed pins only.
The document has this shape:

```json
{
  "format": "drawic-pin-direction-audit",
  "schemaVersion": 1,
  "reviewedAt": "2026-10-24T00:00:00.000Z",
  "source": {
    "manifestFile": "src/renderer/assets/device-symbols/manifest.json",
    "libraryId": "drawic-built-in",
    "libraryRevision": "<generated library revision at review time>"
  },
  "reviewedPinCount": 365,
  "corrections": [
    {
      "deviceId": "example-device",
      "deviceTitle": "Example Device",
      "pinId": "IN",
      "pinName": "Input",
      "from": "west",
      "to": "north"
    }
  ]
}
```

## Apply a correction document

1. Open `src/renderer/assets/device-symbols/manifest.json`.
2. For each correction, find the entry with `id === deviceId` and the pin with
   `key === pinId`.
3. Change that pin's `side` from `from` to `to`.
4. Run `npm run build:devices`. Do not hand-edit the generated library JSON.
5. Review the regenerated pin contact points and selection boxes.
6. Run the device library, routing, canvas interaction, and pin audit tests.

`selectionBox` is generated from visible artwork and is consumed by canvas
selection and marquee hit testing. `frame` remains the device coordinate frame
used for placement, transforms, and routing obstacles.
