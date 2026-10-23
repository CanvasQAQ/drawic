export type ExportKind = "svg" | "png" | "pdf";

export type AppCommand =
  | "new-project"
  | "open-project"
  | "save-project"
  | "save-project-as"
  | "undo"
  | "redo"
  | "delete-selection"
  | "rotate-selection"
  | "mirror-selection"
  | "export-svg"
  | "export-png"
  | "export-pdf"
  | "import-spice"
  | "export-spice"
  | "run-erc"
  | "toggle-library"
  | "toggle-properties";

export interface OpenProjectPayload {
  path: string;
  content: string;
}

export interface RecentProject {
  path: string;
  name: string;
  openedAt: string;
}

export interface SaveProjectRequest {
  path: string | null;
  suggestedName: string;
  content: string;
  projectId: string;
}

export interface SaveProjectResult {
  canceled: boolean;
  path?: string;
}

export interface ExportRequest {
  kind: ExportKind;
  suggestedName: string;
  svg: string;
}

export interface ExportResult {
  canceled: boolean;
  path?: string;
  bytes?: number;
}

export interface RecoveryPayload {
  path: string;
  content: string;
  savedAt: string;
}

export interface DrawicBridge {
  openProject: () => Promise<OpenProjectPayload | null>;
  saveProject: (request: SaveProjectRequest) => Promise<SaveProjectResult>;
  openRecentProject: (path: string) => Promise<OpenProjectPayload | null>;
  getRecentProjects: () => Promise<RecentProject[]>;
  exportSchematic: (request: ExportRequest) => Promise<ExportResult>;
  importSpice: () => Promise<OpenProjectPayload | null>;
  saveSpice: (suggestedName: string, content: string) => Promise<ExportResult>;
  checkpoint: (request: { projectId: string; content: string }) => Promise<void>;
  clearRecovery: (projectId: string) => Promise<void>;
  getRecovery: () => Promise<RecoveryPayload | null>;
  setDocumentDirty: (dirty: boolean) => void;
  finishClose: () => void;
  onCommand: (listener: (command: AppCommand) => void) => () => void;
  platform: NodeJS.Platform;
  version: string;
}

declare global {
  interface Window {
    drawic: DrawicBridge;
  }
}
