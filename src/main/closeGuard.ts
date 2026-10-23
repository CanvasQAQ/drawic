export type CloseChoice = "save" | "discard" | "cancel";

export const UNSAVED_CLOSE_PROMPT = {
  type: "warning" as const,
  title: "Unsaved Drawic project",
  message: "This project has unsaved changes.",
  detail: "Save before closing, discard the changes, or cancel and keep editing.",
  buttons: ["Save", "Discard", "Cancel"],
  defaultId: 0,
  cancelId: 2,
  noLink: true,
};

export function interpretCloseResponse(response: number): CloseChoice {
  if (response === 0) {
    return "save";
  }
  if (response === 1) {
    return "discard";
  }
  return "cancel";
}
