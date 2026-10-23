import { contextBridge, ipcRenderer } from "electron";
import type { AppCommand, DrawicBridge } from "../shared/bridge";

const bridge: DrawicBridge = {
  openProject: () => ipcRenderer.invoke("project:open"),
  saveProject: (request) => ipcRenderer.invoke("project:save", request),
  openRecentProject: (path) => ipcRenderer.invoke("project:open-recent", path),
  getRecentProjects: () => ipcRenderer.invoke("recent:list"),
  exportSchematic: (request) => ipcRenderer.invoke("export:schematic", request),
  importSpice: () => ipcRenderer.invoke("spice:import"),
  saveSpice: (suggestedName, content) =>
    ipcRenderer.invoke("spice:save", { suggestedName, content }),
  checkpoint: (request) => ipcRenderer.invoke("recovery:checkpoint", request),
  clearRecovery: (projectId) => ipcRenderer.invoke("recovery:clear", projectId),
  getRecovery: () => ipcRenderer.invoke("recovery:latest"),
  getLaunchProject: () => ipcRenderer.invoke("app:launch-project"),
  setDocumentDirty: (dirty) => ipcRenderer.send("window:set-dirty", dirty),
  finishClose: () => ipcRenderer.send("window:finish-close"),
  onCommand: (listener) => {
    const wrapped = (_event: Electron.IpcRendererEvent, command: AppCommand): void =>
      listener(command);
    ipcRenderer.on("menu:command", wrapped);
    return () => ipcRenderer.removeListener("menu:command", wrapped);
  },
  onProjectOpen: (listener) => {
    const wrapped = (_event: Electron.IpcRendererEvent, payload: Parameters<typeof listener>[0]): void =>
      listener(payload);
    ipcRenderer.on("menu:open-project", wrapped);
    return () => ipcRenderer.removeListener("menu:open-project", wrapped);
  },
  platform: process.platform,
  version: process.versions.electron,
};

contextBridge.exposeInMainWorld("drawic", bridge);
