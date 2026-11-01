import React, { useMemo, useState } from "react";
import { catalogFilter } from "../../core/deviceCatalog";
import type { DeviceLibraryRecord } from "../../core/library";
import { Icon } from "./Icons";

interface Props {
  devices: DeviceLibraryRecord[];
  selectedIds: ReadonlySet<string>;
  dirty: boolean;
  saving: boolean;
  persisted: boolean;
  onSelect: (id: string, checked: boolean) => void;
  onNew: () => void;
  onBrowse: () => void;
  onImport: () => void;
  onExport: () => void;
  onRefresh: () => void;
  onEdit: (record: DeviceLibraryRecord) => void;
  onDuplicate: (record: DeviceLibraryRecord) => void;
  onDelete: (id: string) => void;
  onSave: () => void;
}

export function CustomLibrary(props: Props) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const matches = catalogFilter(query, "all", "custom");
    return props.devices.filter(record => matches(record, "custom"));
  }, [props.devices, query]);

  return <section className="custom-workspace" aria-label="Custom library">
    <header className="custom-heading">
      <div><small>Local library</small><h3>Custom devices</h3></div>
      <div className="custom-buttons">
        <button onClick={props.onImport}>Import library…</button>
        <button className="custom-primary" onClick={props.onNew}><Icon name="new"/> New device</button>
      </div>
    </header>
    <div className="custom-filter">
      <label>Find a device<input type="search" placeholder="Name, pin or keyword" value={query}
        onChange={event => setQuery(event.target.value)} /></label>
      <span>{filtered.length} of {props.devices.length} devices</span>
      <button disabled={!props.devices.length} onClick={props.onExport}>
        <Icon name="export"/> Export {props.selectedIds.size ? props.selectedIds.size+" selected" : "all"}
      </button>
    </div>
    <div className="custom-records">
      {filtered.map(record => <article key={record.id} className="custom-record">
        <input type="checkbox" aria-label={"Select "+record.title+" for export"} checked={props.selectedIds.has(record.id)}
          onChange={event => props.onSelect(record.id, event.target.checked)}/>
        <svg viewBox={record.artwork.viewBox} aria-hidden="true">
          <g dangerouslySetInnerHTML={{__html:record.artwork.body}}/>
        </svg>
        <div><strong>{record.title}</strong><small>{record.category} · {record.pins.length} pins · {record.artwork.shapes ? "Editable" : "SVG"} artwork</small><code>{record.id}</code></div>
        <div className="custom-buttons">
          <button onClick={()=>props.onEdit(record)}>Edit</button>
          <button onClick={()=>props.onDuplicate(record)}>Duplicate</button>
          <button className="custom-remove" onClick={()=>props.onDelete(record.id)}>Delete</button>
        </div>
      </article>)}
      {!props.devices.length ? <div className="custom-empty">
        <h3>No custom devices yet</h3><p>Create a device, import a library, or clone a symbol from Browse.</p>
        <button onClick={props.onBrowse}>Browse devices to clone</button>
      </div> : !filtered.length && <div className="custom-empty"><p>No devices match this search.</p><button onClick={()=>setQuery("")}>Clear search</button></div>}
    </div>
    <footer className="custom-save">
      <div role="status"><strong>{props.dirty ? "Library draft · not saved to disk" : props.persisted ? "Local library saved to disk" : "No local library saved yet"}</strong>
        <small>{props.dirty ? "Save all library changes to keep them after closing Drawic." : "Project copies update only when you refresh them."}</small></div>
      <div className="custom-buttons">
        <button onClick={props.onRefresh} title="Update the project's embedded devices from this library draft">Refresh project devices</button>
        <button className="custom-primary" disabled={!props.dirty || props.saving} onClick={props.onSave}>
          <Icon name="save"/> {props.saving ? "Saving…" : "Save library to disk"}
        </button>
      </div>
    </footer>
  </section>;
}
