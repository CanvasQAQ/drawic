import { TestTheme } from "./themedRoot";
import userEvent from "@testing-library/user-event";
import React, { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FilterSelect } from "../src/renderer/components/FilterSelect";

afterEach(cleanup);
function Example() {
  const [value, setValue] = useState("all");
  return <FilterSelect label="Source" value={value} onChange={setValue} options={[
    { value: "all", label: "All sources" }, { value: "custom", label: "Custom" }, { value: "project", label: "This project" },
  ]}/>;
}

describe("themed filters", () => {
  it("supports arrow selection, typeahead and Escape without committing", async () => {
    const shortcut = vi.fn();
    window.addEventListener("keydown", shortcut);
    render(<Example/>, { wrapper: TestTheme });
    const trigger = screen.getByRole("combobox");
    const user = userEvent.setup();
    trigger.focus();
    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");
    expect(trigger.textContent).toBe("Custom");
    await user.keyboard("t{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(trigger.textContent).toBe("Custom");
    await user.keyboard("{End}{Enter}");
    expect(trigger.textContent).toBe("This project");
    expect(shortcut).not.toHaveBeenCalled();
    window.removeEventListener("keydown", shortcut);
  });

  it("selects by pointer and dismisses when clicking outside", async () => {
    render(<Example/>, { wrapper: TestTheme });
    const trigger = screen.getByRole("combobox");
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("option", { name: "Custom" }));
    expect(trigger.textContent).toBe("Custom");
    fireEvent.click(trigger);
    await new Promise(resolve => setTimeout(resolve, 0));
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("listbox")).toBeNull();
  });
});
