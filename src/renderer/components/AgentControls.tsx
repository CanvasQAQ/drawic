import { createPortal } from "react-dom";
import React, { useEffect, useRef, useState } from "react";
import { ExportDialog } from "./Dialogs";

const instructions = "Connect your local MCP client to Drawic using the connection configuration below. Read the active drawing and its version before editing. Apply changes through the Drawic tools so they remain undoable.";

export function AgentControls() {
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const trigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) dialog.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, [open]);
  const close = () => { setOpen(false); trigger.current?.focus(); };
  const bridge = window.drawic.agent;
  async function toggle() {
    if (!bridge) return;
    setPending(true);
    setError("");
    setFeedback("");
    try {
      if (config) { await bridge.disable(); setConfig(""); }
      else setConfig(await bridge.enable());
    } catch (e) { setError(e instanceof Error ? e.message : "Connection failed"); }
    finally { setPending(false); }
  }
  async function copy(text: string, label: string) {
    setError("");
    setFeedback("");
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
      else {
        const field = document.createElement("textarea");
        field.value = text;
        field.style.position = "fixed";
        field.style.opacity = "0";
        document.body.append(field);
        try {
          field.select();
          if (!document.execCommand("copy")) throw new Error("Clipboard unavailable. Select the text and copy it manually.");
        } finally { field.remove(); }
      }
      setFeedback(`${label} copied.`);
    } catch { setError("Could not copy. Select the text and copy it manually."); }
  }
  return <>
    <button ref={trigger} type="button" aria-haspopup="dialog" aria-label={`Agent ${config ? "On" : "Off"}`} title={`Agent ${config ? "On" : "Off"}`} className={`agent-trigger${config ? " agent-enabled" : ""}`}
      onClick={() => setOpen(true)}><svg className="agent-robot" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v2m-7 4a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V9Zm-2 2v5m18-5v5M8.5 14h7M9 10.5h.01M15 10.5h.01"/></svg><span className="agent-status-dot" aria-hidden="true"/><span className="agent-state">{config ? "On" : "Off"}</span></button>
    {open && createPortal(<div ref={dialog} onKeyDown={event => {
      event.stopPropagation();
      if (event.key === "Escape") { event.preventDefault(); close(); }
      if (event.key === "Tab") {
        const controls = [...dialog.current!.querySelectorAll<HTMLElement>("button:not(:disabled), textarea")];
        const first = controls[0];
        const last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }}><ExportDialog title="Local Agent" onClose={close}>
      <div className="agent-settings">
        <p>{!bridge ? "Agent connections are available in the desktop app. Browser preview does not start a connection." :
          config ? "Enabled. Copy this private configuration to your local MCP client." : "Allow a local MCP client to read and edit the current drawing."}</p>
        {bridge && <button type="button" className={config ? "danger-button" : "primary-button"} disabled={pending} onClick={() => void toggle()}>
          {pending ? "Updating…" : config ? "Disable Agent" : "Enable Agent"}</button>}
        <label>Instructions for your Agent<textarea aria-label="Agent instructions" readOnly onFocus={event => event.target.select()} value={instructions} rows={4}/></label>
        <button type="button" onClick={() => void copy(instructions, "Instructions")}>Copy instructions</button>
        {config && <>
          <label>Connection configuration<textarea aria-label="Agent connection configuration" readOnly onFocus={event => event.target.select()} value={config} rows={10}/></label>
          <div className="agent-copy-actions">
            <button type="button" onClick={() => void copy(config, "Configuration")}>Copy configuration</button>
            <button type="button" onClick={() => void copy(`${instructions}\n\n${config}`, "Agent setup")}>Copy all for Agent</button>
          </div>
        </>}
        {feedback && <p role="status">{feedback}</p>}
        {error && <p role="alert">{error}</p>}
      </div>
    </ExportDialog></div>, document.body)}
  </>;
}
