export interface DeviceActions {
  save: () => boolean;
  undo: () => void;
  redo: () => void;
  remove: () => void;
}
export interface LibraryActions {
  saveAll: () => Promise<boolean>;
  command: (command: string) => void;
}
