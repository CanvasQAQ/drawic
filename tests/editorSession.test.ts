// @vitest-environment node
import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { EditorSession } from "../src/core/editorSession";
import { allWires, createDocument } from "../src/core/model";
import { undoHistory, redoHistory } from "../src/core/history";
import { buildConnectivity, pinGraphKey } from "../src/core/connectivity";
import { loadDeviceLibrary, parseDeviceLibrary } from "../src/core/library";
import { nodePinPosition } from "../src/core/geometry";
import { resolveWirePoints } from "../src/core/wireMotion";
import { findNetGraphViolations } from "../src/core/netGraph";
import { twoPinSymbol } from "./fixtures";

it("checks and commits a versioned batch once, including after undo and project replacement", () => {
  const initial = createDocument({pageId:"page"});
  const session = new EditorSession(initial);
  const request = {tool:"edit_page",pageId:"page",requestId:"batch",sessionId:session.sessionId,expectedRevision:0,
    operations:[
      {type:"place",id:"a",symbolId:"resistor",x:0,y:0},
      {type:"place",id:"b",symbolId:"resistor",x:100,y:0},
      {type:"connect",id:"w",start:{deviceId:"a",pinId:"1"},end:{deviceId:"b",pinId:"2"}},
    ]};
  const run = (input:unknown,busy=false) => session.request(input,"page",[{...twoPinSymbol,palette:true}],busy);
  expect(()=>run(request,true)).toThrow("busy");
  expect(()=>run({...request,operations:[...request.operations,{type:"place",id:"a",symbolId:"resistor",x:10,y:0}]})).toThrow("duplicate");
  expect(session.snapshot().present).toBe(initial);
  expect(run(request)).toMatchObject({committedRevision:1,replayed:false});
  expect(session.snapshot().past).toHaveLength(1);
  expect(()=>run({...request,requestId:"other"})).toThrow("revision_conflict");
  expect(()=>run({...request,operations:request.operations.slice(1)})).toThrow("request_id_reused");
  session.update(undoHistory);
  expect(session.snapshot().present).toBe(initial);
  expect(run(request)).toMatchObject({committedRevision:1,revision:2,replayed:true});
  session.update(redoHistory);
  expect(session.snapshot().present.pages[0]?.nets[0]?.wires).toHaveLength(1);
  session.replace(initial);
  expect(()=>run(request)).toThrow("stale_session");
});

it("places and transforms oriented connected devices atomically with revision and replay safety", () => {
  const session = new EditorSession(createDocument({ pageId: "page" }));
  const library = [{ ...twoPinSymbol, palette: true }];
  const run = (operations: unknown[], requestId: string, expectedRevision = session.revision) =>
    session.request({ tool: "edit_page", pageId: "page", sessionId: session.sessionId,
      expectedRevision, requestId, operations }, "page", library, false);
  const operations = [
    { type: "place", id: "a", symbolId: "resistor", x: 0, y: 0, rotation: 90, mirrored: true },
    { type: "place", id: "b", symbolId: "resistor", x: 100, y: 0, mirroredVertically: true },
    { type: "connect", id: "w", start: { deviceId: "a", pinId: "1" }, end: { deviceId: "b", pinId: "2" } },
  ];
  expect(() => run([{ type: "place", id: "bad", symbolId: "resistor", x: 0, y: 0, rotation: 45 }], "bad"))
    .toThrow();
  expect(() => run([{ type: "transform", id: "missing", x: 10 }], "missing")).toThrow("unknown_node");
  expect(session.revision).toBe(0);
  run(operations, "place");
  const first = session.snapshot().present.pages[0]!;
  expect(first.nodes.map(node => [node.rotation, node.mirrored, node.mirroredVertically ?? false]))
    .toEqual([[90, true, false], [0, false, true]]);
  expect(nodePinPosition(first.nodes[0]!, library[0]!, 0)).toEqual({ x: 20, y: 0 });
  const transform = [{ type: "transform", id: "a", x: 20, y: 40, rotation: 180, mirrored: false,
    mirroredVertically: true }];
  expect(() => run(transform, "stale", 0)).toThrow("revision_conflict");
  expect(() => run([{ type: "transform", id: "a" }], "empty")).toThrow("empty_transform");
  expect(() => run([...transform, { type: "connect", id: "broken", start: { deviceId: "a", pinId: "bad" },
    end: { deviceId: "b", pinId: "1" } }], "atomic")).toThrow("unknown_pin");
  expect(session.revision).toBe(1);
  const result = run(transform, "transform");
  expect(result).toMatchObject({ committedRevision: 2, ids: ["a"] });
  const page = session.snapshot().present.pages[0]!;
  expect(page.nodes[0]).toMatchObject({ x: 20, y: 40, rotation: 180, mirrored: false,
    mirroredVertically: true });
  expect(session.request({ tool: "read_page", symbolId: "resistor" }, "page", library, false))
    .toMatchObject({ orientation: { rotations: [0, 90, 180, 270] },
      nodes: [{ id: "a", mirrored: false, mirroredVertically: true,
        pins: [{ key: "1", ...nodePinPosition(page.nodes[0]!, library[0]!, 0) },
          { key: "2", ...nodePinPosition(page.nodes[0]!, library[0]!, 1) }] },
        { id: "b" }],
      pins: [{ key: "1", side: "north" }, { key: "2", side: "south" }] });
  const wire = allWires(page)[0]!.wire;
  const points = resolveWirePoints(page, library, wire)!;
  const ends = [points[0], points.at(-1)];
  expect(ends).toContainEqual(nodePinPosition(page.nodes[0]!, library[0]!, 0));
  expect(ends).toContainEqual(nodePinPosition(page.nodes[1]!, library[0]!, 1));
  expect(buildConnectivity(page, library).networkIdByPin.get(pinGraphKey("a", 0)))
    .toBe(buildConnectivity(page, library).networkIdByPin.get(pinGraphKey("b", 1)));
  session.update(undoHistory);
  expect(session.snapshot().present.pages[0]!.nodes[0]!.rotation).toBe(90);
  expect(run(transform, "transform", 1)).toMatchObject({ committedRevision: 2, replayed: true });
  session.update(redoHistory);
  expect(session.snapshot().present.pages[0]!.nodes[0]!.rotation).toBe(180);
});

it("builds a five-transistor OTA with oriented pins and verified electrical nets", async () => {
  const data = JSON.parse(await readFile(new URL("../src/renderer/assets/device-libraries/drawic-built-in.drawiclib.json", import.meta.url), "utf8"));
  const library = loadDeviceLibrary(parseDeviceLibrary(data)).symbols;
  const session = new EditorSession(createDocument({ pageId: "page" }));
  const pin = (deviceId: string, pinId: string) => ({ deviceId, pinId });
  const connect = (id: string, a: string, ap: string, b: string, bp: string) =>
    ({ type: "connect", id, start: pin(a, ap), end: pin(b, bp) });
  session.request({ tool: "edit_page", pageId: "page", sessionId: session.sessionId,
    expectedRevision: 0, requestId: "ota", operations: [
      { type: "place", id: "in_l", symbolId: "nmos", x: -120, y: 100 },
      { type: "place", id: "in_r", symbolId: "nmos", x: 120, y: 100, mirrored: true },
      { type: "place", id: "load_l", symbolId: "pmos", x: -120, y: -100, mirrored: true },
      { type: "place", id: "load_r", symbolId: "pmos", x: 120, y: -100 },
      { type: "place", id: "tail", symbolId: "nmos", x: 0, y: 260 },
      connect("wl", "load_l", "D", "in_l", "D"),
      connect("wr", "load_r", "D", "in_r", "D"),
      connect("wg", "load_l", "G", "load_r", "G"),
      connect("wd", "load_l", "G", "load_l", "D"),
      connect("ws1", "in_l", "S", "tail", "D"),
      connect("ws2", "in_r", "S", "tail", "D"),
    ] }, "page", library, false);
  const page = session.snapshot().present.pages[0]!;
  const graph = buildConnectivity(page, library);
  const net = (id: string, key: string) => {
    const node = page.nodes.find(item => item.id === id)!;
    const symbol = library.find(item => item.id === node.symbolId)!;
    return graph.networkIdByPin.get(pinGraphKey(id, symbol.pins.findIndex(item => item.key === key)));
  };
  expect(page.nodes).toHaveLength(5);
  expect(allWires(page).length).toBeGreaterThanOrEqual(6);
  const position = (id: string, key: string) => {
    const node = page.nodes.find(item => item.id === id)!;
    const symbol = library.find(item => item.id === node.symbolId)!;
    return nodePinPosition(node, symbol, symbol.pins.findIndex(item => item.key === key));
  };
  expect(position("in_l", "G").x).toBeLessThan(page.nodes.find(item => item.id === "in_l")!.x);
  expect(position("in_r", "G").x).toBeGreaterThan(page.nodes.find(item => item.id === "in_r")!.x);
  expect(position("load_l", "G").x).toBeGreaterThan(page.nodes.find(item => item.id === "load_l")!.x);
  expect(position("load_r", "G").x).toBeLessThan(page.nodes.find(item => item.id === "load_r")!.x);
  expect(net("load_l", "G")).toBe(net("load_r", "G"));
  expect(net("load_l", "G")).toBe(net("load_l", "D"));
  expect(net("load_l", "D")).toBe(net("in_l", "D"));
  expect(net("load_r", "D")).toBe(net("in_r", "D"));
  expect(net("in_l", "S")).toBe(net("in_r", "S"));
  expect(net("in_l", "S")).toBe(net("tail", "D"));
  expect(net("in_l", "G")).not.toBe(net("in_r", "G"));
  expect(net("load_l", "D")).not.toBe(net("load_r", "D"));
  expect(findNetGraphViolations(page)).toEqual([]);
  for (const { wire } of allWires(page)) {
    const path = resolveWirePoints(page, library, wire)!;
    expect(path.every((point, index) => index === 0 || point.x === path[index - 1]!.x || point.y === path[index - 1]!.y)).toBe(true);
  }
});
