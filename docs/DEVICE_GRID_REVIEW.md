# Built-in device grid review

Positions are relative to the placed device center in drawing units. All placement contacts use the 10-unit grid except the centered outputs of the six four-input gates. The 28 corrected appearances had 75 originally off-grid contacts. The six four-input gates use straight west-facing leads at y = −10, 0, 10, 20 and place the east output at y = 5. The other 22 use an adjusted SVG viewBox and placement frame. Pin IDs and audited directions are unchanged.

| Appearance | Moved contacts (old → new) |
| --- | --- |
| adc | IN (-45, 0) → (-50, 0) · OUT (45, 0) → (40, 0) |
| adder | A (-20, -4) → (-20, 0) · B (0, 16) → (0, 20) · Y (20, -4) → (20, 0) |
| and-gate-4 | A (-30, -12) → (-40, -10) · B (-30, -4) → (-40, 0) · C (-30, 4) → (-40, 10) · D (-30, 12) → (-40, 20) · Y (20, 0) → (20, 5) |
| ccvs | + (4.5, -20) → (0, -20) · - (4.5, 20) → (0, 20) |
| ccvs--diamond | + (4.5, -20) → (0, -20) · - (4.5, 20) → (0, 20) |
| center-tap-inductor | 1 (-50, -4) → (-50, 0) · 2 (50, -4) → (50, 0) · 3 (0, 16) → (0, 20) |
| d-flip-flop-reset | D (-40, -22.5) → (-40, -20) · CK (-40, -2.5) → (-40, 0) · RST (0, 37.5) → (0, 40) · Q (40, -22.5) → (40, -20) · QBAR (40, -2.5) → (40, 0) |
| dac | IN (-45, 0) → (-50, 0) · OUT (45, 0) → (40, 0) |
| ground | 0 (0, -11.5) → (0, -10) |
| ideal-switch | 1 (-20, 3) → (-20, 0) · 2 (20, 3) → (20, 0) |
| multiplier | A (-20, -4) → (-20, 0) · B (0, 16) → (0, 20) · Y (20, -4) → (20, 0) |
| nand-gate-4 | A (-30, -12) → (-40, -10) · B (-30, -4) → (-40, 0) · C (-30, 4) → (-40, 10) · D (-30, 12) → (-40, 20) · Y (30, 0) → (30, 5) |
| nor-gate-4 | A (-30, -12) → (-40, -10) · B (-30, -4) → (-40, 0) · C (-30, 4) → (-40, 10) · D (-30, 12) → (-40, 20) · Y (30, 0) → (30, 5) |
| npn | C (13, -20) → (10, -20) · B (-17, 0) → (-20, 0) · E (13, 20) → (10, 20) |
| or-gate-4 | A (-30, -12) → (-40, -10) · B (-30, -4) → (-40, 0) · C (-30, 4) → (-40, 10) · D (-30, 12) → (-40, 20) · Y (20, 0) → (20, 5) |
| pnp | C (13, 20) → (10, 20) · B (-17, 0) → (-20, 0) · E (13, -20) → (10, -20) |
| port | P (5, 0) → (0, 0) |
| port-filled | P (5, 0) → (0, 0) |
| pulse-voltage-source | + (4.5, -20) → (0, -20) · - (4.5, 20) → (0, 20) |
| simple-switch | 1 (-20, 3) → (-20, 0) · 2 (20, 3) → (20, 0) |
| tcoil | 1 (-90, 11) → (-90, 10) · 2 (90, 11) → (90, 10) · 3 (0, 31) → (0, 30) |
| vcvs | + (4.5, -20) → (0, -20) · - (4.5, 20) → (0, 20) |
| vcvs--diamond | + (4.5, -20) → (0, -20) · - (4.5, 20) → (0, 20) |
| vdd-port | P (0, 9) → (0, 10) |
| voltage-controlled-switch | P (-20, -10.5) → (-20, -10) · N (20, -10.5) → (20, -10) · CP (-20, 19.5) → (-20, 20) · CN (20, 19.5) → (20, 20) |
| voltage-source | + (4.5, -20) → (0, -20) · - (4.5, 20) → (0, 20) |
| xnor-gate-4 | A (-30, -12) → (-40, -10) · B (-30, -4) → (-40, 0) · C (-30, 4) → (-40, 10) · D (-30, 12) → (-40, 20) · Y (40, 0) → (40, 5) |
| xor-gate-4 | A (-30, -12) → (-40, -10) · B (-30, -4) → (-40, 0) · C (-30, 4) → (-40, 10) · D (-30, 12) → (-40, 20) · Y (30, 0) → (30, 5) |

The review fixture stores the previous pin offsets for rotation, mirror and legacy pin-bound wire tests. Artwork provenance is documented in [PROVENANCE.md](../PROVENANCE.md).
