import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  session,
  type MenuItemConstructorOptions,
} from "electron";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";
import { buildBitmapPdf } from "../core/export/pdf";
import type {
  AppCommand,
  ExportRequest,
  PinAuditExportRequest,
  SaveProjectRequest,
} from "../shared/bridge";
import {
  UNSAVED_CLOSE_PROMPT,
  interpretCloseResponse,
  type CloseChoice,
} from "./closeGuard";
import {
  addProjectExtension,
  atomicWriteFile,
  isDrawicProjectPath,
  readOptionalJson,
  readProjectFile,
  writeJson,
} from "./fileStore";
import {
  WINDOW_DEFAULT_HEIGHT,
  WINDOW_DEFAULT_WIDTH,
  WINDOW_MIN_HEIGHT,
  WINDOW_MIN_WIDTH,
} from "./windowConfig";

interface RecentEntry {
  path: string;
  name: string;
  openedAt: string;
}

interface Settings {
  recent: RecentEntry[];
}

interface RecoveryIndex {
  projectId: string;
  file: string;
  savedAt: string;
}

let mainWindow: BrowserWindow | null = null;
let documentDirty = false;
let allowClose = false;
let closePromptVisible = false;
let launchProjectPath: string | null = null;
let smokeOutput: string | null = null;
let smokeScreenshot: string | null = null;
let smokeMode = false;
let blockedNetworkRequests = 0;

const hasSmokeFlag = process.argv.includes("--smoke-test");
smokeMode = hasSmokeFlag;
for (const argument of process.argv) {
  if (argument.startsWith("--smoke-output=")) {
    smokeOutput = argument.slice("--smoke-output=".length);
  }
  if (argument.startsWith("--smoke-screenshot=")) {
    smokeScreenshot = argument.slice("--smoke-screenshot=".length);
  }
}

function settingsPath(): string {
  return join(app.getPath("userData"), "settings.json");
}

function recoveryDirectory(): string {
  return join(app.getPath("userData"), "recovery");
}

async function loadSettings(): Promise<Settings> {
  const settings = await readOptionalJson<Settings>(settingsPath(), { recent: [] });
  if (!Array.isArray(settings.recent)) {
    return { recent: [] };
  }
  return {
    recent: settings.recent
      .filter(
        (entry): entry is RecentEntry =>
          typeof entry === "object" &&
          entry !== null &&
          typeof entry.path === "string" &&
          typeof entry.name === "string" &&
          typeof entry.openedAt === "string" &&
          isDrawicProjectPath(entry.path),
      )
      .slice(0, 10),
  };
}

async function rememberProject(filePath: string): Promise<void> {
  const settings = await loadSettings();
  const entry: RecentEntry = {
    path: resolve(filePath),
    name: basename(filePath).replace(/\.drawic\.json$/i, ""),
    openedAt: new Date().toISOString(),
  };
  const recent = [entry, ...settings.recent.filter((item) => item.path !== entry.path)].slice(0, 10);
  await writeJson(settingsPath(), { recent });
  rebuildMenu(recent);
}

async function recoveryFile(projectId: string): Promise<string> {
  const safe = projectId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 96) || "project";
  return join(recoveryDirectory(), `${safe}.drawic.json`);
}

function sendCommand(command: AppCommand): void {
  const target = BrowserWindow.getFocusedWindow() ?? mainWindow;
  target?.webContents.send("menu:command", command);
}

function buildMenu(recent: RecentEntry[] = []): Menu {
  const isMac = process.platform === "darwin";
  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: "Drawic",
            submenu: [
              { role: "about" as const },
              { type: "separator" as const },
              { role: "hide" as const },
              { role: "hideOthers" as const },
              { role: "unhide" as const },
              { type: "separator" as const },
              { role: "quit" as const },
            ],
          },
        ]
      : []),
    {
      label: "File",
      submenu: [
        {
          label: "New Project",
          accelerator: "CmdOrCtrl+N",
          click: () => sendCommand("new-project"),
        },
        {
          label: "Open Project…",
          accelerator: "CmdOrCtrl+O",
          click: () => sendCommand("open-project"),
        },
        {
          label: "Open Recent",
          enabled: recent.length > 0,
          submenu:
            recent.length > 0
              ? recent.map((entry) => ({
                  label: `${entry.name} — ${basename(dirname(entry.path))}`,
                  click: async () => {
                    const payload = await openProjectPath(entry.path);
                    if (payload) {
                      mainWindow?.webContents.send("menu:open-project", payload);
                    }
                  },
                }))
              : [{ label: "No recent projects", enabled: false }],
        },
        { type: "separator" },
        {
          label: "Save",
          accelerator: "CmdOrCtrl+S",
          click: () => sendCommand("save-project"),
        },
        {
          label: "Save As…",
          accelerator: "CmdOrCtrl+Shift+S",
          click: () => sendCommand("save-project-as"),
        },
        { type: "separator" },
        {
          label: "Import SPICE…",
          click: () => sendCommand("import-spice"),
        },
        {
          label: "Export SPICE…",
          click: () => sendCommand("export-spice"),
        },
        {
          label: "Export Diagram",
          submenu: [
            { label: "SVG…", click: () => sendCommand("export-svg") },
            { label: "PNG…", click: () => sendCommand("export-png") },
            { label: "PDF…", click: () => sendCommand("export-pdf") },
          ],
        },
        ...(isMac ? [] : [{ type: "separator" as const }, { role: "quit" as const }]),
      ],
    },
    {
      label: "Edit",
      submenu: [
        { label: "Undo", accelerator: "CmdOrCtrl+Z", click: () => sendCommand("undo") },
        {
          label: "Redo",
          accelerator: "CmdOrCtrl+Shift+Z",
          click: () => sendCommand("redo"),
        },
        {
          label: "Delete Selection",
          accelerator: "Delete",
          click: () => sendCommand("delete-selection"),
        },
        {
          label: "Rotate Selection",
          accelerator: "R",
          click: () => sendCommand("rotate-selection"),
        },
        {
          label: "Mirror Selection",
          accelerator: "M",
          click: () => sendCommand("mirror-selection"),
        },
      ],
    },
    {
      label: "View",
      submenu: [
        { label: "Toggle Device Library", click: () => sendCommand("toggle-library") },
        { label: "Toggle Properties", click: () => sendCommand("toggle-properties") },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Tools",
      submenu: [{ label: "Run Electrical Rules", click: () => sendCommand("run-erc") }],
    },
  ];
  return Menu.buildFromTemplate(template);
}

let menuRecent: RecentEntry[] = [];
function rebuildMenu(recent = menuRecent): void {
  menuRecent = recent;
  Menu.setApplicationMenu(buildMenu(menuRecent));
}

async function openProjectPath(filePath: string): Promise<{ path: string; content: string } | null> {
  try {
    if (!isDrawicProjectPath(filePath)) {
      throw new Error("Drawic projects must use the .drawic.json extension.");
    }
    const content = await readProjectFile(filePath);
    await rememberProject(filePath);
    return { path: resolve(filePath), content };
  } catch (error) {
    await dialog.showMessageBox({
      type: "error",
      title: "Could not open project",
      message: error instanceof Error ? error.message : "The file could not be read.",
    });
    return null;
  }
}

async function showOpenDialog(): Promise<{ path: string; content: string } | null> {
  const owner = BrowserWindow.getFocusedWindow() ?? mainWindow ?? undefined;
  const options: Electron.OpenDialogOptions = {
    title: "Open Drawic Project",
    properties: ["openFile"],
    filters: [
      { name: "Drawic project", extensions: ["drawic.json", "json"] },
      { name: "All files", extensions: ["*"] },
    ],
  };
  const result = owner
    ? await dialog.showOpenDialog(owner, options)
    : await dialog.showOpenDialog(options);
  if (result.canceled || !result.filePaths[0]) {
    return null;
  }
  return openProjectPath(result.filePaths[0]);
}

async function rasterizeSvg(svg: string): Promise<Electron.NativeImage> {
  const widthMatch = svg.match(/<svg\b[^>]*\bwidth="([0-9.]+)"/i);
  const heightMatch = svg.match(/<svg\b[^>]*\bheight="([0-9.]+)"/i);
  const width = Math.ceil(Number(widthMatch?.[1]));
  const height = Math.ceil(Number(heightMatch?.[1]));
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0 ||
    width > 8192 ||
    height > 8192 ||
    width * height > 64_000_000
  ) {
    throw new Error("Schematic export dimensions are outside the safe 8192 px limit.");
  }
  const markup = `<!doctype html><html><head><style>
    html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden;background:#fff}
    img{display:block;width:${width}px;height:${height}px}
  </style></head><body><img id="schematic" alt="" src="data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}"></body></html>`;
  const rasterWindow = new BrowserWindow({
    width,
    height,
    useContentSize: true,
    show: false,
    frame: false,
    resizable: false,
    webPreferences: {
      offscreen: true,
      backgroundThrottling: false,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  try {
    await rasterWindow.loadURL(
      `data:text/html;base64,${Buffer.from(markup, "utf8").toString("base64")}`,
    );
    await rasterWindow.webContents.executeJavaScript(`
      (async () => {
        const image = document.getElementById("schematic");
        if (!image.complete) await new Promise((resolve) => {
          image.addEventListener("load", resolve, { once: true });
          image.addEventListener("error", resolve, { once: true });
        });
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        return image.naturalWidth;
      })()
    `);
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 60));
    const image = await rasterWindow.webContents.capturePage({
      x: 0,
      y: 0,
      width,
      height,
    });
    if (image.isEmpty()) {
      throw new Error("Drawic could not rasterize the schematic.");
    }
    return image;
  } finally {
    rasterWindow.destroy();
  }
}

function bgraToRgba(bitmap: Buffer): Uint8Array {
  const copy = new Uint8Array(bitmap.byteLength);
  for (let index = 0; index < bitmap.byteLength; index += 4) {
    copy[index] = bitmap[index + 2] ?? 0;
    copy[index + 1] = bitmap[index + 1] ?? 0;
    copy[index + 2] = bitmap[index] ?? 0;
    copy[index + 3] = bitmap[index + 3] ?? 255;
  }
  return copy;
}

async function exportSchematic(request: ExportRequest): Promise<{
  canceled: boolean;
  path?: string;
  bytes?: number;
}> {
  const extension = request.kind;
  const owner = BrowserWindow.getFocusedWindow() ?? mainWindow ?? undefined;
  const options: Electron.SaveDialogOptions = {
    title: `Export Drawic ${extension.toUpperCase()}`,
    defaultPath: `${request.suggestedName}.${extension}`,
    filters: [{ name: `${extension.toUpperCase()} image`, extensions: [extension] }],
  };
  const result = owner
    ? await dialog.showSaveDialog(owner, options)
    : await dialog.showSaveDialog(options);
  if (result.canceled || !result.filePath) {
    return { canceled: true };
  }

  if (request.kind === "svg") {
    await atomicWriteFile(result.filePath, request.svg);
  } else {
    const image = await rasterizeSvg(request.svg);
    if (request.kind === "png") {
      await atomicWriteFile(result.filePath, image.toPNG());
    } else {
      const size = image.getSize();
      const pdf = buildBitmapPdf({
        width: size.width,
        height: size.height,
        rgba: bgraToRgba(image.toBitmap()),
      });
      await atomicWriteFile(result.filePath, pdf);
    }
  }
  const details = await stat(result.filePath);
  return { canceled: false, path: result.filePath, bytes: details.size };
}

function registerIpc(): void {
  ipcMain.handle("project:open", (event) => {
    if (event.sender !== mainWindow?.webContents) {
      return null;
    }
    return showOpenDialog();
  });
  ipcMain.handle("project:save", async (event, request: SaveProjectRequest) => {
    if (event.sender !== mainWindow?.webContents) {
      throw new Error("Unexpected renderer for save.");
    }
    let target = request.path ? resolve(request.path) : null;
    if (!target) {
      const owner = BrowserWindow.getFocusedWindow() ?? mainWindow ?? undefined;
      const options: Electron.SaveDialogOptions = {
        title: "Save Drawic Project",
        defaultPath: addProjectExtension(request.suggestedName),
        filters: [{ name: "Drawic project", extensions: ["drawic.json"] }],
      };
      const result = owner
        ? await dialog.showSaveDialog(owner, options)
        : await dialog.showSaveDialog(options);
      if (result.canceled || !result.filePath) {
        return { canceled: true };
      }
      target = addProjectExtension(result.filePath);
    }
    await atomicWriteFile(target, request.content);
    await rememberProject(target);
    await rm(join(recoveryDirectory(), "latest.json"), { force: true }).catch(() => undefined);
    return { canceled: false, path: target };
  });
  ipcMain.handle("project:open-recent", async (event, path: string) => {
    if (event.sender !== mainWindow?.webContents) {
      return null;
    }
    const allowed = (await loadSettings()).recent.some(
      (entry) => entry.path === resolve(path),
    );
    return allowed ? openProjectPath(path) : null;
  });
  ipcMain.handle("recent:list", (event) =>
    event.sender === mainWindow?.webContents ? loadSettings().then((value) => value.recent) : [],
  );
  ipcMain.handle("export:schematic", (event, request: ExportRequest) => {
    if (event.sender !== mainWindow?.webContents) {
      throw new Error("Unexpected renderer for export.");
    }
    return exportSchematic(request);
  });
  ipcMain.handle("spice:import", async (event) => {
    if (event.sender !== mainWindow?.webContents) {
      return null;
    }
    const owner = BrowserWindow.getFocusedWindow() ?? mainWindow ?? undefined;
    const options: Electron.OpenDialogOptions = {
      title: "Import SPICE Netlist",
      properties: ["openFile"],
      filters: [
        { name: "SPICE netlist", extensions: ["cir", "sp", "spice", "net", "txt"] },
        { name: "All files", extensions: ["*"] },
      ],
    };
    const result = owner
      ? await dialog.showOpenDialog(owner, options)
      : await dialog.showOpenDialog(options);
    if (result.canceled || !result.filePaths[0]) {
      return null;
    }
    const details = await stat(result.filePaths[0]);
    if (details.size > 10 * 1024 * 1024) {
      throw new Error("SPICE files over 10 MB are not accepted.");
    }
    return {
      path: result.filePaths[0],
      content: await readFile(result.filePaths[0], "utf8"),
    };
  });
  ipcMain.handle(
    "spice:save",
    async (event, request: { suggestedName: string; content: string }) => {
      if (event.sender !== mainWindow?.webContents) {
        throw new Error("Unexpected renderer for SPICE export.");
      }
      const owner = BrowserWindow.getFocusedWindow() ?? mainWindow ?? undefined;
      const options: Electron.SaveDialogOptions = {
        title: "Export SPICE Netlist",
        defaultPath: `${request.suggestedName}.cir`,
        filters: [{ name: "SPICE netlist", extensions: ["cir", "sp", "net"] }],
      };
      const result = owner
        ? await dialog.showSaveDialog(owner, options)
        : await dialog.showSaveDialog(options);
      if (result.canceled || !result.filePath) {
        return { canceled: true };
      }
      await atomicWriteFile(result.filePath, request.content);
      const details = await stat(result.filePath);
      return { canceled: false, path: result.filePath, bytes: details.size };
    },
  );
  ipcMain.handle(
    "pin-audit:save",
    async (event, request: PinAuditExportRequest) => {
      if (event.sender !== mainWindow?.webContents) {
        throw new Error("Unexpected renderer for pin audit export.");
      }
      if (
        typeof request?.suggestedName !== "string" ||
        typeof request.content !== "string" ||
        request.content.length > 5 * 1024 * 1024
      ) {
        throw new Error("Invalid pin audit export.");
      }
      const owner = BrowserWindow.getFocusedWindow() ?? mainWindow ?? undefined;
      const safeName =
        request.suggestedName.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 96) ||
        "drawic-pin-direction-audit";
      const options: Electron.SaveDialogOptions = {
        title: "Export Device Pin Audit",
        defaultPath: `${safeName}.json`,
        filters: [{ name: "Pin direction audit", extensions: ["json"] }],
      };
      const result = owner
        ? await dialog.showSaveDialog(owner, options)
        : await dialog.showSaveDialog(options);
      if (result.canceled || !result.filePath) {
        return { canceled: true };
      }
      const target = result.filePath.toLowerCase().endsWith(".json")
        ? result.filePath
        : `${result.filePath}.json`;
      await atomicWriteFile(target, request.content);
      const details = await stat(target);
      return { canceled: false, path: target, bytes: details.size };
    },
  );
  ipcMain.handle(
    "recovery:checkpoint",
    async (event, request: { projectId: string; content: string }) => {
      if (event.sender !== mainWindow?.webContents) {
        return;
      }
      if (request.content.length > 50 * 1024 * 1024) {
        throw new Error("Recovery checkpoint exceeds the safety limit.");
      }
      await mkdir(recoveryDirectory(), { recursive: true });
      const file = await recoveryFile(request.projectId);
      await atomicWriteFile(file, request.content);
      const index: RecoveryIndex = {
        projectId: request.projectId,
        file: basename(file),
        savedAt: new Date().toISOString(),
      };
      await writeJson(join(recoveryDirectory(), "latest.json"), index);
    },
  );
  ipcMain.handle("recovery:clear", async (event, projectId: string) => {
    if (event.sender !== mainWindow?.webContents) {
      return;
    }
    await rm(await recoveryFile(projectId), { force: true });
    await rm(join(recoveryDirectory(), "latest.json"), { force: true });
  });
  ipcMain.handle("recovery:latest", async (event) => {
    if (event.sender !== mainWindow?.webContents) {
      return null;
    }
    try {
      const index = JSON.parse(
        await readFile(join(recoveryDirectory(), "latest.json"), "utf8"),
      ) as RecoveryIndex;
      if (typeof index.file !== "string" || basename(index.file) !== index.file) {
        return null;
      }
      const content = await readFile(join(recoveryDirectory(), index.file), "utf8");
      return {
        path: join(recoveryDirectory(), index.file),
        content,
        savedAt: index.savedAt,
      };
    } catch {
      return null;
    }
  });
  ipcMain.handle("app:launch-project", async (event) => {
    if (event.sender !== mainWindow?.webContents || !launchProjectPath) {
      return null;
    }
    const target = launchProjectPath;
    launchProjectPath = null;
    return openProjectPath(target);
  });
  ipcMain.on("window:set-dirty", (event, dirty: unknown) => {
    if (event.sender === mainWindow?.webContents && typeof dirty === "boolean") {
      documentDirty = dirty;
    }
  });
  ipcMain.on("window:finish-close", (event) => {
    if (event.sender === mainWindow?.webContents && mainWindow) {
      allowClose = true;
      mainWindow.close();
    }
  });
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: WINDOW_DEFAULT_WIDTH,
    height: WINDOW_DEFAULT_HEIGHT,
    minWidth: WINDOW_MIN_WIDTH,
    minHeight: WINDOW_MIN_HEIGHT,
    show: !smokeMode,
    title: "Drawic",
    backgroundColor: "#111820",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
    },
  });
  mainWindow = window;
  documentDirty = false;
  allowClose = false;

  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  window.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) =>
    callback(false),
  );
  window.on("close", (event) => {
    if (allowClose || !documentDirty) {
      return;
    }
    event.preventDefault();
    if (closePromptVisible) {
      return;
    }
    closePromptVisible = true;
    const response = dialog.showMessageBoxSync(window, UNSAVED_CLOSE_PROMPT);
    closePromptVisible = false;
    const choice: CloseChoice = interpretCloseResponse(response);
    if (choice === "save") {
      sendCommand("save-project-before-close");
    } else if (choice === "discard") {
      allowClose = true;
      window.close();
    }
  });
  window.on("closed", () => {
    if (mainWindow === window) {
      mainWindow = null;
    }
  });

  const rendererPath = join(__dirname, "../renderer/index.html");
  void window.loadFile(rendererPath);
  if (smokeMode) {
    window.webContents.once("did-finish-load", () => {
      void runSmokeCheck(window);
    });
  }
  return window;
}

async function runSmokeCheck(window: BrowserWindow): Promise<void> {
  if (smokeScreenshot) {
    window.show();
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 150));
  }
  let passed = false;
  let details = "";
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const state = (await window.webContents.executeJavaScript(
        `({
          title: document.title,
          canvas: Boolean(document.querySelector('[data-testid="schematic-canvas"]')),
          brand: document.body.innerText.includes("Drawic"),
          width: window.innerWidth,
          height: window.innerHeight
        })`,
      )) as { title: string; canvas: boolean; brand: boolean; width: number; height: number };
      if (state.canvas && state.brand && state.title === "Drawic") {
        const editState = (await window.webContents.executeJavaScript(
          `(async () => {
            const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
            const waitFor = async (predicate, timeout = 2500) => {
              const started = Date.now();
              while (Date.now() - started < timeout) {
                if (predicate()) return true;
                await wait(40);
              }
              return predicate();
            };
            const tile = Array.from(document.querySelectorAll('.symbol-tile')).find(
              (node) => node.textContent.includes('Resistor')
            );
            const canvas = document.querySelector('.schematic-canvas');
            if (!tile || !canvas) return { placed: 0, dirty: false, undone: -1, redone: -1 };
            tile.click();
            await wait(80);
            const box = canvas.getBoundingClientRect();
            const x = box.left + box.width * 0.54;
            const y = box.top + box.height * 0.48;
            canvas.dispatchEvent(new PointerEvent('pointerdown', {
              bubbles: true, clientX: x, clientY: y, pointerId: 9, pointerType: 'mouse', button: 0, buttons: 1
            }));
            canvas.dispatchEvent(new PointerEvent('pointerup', {
              bubbles: true, clientX: x, clientY: y, pointerId: 9, pointerType: 'mouse', button: 0
            }));
            await waitFor(
              () =>
                document.querySelectorAll('.component-node').length === 1 &&
                Boolean(document.querySelector('.dirty-indicator.is-dirty'))
            );
            const placed = document.querySelectorAll('.component-node').length;
            const dirty = Boolean(document.querySelector('.dirty-indicator.is-dirty'));
            document.querySelector('button[aria-label="Undo"]')?.click();
            await waitFor(() => document.querySelectorAll('.component-node').length === 0);
            const undone = document.querySelectorAll('.component-node').length;
            document.querySelector('button[aria-label="Redo"]')?.click();
            await waitFor(() => document.querySelectorAll('.component-node').length === 1);
            const redone = document.querySelectorAll('.component-node').length;
            return { placed, dirty, undone, redone };
          })()`,
        )) as { placed: number; dirty: boolean; undone: number; redone: number };
        passed =
          editState.placed === 1 &&
          editState.dirty &&
          editState.undone === 0 &&
          editState.redone === 1;
        details = JSON.stringify({ ...state, edit: editState });
        break;
      }
    } catch (error) {
      details = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  const report = {
    passed,
    details,
    blockedNetworkRequests,
    rasterExportBytes: 0,
    electron: process.versions.electron,
    platform: process.platform,
    arch: process.arch,
  };
  try {
    const raster = await rasterizeSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="64"><rect width="96" height="64" fill="#fff"/><path d="M8 32h80" stroke="#123" stroke-width="3"/></svg>',
    );
    const rasterPng = raster.toPNG();
    report.rasterExportBytes = rasterPng.byteLength;
    if (smokeScreenshot) {
      await writeFile(smokeScreenshot.replace(/\.png$/i, "-raster.png"), rasterPng);
    }
    if (report.rasterExportBytes < 100) {
      passed = false;
    }
  } catch (error) {
    details += ` raster:${error instanceof Error ? error.message : String(error)}`;
    passed = false;
  }
  if (smokeOutput) {
    await writeFile(smokeOutput, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }
  if (smokeScreenshot) {
    const screenshot = await window.webContents.capturePage();
    await writeFile(smokeScreenshot, screenshot.toPNG());
  }
  console.log(`DRAWIC_SMOKE ${JSON.stringify(report)}`);
  app.exit(passed ? 0 : 1);
}

const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    const candidate = argv.find((argument) => isDrawicProjectPath(argument));
    if (candidate && mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
      void openProjectPath(candidate).then((payload) => {
        if (payload) {
          mainWindow?.webContents.send("menu:open-project", payload);
        }
      });
    }
  });

  app.whenReady().then(async () => {
    app.setAppUserModelId("com.canvasqaq.drawic");
    const smokeUserData = process.argv.find((argument) =>
      argument.startsWith("--smoke-user-data="),
    );
    if (smokeUserData) {
      app.setPath("userData", smokeUserData.slice("--smoke-user-data=".length));
    }
    session.defaultSession.webRequest.onBeforeRequest(
      { urls: ["http://*/*", "https://*/*", "ws://*/*", "wss://*/*"] },
      (_details, callback) => {
        blockedNetworkRequests += 1;
        callback({ cancel: true });
      },
    );
    launchProjectPath =
      process.argv.find(
        (argument) => isDrawicProjectPath(argument) && !argument.startsWith("--"),
      ) ?? null;
    registerIpc();
    const settings = await loadSettings();
    rebuildMenu(settings.recent);
    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin" || smokeMode) {
    app.quit();
  }
});
