import React from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { createEmptyPage } from "../src/core/model";
import { PropertiesPanel } from "../src/renderer/components/PropertiesPanel";
import { addTestNet, addTestWire } from "./fixtures";

describe("properties Net controls", () => {
  it("edits the selected net color from a wire inspector", () => {
    const page = createEmptyPage("Net color");
    addTestNet(page, "net_color", "VOUT").color = "#0f766e";
    addTestWire(
      page,
      "net_color",
      "wire_color",
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
    );
    const onUpdateNetColor = vi.fn();
    const noop = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    flushSync(() =>
      root.render(
        <PropertiesPanel
          page={page}
          selection={[{ kind: "wire", id: "wire_color" }]}
          netNameByWire={new Map([["wire_color", "VOUT"]])}
          onUpdateNode={noop}
          onUpdateNodeLabel={noop}
          onUpdateReferenceLabel={noop}
          onResetNodeLabelStyle={noop}
          onUpdateTypography={noop}
          onUpdateAnnotation={noop}
          onUpdateShape={noop}
          onReorderShape={noop}
          onUpdateNetName={noop}
          onUpdateNetColor={onUpdateNetColor}
          onRotate={noop}
          onMirror={noop}
          onMirrorVertical={noop}
          onDelete={noop}
          onCollapse={noop}
          onRenamePage={noop}
        />,
      ),
    );

    const blue = container.querySelector<HTMLButtonElement>(
      '[aria-label="Set net color #1d4ed8"]',
    )!;
    flushSync(() => blue.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onUpdateNetColor).toHaveBeenCalledWith("wire_color", "#1d4ed8");

    const reset = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
      (button) => button.textContent === "Default",
    )!;
    flushSync(() => reset.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onUpdateNetColor).toHaveBeenCalledWith("wire_color", null);
    root.unmount();
    container.remove();
  });

  it("edits label appearance without exposing the electrical Reference as a style", () => {
    const page = createEmptyPage("Label style");
    page.nodes.push({
      id: "r1",
      symbolId: "resistor",
      reference: "R1",
      value: "1k",
      x: 100,
      y: 100,
      rotation: 0,
      mirrored: false,
      labelLayout: {
        reference: {
          offset: { x: 0, y: 0 },
          hidden: false,
          position: { x: 115, y: 105 },
          anchor: "start",
          placement: "default",
          side: "east",
        },
      },
    });
    const onUpdateNodeLabel = vi.fn();
    const onUpdateNode = vi.fn();
    const noop = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    flushSync(() =>
      root.render(
        <PropertiesPanel
          page={page}
          selection={[
            { kind: "node-label", id: "r1", label: "reference" },
          ]}
          netNameByWire={new Map()}
          onUpdateNode={onUpdateNode}
          onUpdateNodeLabel={onUpdateNodeLabel}
          onUpdateReferenceLabel={noop}
          onResetNodeLabelStyle={noop}
          onUpdateTypography={noop}
          onUpdateAnnotation={noop}
          onUpdateShape={noop}
          onReorderShape={noop}
          onUpdateNetName={noop}
          onUpdateNetColor={noop}
          onRotate={noop}
          onMirror={noop}
          onMirrorVertical={noop}
          onDelete={noop}
          onCollapse={noop}
          onRenamePage={noop}
        />,
      ),
    );
    const italic = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Italic",
    )!;
    flushSync(() => italic.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onUpdateNodeLabel).toHaveBeenCalledWith(
      "r1",
      "reference",
      { fontStyle: "italic" },
    );
    expect(
      container.querySelector('[aria-label="Editable component Name"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[aria-label="Bold selected text"]'),
    ).not.toBeNull();
    expect(noop).not.toHaveBeenCalled();
    root.unmount();
    container.remove();
  });
});
