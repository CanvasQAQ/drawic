/**
 * Quick swatches shared by the canvas context menu and the Properties panel.
 * Shape presets set a fill/stroke pair (and text color for Notes) in one click;
 * the panel still offers a native color picker for anything custom.
 */

export const COLOR_PRESETS = [
  "#263d48",
  "#0f766e",
  "#1d4ed8",
  "#b42318",
  "#7e22ce",
  "#15803d",
  "#b45309",
  "#475569",
] as const;

export const COLOR_SWATCHES = COLOR_PRESETS.map((value) => ({
  value,
  label: `Use ${value}`,
}));

export interface ShapePalettePreset {
  id: string;
  label: string;
  fill: string;
  stroke: string;
  text: string;
}

export const SHAPE_PALETTE: readonly ShapePalettePreset[] = [
  {
    id: "paper",
    label: "Paper",
    fill: "#ffffff",
    stroke: "#263d48",
    text: "#263d48",
  },
  {
    id: "note",
    label: "Note",
    fill: "#f2c777",
    stroke: "#b98433",
    text: "#6b4d20",
  },
  {
    id: "cool",
    label: "Cool",
    fill: "#dce9f2",
    stroke: "#4f738c",
    text: "#24455c",
  },
  {
    id: "mint",
    label: "Mint",
    fill: "#dfeee0",
    stroke: "#5f8a63",
    text: "#2f5a35",
  },
  {
    id: "rose",
    label: "Rose",
    fill: "#f6dfe2",
    stroke: "#b0606c",
    text: "#7a3640",
  },
  {
    id: "slate",
    label: "Slate",
    fill: "#e4e7ea",
    stroke: "#5b6b76",
    text: "#33424c",
  },
];
