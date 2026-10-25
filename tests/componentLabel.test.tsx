import React from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_SANS_FONT_STACK,
  NAME_BASE_FONT_SIZE,
  SUBSCRIPT_BASELINE_DROP,
  SUBSCRIPT_HORIZONTAL_GAP,
  SUBSCRIPT_SCALE,
} from "../src/core/labels";
import type { NodeLabelLayout } from "../src/core/model";
import { ComponentTextLabel } from "../src/renderer/components/ComponentTextLabel";

function mount(label: React.ReactElement): {
  container: HTMLElement;
  root: ReturnType<typeof createRoot>;
} {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  flushSync(() => root.render(label));
  return { container, root };
}

describe("rendered component Name", () => {
  const layout: NodeLabelLayout = {
    offset: { x: 0, y: 0 },
    hidden: false,
    position: { x: 115, y: 105 },
    anchor: "start",
    placement: "default",
    side: "east",
  };

  it("renders M1 as a bold italic base and 11.48816-point upright subscript", () => {
    const { container, root } = mount(
      <svg>
        <ComponentTextLabel
          kind="reference"
          text="M1"
          point={{ x: 115, y: 105 }}
          anchor="start"
          layout={layout}
        />
      </svg>,
    );
    const text = container.querySelector(".component-reference")!;
    expect(text.getAttribute("font-size")).toBe(String(NAME_BASE_FONT_SIZE));
    expect(text.getAttribute("font-family")).toBe(DEFAULT_SANS_FONT_STACK);
    expect(text.getAttribute("transform")).toBeNull();
    expect(text.getAttribute("style")).toContain("font-synthesis");

    const base = text.querySelector('[data-rich-role="base"]')!;
    expect(base.textContent).toBe("M");
    expect(base.getAttribute("font-weight")).toBe("700");
    expect(base.getAttribute("font-style")).toBe("italic");

    const subscript = text.querySelector('[data-rich-role="subscript"]')!;
    expect(subscript.textContent).toBe("1");
    expect(subscript.getAttribute("font-weight")).toBe("700");
    expect(subscript.getAttribute("font-style")).toBe("normal");
    expect(Number(subscript.getAttribute("font-size"))).toBeCloseTo(
      NAME_BASE_FONT_SIZE * SUBSCRIPT_SCALE,
    );
    expect(Number(subscript.getAttribute("dy"))).toBeCloseTo(
      NAME_BASE_FONT_SIZE * SUBSCRIPT_BASELINE_DROP,
    );
    expect(Number(subscript.getAttribute("dx"))).toBeCloseTo(
      NAME_BASE_FONT_SIZE * SUBSCRIPT_HORIZONTAL_GAP,
    );
    root.unmount();
    container.remove();
  });

  it("renders XU0 and M_TAIL with the specified rich-text roles", () => {
    for (const [reference, base, subscript] of [
      ["XU0", "XU", "0"],
      ["M_TAIL", "M", "TAIL"],
      ["OA1", "OA", "1"],
      ["ΩTAIL", "Ω", "TAIL"],
    ] as const) {
      const { container, root } = mount(
        <svg>
          <ComponentTextLabel
            kind="reference"
            text={reference}
            point={{ x: 0, y: 0 }}
            anchor="start"
            layout={layout}
          />
        </svg>,
      );
      expect(
        container.querySelector('[data-rich-role="base"]')?.textContent,
      ).toBe(base);
      expect(
        container.querySelector('[data-rich-role="subscript"]')?.textContent,
      ).toBe(subscript);
      root.unmount();
    }
  });

  it("combines document font scale and per-label scale without rotating glyphs", () => {
    const { container, root } = mount(
      <svg>
        <ComponentTextLabel
          kind="reference"
          text="R12"
          point={{ x: 100, y: 100 }}
          anchor="middle"
          layout={{ ...layout, fontSizeScale: 1.2 }}
          typography={{ family: "serif", scale: 1.25 }}
        />
      </svg>,
    );
    const text = container.querySelector(".component-reference")!;
    expect(Number(text.getAttribute("font-size"))).toBeCloseTo(
      NAME_BASE_FONT_SIZE * 1.25 * 1.2,
    );
    expect(text.getAttribute("font-family")).toContain("Liberation Serif");
    expect(text.getAttribute("text-anchor")).toBe("middle");
    expect(text.getAttribute("transform")).toBeNull();
    root.unmount();
  });
});
