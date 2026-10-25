import type { BrowserWindowConstructorOptions } from "electron";

export const WINDOW_MIN_WIDTH = 900;
export const WINDOW_MIN_HEIGHT = 640;
export const WINDOW_DEFAULT_WIDTH = 1440;
export const WINDOW_DEFAULT_HEIGHT = 900;

export function platformWindowOptions(
  platform: NodeJS.Platform,
): Pick<
  BrowserWindowConstructorOptions,
  "frame" | "titleBarStyle" | "trafficLightPosition"
> {
  if (platform === "darwin") {
    return {
      titleBarStyle: "hiddenInset",
      trafficLightPosition: { x: 14, y: 13 },
    };
  }
  return { frame: false };
}
