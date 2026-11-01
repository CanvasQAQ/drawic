import { expect, it } from "vitest";
import raw from "../src/renderer/assets/device-libraries/drawic-built-in.drawiclib.json";
import review from "../src/renderer/assets/device-grid/review.json";
import { loadDeviceLibrary, parseDeviceLibrary } from "../src/core/library";
import { createEmptyPage, type Rotation, type SymbolSide, type Wire } from "../src/core/model";
import { nodePinPosition, isOrthogonalPath, transformLocalPoint } from "../src/core/geometry";
import { pinOutwardDirection, resolveWirePoints } from "../src/core/wireMotion";
import { buildSchematicSvg } from "../src/core/export/svg";
import { wirePathData } from "../src/core/wireHops";

const library = loadDeviceLibrary(parseDeviceLibrary(raw));
const outward = { north:{x:0,y:-1}, south:{x:0,y:1}, east:{x:1,y:0}, west:{x:-1,y:0} };

const gates = new Set(["and","nand","or","nor","xor","xnor"].map(name => name+"-gate-4"));

it("keeps contacts on the placement grid except the six centered outputs and all audited pin identities and directions", () => {
  for (const symbol of library.symbols) {
    for (const p of symbol.pins) {
      expect(p.x % 10 === 0).toBe(true);
      expect(gates.has(symbol.id) && p.key === "Y" ? p.y === 5 : p.y % 10 === 0).toBe(true);
    }
  }
  for (const [id, old] of Object.entries(review)) {
    const symbol = library.byId.get(id)!;
    expect(symbol.pins.map(p=>[p.key,p.direction])).toEqual(Object.entries(old.previousPins).map(([key,p])=>[key,p[2]]));
  }
});

it.each([...gates])("%s has four equally spaced straight input leads and a centered output", id => {
  const symbol = library.byId.get(id)!;
  const lines = new DOMParser().parseFromString('<svg>'+symbol.svgBody+'</svg>', "image/svg+xml").querySelectorAll("line");
  const inputs = symbol.pins.filter(p => p.direction === "west");
  expect(inputs.map(p => p.y)).toEqual([-10, 0, 10, 20]);
  for (const pin of inputs) {
    expect([...lines].some(line => Number(line.getAttribute("x1")) === pin.x &&
      Number(line.getAttribute("y1")) === pin.y && Number(line.getAttribute("y2")) === pin.y)).toBe(true);
  }
  expect(symbol.pins.find(p => p.key === "Y")?.y).toBe((inputs[1]!.y + inputs[2]!.y) / 2);
});

it.each(Object.entries(review))("%s keeps old pin-bound wires orthogonal and exports the resolved endpoints", (id, old) => {
  const symbol = library.byId.get(id)!;
  for (const rotation of [0,90,180,270] as Rotation[]) {
    for (const mirrored of [false,true]) for (const mirroredVertically of [false,true]) {
      const node = { id:"n",symbolId:id, reference:"X1", value:"", x:100,y:100, rotation,mirrored,mirroredVertically };
      for (const [index, [key,p]] of Object.entries(old.previousPins).entries()) {
        const before = transformLocalPoint(node,{x:Number(p[0]),y:Number(p[1])});
        const after = nodePinPosition(node,symbol,index);
        const dir = outward[p[2] as SymbolSide];
        const end = transformLocalPoint(node,{x:Number(p[0])+dir.x*50,y:Number(p[1])+dir.y*50});
        const wire: Wire = {id:"wire",start:{kind:"pin",deviceId:"n",pinId:key},end:{kind:"open"},points:[before,end]};
        const page = {...createEmptyPage("old","page"),nodes:[node],nets:[{id:"net",wires:[wire],junctions:[]}]};
        const resolved = resolveWirePoints(page,[symbol],wire)!;
        if (gates.has(id) && key === "Y") {
          expect(after).toEqual(transformLocalPoint(node, {x:symbol.pins[index]!.x, y:5}));
        } else expect(after.x % 10 === 0 && after.y % 10 === 0).toBe(true);
        expect(resolved[0]).toEqual(after);
        expect(resolved.at(-1)).toEqual(end);
        expect(isOrthogonalPath(resolved)).toBe(true);
        const vector = pinOutwardDirection(page,[symbol],{deviceId:"n",pinId:key})!;
        expect(vector.x * (end.x-before.x) + vector.y * (end.y-before.y)).toBe(50);
        expect(buildSchematicSvg(page,[symbol])).toContain('d="'+wirePathData(resolved)+'"');
      }
    }
  }
});
