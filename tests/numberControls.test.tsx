import React from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import {
  NumberStepperField,
  SliderField,
} from "../src/renderer/components/NumberControls";

function renderControl(element: React.ReactElement): {
  container: HTMLElement;
  root: Root;
} {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  flushSync(() => root.render(element));
  return { container, root };
}

function click(button: HTMLButtonElement): void {
  flushSync(() =>
    button.dispatchEvent(new MouseEvent("click", { bubbles: true })),
  );
}

function setInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  flushSync(() => {
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function pointerDown(input: HTMLInputElement): void {
  flushSync(() =>
    input.dispatchEvent(
      new MouseEvent("pointerdown", { bubbles: true, button: 0, buttons: 1 }),
    ),
  );
}

function pointerUp(element: Element): void {
  flushSync(() =>
    element.dispatchEvent(
      new MouseEvent("pointerup", { bubbles: true, button: 0 }),
    ),
  );
}

function blur(input: HTMLInputElement): void {
  flushSync(() =>
    input.dispatchEvent(new FocusEvent("focusout", { bubbles: true })),
  );
}

function fieldByLabel(container: HTMLElement, label: string): HTMLInputElement {
  const labelElement = Array.from(container.querySelectorAll("label")).find(
    (element) => element.textContent?.trim() === label,
  );
  return (labelElement as HTMLLabelElement | undefined)?.control as HTMLInputElement;
}

describe("NumberStepperField", () => {
  it("adjusts by step and respects the minimum and maximum", () => {
    const onCommit = vi.fn();
    const { container, root } = renderControl(
      <NumberStepperField
        label="Label size"
        value={13}
        min={4}
        max={14}
        step={1}
        onCommit={onCommit}
      />,
    );
    const increase = container.querySelector<HTMLButtonElement>(
      '[aria-label="Increase Label size"]',
    )!;
    const decrease = container.querySelector<HTMLButtonElement>(
      '[aria-label="Decrease Label size"]',
    )!;

    click(increase);
    expect(onCommit).toHaveBeenCalledWith(14);

    flushSync(() =>
      root.render(
        <NumberStepperField
          label="Label size"
          value={14}
          min={4}
          max={14}
          step={1}
          onCommit={onCommit}
        />,
      ),
    );
    onCommit.mockClear();
    click(decrease);
    expect(onCommit).toHaveBeenCalledWith(13);

    root.unmount();
    container.remove();
  });

  it("disables the button that would leave the allowed range", () => {
    const onCommit = vi.fn();
    const { container, root } = renderControl(
      <NumberStepperField
        label="Font size"
        value={64}
        min={8}
        max={64}
        step={1}
        onCommit={onCommit}
      />,
    );
    expect(
      container.querySelector<HTMLButtonElement>(
        '[aria-label="Increase Font size"]',
      )?.disabled,
    ).toBe(true);
    expect(
      container.querySelector<HTMLButtonElement>(
        '[aria-label="Decrease Font size"]',
      )?.disabled,
    ).toBe(false);

    root.unmount();
    container.remove();
  });

  it("commits a typed value on blur", () => {
    const onCommit = vi.fn();
    const { container, root } = renderControl(
      <NumberStepperField
        label="Font size"
        value={16}
        min={8}
        max={64}
        step={1}
        onCommit={onCommit}
      />,
    );
    const input = fieldByLabel(container, "Font size");

    setInputValue(input, "32");
    blur(input);
    expect(onCommit).toHaveBeenCalledWith(32);

    root.unmount();
    container.remove();
  });

  it("reverts an emptied input instead of committing zero", () => {
    const onCommit = vi.fn();
    const { container, root } = renderControl(
      <NumberStepperField
        label="Font size"
        value={16}
        min={8}
        max={64}
        step={1}
        onCommit={onCommit}
      />,
    );
    const input = fieldByLabel(container, "Font size");

    setInputValue(input, "");
    blur(input);

    expect(onCommit).not.toHaveBeenCalled();
    expect(input.value).toBe("16");
    root.unmount();
    container.remove();
  });
});

describe("SliderField", () => {
  it("shows a formatted value and commits range changes", () => {
    const onCommit = vi.fn();
    const { container, root } = renderControl(
      <SliderField
        label="Opacity"
        value={75}
        min={0}
        max={100}
        step={1}
        formatValue={(value) => `${value}%`}
        onCommit={onCommit}
      />,
    );
    const slider = fieldByLabel(container, "Opacity");

    expect(slider.value).toBe("75");
    expect(container.querySelector("output")?.textContent).toBe("75%");
    expect(slider.getAttribute("aria-valuetext")).toBe("75%");
    expect(slider.style.getPropertyValue("--range-fill")).toBe("75%");

    setInputValue(slider, "40");
    expect(onCommit).toHaveBeenCalledWith(40);

    root.unmount();
    container.remove();
  });

  it("brackets a pointer drag with preview start and end", () => {
    const onCommit = vi.fn();
    const onPreviewStart = vi.fn();
    const onPreviewEnd = vi.fn();
    const { container, root } = renderControl(
      <SliderField
        label="Line width"
        value={2}
        min={0.5}
        max={24}
        step={0.5}
        formatValue={(value) => `${value} px`}
        onCommit={onCommit}
        onPreviewStart={onPreviewStart}
        onPreviewEnd={onPreviewEnd}
      />,
    );
    const slider = fieldByLabel(container, "Line width");

    pointerDown(slider);
    expect(onPreviewStart).toHaveBeenCalledTimes(1);
    setInputValue(slider, "4");
    pointerUp(slider);
    expect(onPreviewEnd).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(4);

    root.unmount();
    container.remove();
  });

  it("ends a drag when the pointer is released outside the slider", () => {
    const onPreviewStart = vi.fn();
    const onPreviewEnd = vi.fn();
    const { container, root } = renderControl(
      <SliderField
        label="Opacity"
        value={50}
        min={0}
        max={100}
        step={1}
        formatValue={(value) => `${value}%`}
        onCommit={vi.fn()}
        onPreviewStart={onPreviewStart}
        onPreviewEnd={onPreviewEnd}
      />,
    );
    const slider = fieldByLabel(container, "Opacity");

    pointerDown(slider);
    setInputValue(slider, "70");
    pointerUp(document.body);

    expect(onPreviewStart).toHaveBeenCalledTimes(1);
    expect(onPreviewEnd).toHaveBeenCalledTimes(1);

    root.unmount();
    container.remove();
  });

  it("brackets keyboard changes with preview start and end", () => {
    const onPreviewStart = vi.fn();
    const onPreviewEnd = vi.fn();
    const { container, root } = renderControl(
      <SliderField
        label="Opacity"
        value={50}
        min={0}
        max={100}
        step={1}
        formatValue={(value) => `${value}%`}
        onCommit={vi.fn()}
        onPreviewStart={onPreviewStart}
        onPreviewEnd={onPreviewEnd}
      />,
    );
    const slider = fieldByLabel(container, "Opacity");

    flushSync(() =>
      slider.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "ArrowRight" }),
      ),
    );
    setInputValue(slider, "51");
    flushSync(() =>
      slider.dispatchEvent(
        new KeyboardEvent("keyup", { bubbles: true, key: "ArrowRight" }),
      ),
    );

    expect(onPreviewStart).toHaveBeenCalledTimes(1);
    expect(onPreviewEnd).toHaveBeenCalledTimes(1);

    root.unmount();
    container.remove();
  });
});
