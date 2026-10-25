# Component Name labels

Status: normative, schema version 3, 2026-10-25

This contract describes the visible Name label attached to a placed component.
It is independent of external editor implementation details.

## Electrical and visual facts

The component `reference` field is the electrical Name used by connectivity,
ERC, SPICE, and program APIs. A visual Name derives its characters from that
field and is always bound to the component. Styling changes only update stored
label presentation; changing the Reference itself updates the electrical name
and the derived label together.

Default placement shows the Name and hides the Value. Hiding and showing a
label never creates a second label object.

## Default placement

For visible artwork and pins, let the unpadded world-space ink rectangle be
`left`, `right`, `top`, `bottom`, with center `(centerX, centerY)`. Let `F` be
the effective Name font size, `H = 0.72 * F`, and
`D = 0.76 * 0.44 * F`:

| Side | Baseline x | Baseline y | Anchor |
| --- | --- | --- | --- |
| right | `round(right + 4)` | `round(centerY + H / 2)` | start |
| left | `round(left - 4)` | `round(centerY + H / 2)` | end |
| bottom | `round(centerX)` | `round(bottom + 4 + H)` | middle |
| top | `round(centerX)` | `round(top - 4 - D)` | middle |

Coordinates use the world canvas with y increasing downward. Placement is not
snapped to the wire grid.

## Render and persistence

Text remains horizontal under all rotations and mirrors. Default labels reflow
from transformed ink bounds; manually positioned labels retain their world
coordinates. Pure translation moves every label by the component displacement.
The computed position, alignment, visibility, and style are persisted.

GUI placement retains the default preview position. Agent placement may choose
another side or slide along it when the Name/Value group intersects component
ink, wires, junctions, other labels, text, or drawing shapes, or is enclosed by
wires.

## Standard Reference appearance

- `M1`, `R12`, and similar forms: bold italic base plus bold upright subscript.
- `M_TAIL`: `M` base plus `TAIL` subscript; the underscore is not displayed.
- `XU0`, `OA1`: all prefix letters form the base and trailing digits are the
  subscript.
- A leading Greek character is the base and the remainder is the subscript.
- Unmatched forms remain ordinary text.

The default Name font size is `15.116`. Document typography scale and the
individual label scale both multiply it. Rich subscripts use scale `0.76`,
horizontal gap `0.046 em`, and baseline drop `0.44 em`.
