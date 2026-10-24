import React from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { pinAuditKey, pinPositionWarnings } from "../src/core/pinAudit";
import type { DeviceSymbol } from "../src/core/library";
import { PinAuditScreen } from "../src/renderer/components/PinAuditScreen";

const auditSymbol: DeviceSymbol = {
  id: "audit-device",
  label: "Audit Device",
  category: "test",
  electrical: true,
  palette: true,
  frame: { x: -20, y: -20, width: 40, height: 40 },
  selectionBox: { x: -15, y: -15, width: 30, height: 30 },
  pins: [
    {
      id: "IN",
      key: "IN",
      name: "Input",
      role: "input",
      direction: "west",
      side: "west",
      x: -15,
      y: 0,
    },
    {
      id: "OUT",
      key: "OUT",
      name: "Output",
      role: "output",
      direction: "east",
      side: "east",
      x: 15,
      y: 0,
    },
  ],
  file: "audit-device.svg",
  svgBody:
    '<rect x="-15" y="-15" width="30" height="30" fill="none" stroke="currentColor"/>' +
    '<line x1="-15" y1="0" x2="-10" y2="0" stroke="currentColor"/>' +
    '<line x1="10" y1="0" x2="15" y2="0" stroke="currentColor"/>',
  viewBox: "-20 -20 40 40",
  labelAnchors: {
    reference: { x: 24, y: -3, anchor: "start" },
    value: { x: 24, y: 12, anchor: "start" },
  },
  keywords: ["audit"],
  spice: { prefix: "X", defaultValue: "", supported: false },
  libraryId: "audit-test",
};

describe("device pin direction audit", () => {
  it("flags a changed direction whose stored contact point is not on that edge", () => {
    const warnings = pinPositionWarnings(auditSymbol, {
      [pinAuditKey("audit-device", "IN")]: "north",
    });
    expect(warnings).toEqual([
      expect.objectContaining({
        deviceId: "audit-device",
        pinId: "IN",
      }),
    ]);
  });

  it("exports only corrected pins as a correction document", async () => {
    const onExport = vi.fn(async (_content: string) => ({
      canceled: false,
      path: "audit.json",
    }));
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    flushSync(() =>
      root.render(
        <PinAuditScreen
          symbols={[auditSymbol]}
          libraryId="audit-test"
          libraryRevision="1234567890abcdef"
          onClose={vi.fn()}
          onExport={onExport}
        />,
      ),
    );

    const select = container.querySelector<HTMLSelectElement>(
      'select[aria-label="Audit Device Input direction"]',
    )!;
    select.value = "north";
    flushSync(() => select.dispatchEvent(new Event("change", { bubbles: true })));
    const exportButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Export corrections (1)"),
    )!;
    expect((exportButton as HTMLButtonElement).disabled).toBe(false);
    flushSync(() =>
      exportButton.dispatchEvent(new MouseEvent("click", { bubbles: true })),
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onExport).toHaveBeenCalledTimes(1);
    const content = onExport.mock.calls.at(0)?.[0];
    expect(content).toBeDefined();
    const report = JSON.parse(content!) as {
      format: string;
      reviewedPinCount: number;
      corrections: Array<Record<string, string>>;
    };
    expect(report.format).toBe("drawic-pin-direction-audit");
    expect(report.reviewedPinCount).toBe(2);
    expect(report.corrections).toEqual([
      expect.objectContaining({
        deviceId: "audit-device",
        pinId: "IN",
        from: "west",
        to: "north",
      }),
    ]);
    root.unmount();
  });
});
