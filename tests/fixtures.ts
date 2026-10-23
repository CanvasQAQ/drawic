import {
  createDocument,
  createEmptyCell,
  type DrawicDocument,
  type SymbolDefinition,
  type SymbolPin,
} from "../src/core/model";

export const twoPinSymbol: SymbolDefinition = {
  id: "resistor",
  label: "Resistor",
  category: "passive",
  electrical: true,
  palette: true,
  frame: { x: -10, y: -20, width: 20, height: 40 },
  pins: [
    { key: "1", role: "passive", side: "north" },
    { key: "2", role: "passive", side: "south" },
  ],
  file: "resistor.svg",
  svgBody: '<line x1="0" y1="-20" x2="0" y2="20" stroke="#000"/>',
};

export const sourceSymbol: SymbolDefinition = {
  id: "voltage-source",
  label: "Voltage Source",
  category: "source",
  electrical: true,
  palette: true,
  frame: { x: -12, y: -20, width: 24, height: 40 },
  pins: [
    { key: "+", role: "positive", side: "north" },
    { key: "-", role: "negative", side: "south" },
  ],
  file: "voltage-source.svg",
  svgBody: '<circle cx="0" cy="0" r="15" fill="none" stroke="#000"/>',
};

export const groundSymbol: SymbolDefinition = {
  id: "ground",
  label: "Ground",
  category: "power",
  electrical: true,
  palette: true,
  frame: { x: -12, y: -8, width: 24, height: 16 },
  pins: [{ key: "GND", role: "power", side: "north" }],
  file: "ground.svg",
  svgBody: '<path d="M -12 0 L 12 0 M -8 5 L 8 5" stroke="#000"/>',
};

export const capacitorSymbol: SymbolDefinition = {
  ...twoPinSymbol,
  id: "capacitor",
  label: "Capacitor",
  file: "capacitor.svg",
};

export const opampSymbol: SymbolDefinition = {
  id: "opamp",
  label: "Operational Amplifier",
  category: "analog-block",
  electrical: false,
  palette: true,
  frame: { x: -30, y: -30, width: 60, height: 60 },
  pins: [
    { key: "IN+", role: "input", side: "west" },
    { key: "IN-", role: "input", side: "west" },
    { key: "OUT", role: "output", side: "east" },
  ],
  file: "opamp.svg",
  svgBody: '<path d="M -30 -30 L -30 30 L 30 0 Z" fill="none" stroke="#000"/>',
};

export const testLibrary = [
  twoPinSymbol,
  sourceSymbol,
  groundSymbol,
  capacitorSymbol,
  opampSymbol,
];

export function fixtureDocument(): DrawicDocument {
  const cell = createEmptyCell("Main", true, "cell_main");
  return {
    ...createDocument({
      title: "Fixture",
      now: "2026-10-23T00:00:00.000Z",
      id: "project_test",
      cellId: "cell_main",
    }),
    cells: [cell],
  };
}

export function nodePin(
  x: number,
  y: number,
  symbolId = "resistor",
  rotation: 0 | 90 | 180 | 270 = 0,
  pins: SymbolPin[] = twoPinSymbol.pins,
) {
  return {
    id: `node_${x}_${y}`,
    symbolId,
    reference: "R1",
    value: "1k",
    x,
    y,
    rotation,
    mirrored: false,
    pins,
  };
}
