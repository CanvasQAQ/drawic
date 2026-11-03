import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentControls } from "../src/renderer/components/AgentControls";

afterEach(cleanup);

describe("Agent setup", () => {
  it("shows the entry and honest desktop guidance without a bridge", () => {
    Object.defineProperty(window, "drawic", { configurable: true, value: {} });
    render(<AgentControls/>);
    fireEvent.click(screen.getByRole("button", { name: /Agent Off/ }));
    expect(screen.getByText(/Browser preview does not start/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Enable Agent" })).toBeNull();
    expect(screen.queryByLabelText("Agent setup")).toBeNull();
    fireEvent.keyDown(screen.getByRole("button", { name: "Close" }), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: /Agent Off/ }));
  });

  it("copies enabled configuration and reports clipboard failures", async () => {
    const config = '{"mcpServers":{"drawic":{"command":"example"}}}';
    const disable = vi.fn().mockResolvedValue(undefined);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window, "drawic", { configurable: true, value: { agent: { enable: vi.fn().mockResolvedValue(config), disable, copy: writeText } } });
    render(<AgentControls/>);
    fireEvent.click(screen.getByRole("button", { name: /Agent Off/ }));
    expect(screen.queryByLabelText("Agent setup")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Enable Agent" }));
    const setup = await screen.findByLabelText("Agent setup") as HTMLTextAreaElement;
    expect(setup.value).toContain(config);
    expect(setup.value).toContain("Read the active drawing");
    fireEvent.click(screen.getByRole("button", { name: "Copy all for Agent" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(setup.value));
    expect(await screen.findByText("Agent setup copied.")).toBeTruthy();
    writeText.mockRejectedValueOnce(new Error("denied"));
    fireEvent.click(screen.getByRole("button", { name: "Copy all for Agent" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Disable Agent" }));
    await waitFor(() => expect(screen.queryByLabelText("Agent setup")).toBeNull());
    expect(disable).toHaveBeenCalledOnce();
  });
});
