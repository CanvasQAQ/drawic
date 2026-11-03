import { Button, TextArea } from "../ui";
import React, { useRef, useState } from "react";
import { ExportDialog } from "./Dialogs";

const instructions = "Connect your local MCP client to Drawic using the connection configuration below. Read the active drawing and its version before editing. Apply changes through the Drawic tools so they remain undoable.";

export function AgentControls() {
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const trigger = useRef<HTMLButtonElement>(null);
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
      if (bridge) await bridge.copy(text);
      else if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
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
    <Button variant="ghost" ref={trigger} type="button" aria-haspopup="dialog" aria-label={`Agent ${config ? "On" : "Off"}`} title={`Agent ${config ? "On" : "Off"}`} className={`agent-trigger${config ? " agent-enabled" : ""}`}
      onClick={() => setOpen(true)}><svg className="agent-robot" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v2m-7 4a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V9Zm-2 2v5m18-5v5M8.5 14h7M9 10.5h.01M15 10.5h.01"/></svg><span className="agent-status-dot" aria-hidden="true"/><span className="agent-state">{config ? "On" : "Off"}</span></Button>
    {open && <ExportDialog title="Local Agent" onClose={close} returnFocus={trigger}>
      <div className="agent-settings">
        <div className="agent-overview">
          <div className="agent-overview-copy">
            <span className={`agent-badge${config ? " is-active" : ""}`}><span aria-hidden="true" />{config ? "Connection enabled" : "Connection disabled"}</span>
            <p>{!bridge ? "Agent connections are available in the desktop app. Browser preview does not start a connection." :
              config ? "Your local MCP client can read and edit the active drawing." : "Connect a local MCP client to read and edit the active drawing."}</p>
          </div>
          {bridge && <Button variant="solid" type="button" {...(config ? {color: "red" as const} : {})} className={config ? "danger-button" : "primary-button"} disabled={pending} onClick={() => void toggle()}>
            {pending ? "Updating…" : config ? "Disable Agent" : "Enable Agent"}</Button>}
        </div>
        {config &&
          <section className="agent-section">
            <div className="agent-section-heading"><div><h3>Agent setup</h3><p>Keep this private. It grants access to your drawing.</p></div></div>
            <TextArea aria-label="Agent setup" readOnly onFocus={event => event.target.select()} value={`${instructions}\n\n${config}`} rows={10}/>
            <div className="agent-copy-actions">
            <Button variant="solid" className="primary-button" type="button" onClick={() => void copy(`${instructions}\n\n${config}`, "Agent setup")}>Copy all for Agent</Button>
            </div>
          </section>
        }
        {feedback && <p role="status">{feedback}</p>}
        {error && <p role="alert">{error}</p>}
      </div>
    </ExportDialog>}
  </>;
}
