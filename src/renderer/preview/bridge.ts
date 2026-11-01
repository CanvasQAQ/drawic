import { addComponent } from "../../core/editor";
import { serializeDeviceArtwork, type DeviceArtworkShape } from "../../core/deviceArtwork";
import { loadDeviceLibrary, parseDeviceLibrary } from "../../core/library";
import { createDocument, serializeProject } from "../../core/model";
import { buildDeviceLibraryFile } from "../../core/deviceLibraryRegistry";
import type { DrawicBridge } from "../../shared/bridge";
import builtInJson from "../assets/device-libraries/drawic-built-in.drawiclib.json";
import { createStarterDevice } from "../components/DeviceLibraryScreen";

const sampleTime = "2026-01-01T00:00:00.000Z";

export function previewProjectText(): string {
  const library = loadDeviceLibrary(parseDeviceLibrary(builtInJson));
  let document = createDocument({
    id: "preview-project",
    pageId: "preview-page",
    title: "Preview Circuit",
    now: sampleTime,
  });
  for (const [id, reference, x, y] of [
    ["resistor", "R1", 80, 60],
    ["capacitor", "C1", 170, 60],
    ["ground", "GND1", 170, 160],
  ] as const) {
    const symbol = library.byId.get(id);
    if (!symbol) throw new Error(`Missing built-in preview device: ${id}`);
    document = addComponent(document, "preview-page", {
      id: `preview-${id}`,
      symbol,
      reference,
      point: { x, y },
      library: library.symbols,
      now: sampleTime,
    });
  }
  return serializeProject(document);
}

export function previewUserLibraryText(): string {
  const shapes: DeviceArtworkShape[] = [
    { id: "preview-ring", kind: "circle", cx: 0, cy: 0, r: 14 },
    { id: "preview-mark", kind: "text", x: 0, y: 4, text: "S", fontSize: 12 },
  ];
  const starter = createStarterDevice("preview-sample-device");
  return JSON.stringify(buildDeviceLibraryFile({
    id: "drawic-preview-user",
    title: "Preview devices",
    collection: "user",
    devices: [{
      ...starter,
      title: "Preview sensor",
      artwork: {
        ...starter.artwork,
        body: serializeDeviceArtwork(shapes),
        shapes,
      },
      pins: [
        { id: "in", key: "IN", name: "IN", role: "input", direction: "west", side: "west", x: -20, y: 0 },
        { id: "out", key: "OUT", name: "OUT", role: "output", direction: "east", side: "east", x: 20, y: 0 },
      ],
    }],
  }));
}

export function createPreviewBridge(notify: (message: string) => void): DrawicBridge {
  const blocked = (action: string) => notify(`预览模式：${action}不会访问或修改真实文件。`);
  const canceled = { canceled: true } as const;
  const unsubscribe = () => undefined;
  return {
    platform: "preview",
    version: "preview",
    openProject: async () => { blocked("打开项目"); return null; },
    saveProject: async () => { blocked("保存项目"); return canceled; },
    openRecentProject: async () => { blocked("打开最近项目"); return null; },
    getRecentProjects: async () => [],
    exportSchematic: async () => { blocked("导出图纸"); return canceled; },
    importSpice: async () => { blocked("导入 SPICE"); return null; },
    saveSpice: async () => { blocked("导出 SPICE"); return canceled; },
    savePinAudit: async () => { blocked("导出审计"); return canceled; },
    loadUserDeviceLibrary: async () => previewUserLibraryText(),
    saveUserDeviceLibrary: async () => { blocked("保存器件库"); },
    importDeviceLibrary: async () => { blocked("导入器件库"); return canceled; },
    exportDeviceLibrary: async () => { blocked("导出器件库"); return canceled; },
    checkpoint: async () => undefined,
    clearRecovery: async () => undefined,
    getRecovery: async () => null,
    getLaunchProject: async () => ({ path: "Preview Circuit.drawic.json", content: previewProjectText() }),
    setDocumentDirty: () => undefined,
    finishClose: () => blocked("关闭窗口"),
    isWindowMaximized: async () => false,
    minimizeWindow: () => blocked("最小化窗口"),
    toggleWindowMaximize: () => blocked("切换窗口大小"),
    closeWindow: () => blocked("关闭窗口"),
    onCommand: () => unsubscribe,
    onProjectOpen: () => unsubscribe,
    onWindowMaximizedChange: () => unsubscribe,
  };
}
