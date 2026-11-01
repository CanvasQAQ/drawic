// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  arcPath,
  artworkFullBounds,
  defaultLabelAnchors,
  formatArtworkNumber,
  moveShape,
  parseDeviceArtworkShapes,
  scaleShape,
  selectionBoxForArtwork,
  serializeDeviceArtwork,
  snapPinToFrame,
  validateDeviceArtwork,
  type DeviceArtworkShape,
  type DevicePinLike,
} from "../src/core/deviceArtwork";

function pin(overrides: Partial<DevicePinLike> = {}): DevicePinLike {
  return {
    id: "pin-1",
    key: "1",
    name: "1",
    role: "passive",
    direction: "west",
    side: "west",
    x: -20,
    y: 0,
    ...overrides,
  };
}

const rect: DeviceArtworkShape = {
  id: "shape-1",
  kind: "rect",
  x: -10,
  y: -8,
  width: 20,
  height: 16,
};

describe("device artwork model", () => {
  it("serializes shapes deterministically with theme-aware strokes", () => {
    const body = serializeDeviceArtwork([rect]);
    expect(body).toBe(
      '<g fill="none" stroke="currentColor" stroke-linecap="butt" stroke-linejoin="miter"><rect x="-10" y="-8" width="20" height="16" stroke-width="1.6"/></g>',
    );
    expect(serializeDeviceArtwork([rect])).toBe(body);
  });

  it("escapes text and preserves stroke widths", () => {
    const body = serializeDeviceArtwork([
      {
        id: "shape-2",
        kind: "text",
        x: 4,
        y: -6,
        text: '<V+ & "out">',
        fontSize: 8,
        anchor: "start",
        strokeWidth: 1,
      },
    ]);
    expect(body).toContain("&lt;V+ &amp; &quot;out&quot;&gt;");
    expect(body).toContain('stroke="none"');
  });

  it("formats numbers without floating-point noise", () => {
    expect(formatArtworkNumber(1.23456)).toBe("1.235");
    expect(formatArtworkNumber(-0)).toBe("0");
    expect(formatArtworkNumber(4)).toBe("4");
  });

  it("computes bounds including pins and selection padding", () => {
    const bounds = artworkFullBounds([rect], [pin()], { x: 0, y: 0 });
    expect(bounds).toEqual({ x: -20, y: -8.8, width: 30.8, height: 17.6 });
    const selection = selectionBoxForArtwork([rect], [pin()], { x: 0, y: 0 });
    expect(selection.x).toBeLessThanOrEqual(-20);
    expect(selection.x + selection.width).toBeGreaterThan(10);
    const anchors = defaultLabelAnchors(selection);
    expect(anchors.reference.anchor).toBe("start");
    expect(anchors.value.y).toBeGreaterThan(anchors.reference.y);
  });

  it("projects pins onto the nearest frame edge on a 10-unit grid", () => {
    const frame = { x: -20, y: -20, width: 40, height: 40 };
    expect(snapPinToFrame({ x: 15, y: 2 }, frame)).toEqual({
      x: 20,
      y: 0,
      direction: "east",
    });
    expect(snapPinToFrame({ x: -4, y: -18 }, frame)).toEqual({
      x: 0,
      y: -20,
      direction: "north",
    });
    expect(snapPinToFrame({ x: 0, y: 30 }, frame)).toEqual({
      x: 0,
      y: 20,
      direction: "south",
    });
    expect(snapPinToFrame({ x: 3, y: -23 }, { x: -24, y: -24, width: 48, height: 48 })).toEqual({
      x: 0,
      y: -20,
      direction: "north",
    });
  });

  it("moves and scales primitives around an anchor", () => {
    expect(moveShape(rect, { x: 5, y: -3 })).toMatchObject({
      x: -5,
      y: -11,
    });
    expect(scaleShape(rect, { x: 0, y: 0 }, 2, 0.5)).toMatchObject({
      x: -20,
      y: -4,
      width: 40,
      height: 8,
    });
    const arc = arcPath({
      id: "arc",
      kind: "arc",
      cx: 0,
      cy: 0,
      r: 10,
      startAngle: 0,
      endAngle: 90,
    });
    expect(arc).toContain("A 10 10 0 0 1");
  });

  it("parses every supported primitive and rejects bad shapes", () => {
    const shapes = parseDeviceArtworkShapes([
      rect,
      { id: "line", kind: "line", x1: 0, y1: 0, x2: 5, y2: 5 },
      {
        id: "poly",
        kind: "polyline",
        points: [
          { x: 0, y: 0 },
          { x: 5, y: 5 },
        ],
      },
      { id: "circle", kind: "circle", cx: 0, cy: 0, r: 4 },
      { id: "ellipse", kind: "ellipse", cx: 0, cy: 0, rx: 4, ry: 2 },
      {
        id: "arc",
        kind: "arc",
        cx: 0,
        cy: 0,
        r: 4,
        startAngle: 0,
        endAngle: 180,
      },
      { id: "text", kind: "text", x: 0, y: 0, text: "IN" },
    ]);
    expect(shapes).toHaveLength(7);
    expect(() =>
      parseDeviceArtworkShapes([rect, { ...rect }]),
    ).toThrow(/duplicate id/i);
    expect(() =>
      parseDeviceArtworkShapes([{ ...rect, width: 0 }]),
    ).toThrow(/positive size/i);
    expect(() => parseDeviceArtworkShapes([])).toThrow(/at least one/i);
    expect(() =>
      parseDeviceArtworkShapes([{ id: "bad", kind: "polygon" }]),
    ).toThrow(/unsupported/i);
  });

  it("validates shape, pin, and frame constraints", () => {
    const frame = { x: -20, y: -20, width: 40, height: 40 };
    expect(validateDeviceArtwork([rect], [pin()], frame)).toEqual([]);
    expect(
      validateDeviceArtwork([], [], frame),
    ).toEqual(
      expect.arrayContaining([
        "Draw at least one artwork shape.",
        "Add at least one pin.",
      ]),
    );
    expect(
      validateDeviceArtwork([rect], [pin({ x: 30 })], frame),
    ).toContain("Pin pin-1 is outside the frame.");
    expect(
      validateDeviceArtwork(
        [rect],
        [pin(), pin({ id: "pin-2" })],
        frame,
      ),
    ).toContain("Pin pin-2 shares a contact point with another pin.");
    expect(
      validateDeviceArtwork([rect], [pin()], { x: -2, y: -2, width: 4, height: 4 }),
    ).toEqual(expect.arrayContaining([expect.stringMatching(/at least 8/i)]));
    expect(
      validateDeviceArtwork([rect], [pin({ x: -15 })], frame, { pinGrid: 10 }),
    ).toContain("Pin pin-1 must sit on the 10-unit grid.");
  });
});
