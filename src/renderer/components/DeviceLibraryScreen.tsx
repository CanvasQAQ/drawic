import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  loadDeviceLibrary,
  parseDeviceLibraryText,
  type DeviceLibraryFile,
  type DeviceLibraryRecord,
} from "../../core/library";
import {
  buildDeviceLibraryFile,
  copyDeviceRecord,
  deviceLibraryConflicts,
  emptyUserDeviceLibrary,
  mergeImportedDeviceLibrary,
  uniqueDeviceId,
  type DeviceImportPolicy,
  type DeviceLibraryConflict,
} from "../../core/deviceLibraryRegistry";
import type { DeviceLibraryImportResult, ExportResult } from "../../shared/bridge";
import { DeviceEditor } from "./DeviceEditor";
import { PinAuditScreen } from "./PinAuditScreen";
import { Icon } from "./Icons";

type DeviceLibraryTab = "browse" | "audit" | "custom";
type DeviceSource = "built-in" | "custom" | "project";

interface BrowseEntry {
  record: DeviceLibraryRecord;
  source: DeviceSource;
}

interface EditorState {
  record: DeviceLibraryRecord;
  mode: "create" | "edit" | "clone";
  artworkLocked: boolean;
}

interface ImportState {
  incoming: DeviceLibraryFile;
  conflicts: DeviceLibraryConflict[];
}

interface Status {
  kind: "info" | "success" | "error";
  message: string;
}

export interface DeviceLibraryScreenProps {
  builtInFile: DeviceLibraryFile;
  userFile: DeviceLibraryFile | null;
  embeddedFile?: DeviceLibraryFile | undefined;
  userDirty: boolean;
  onClose: () => void;
  onChangeUserLibrary: (library: DeviceLibraryFile | null) => void;
  onDiscardUserLibrary: () => void;
  onSaveUserLibrary: () => Promise<boolean>;
  onImportLibrary: () => Promise<DeviceLibraryImportResult>;
  onExportLibrary: (library: DeviceLibraryFile) => Promise<ExportResult>;
  onExportAudit: (content: string) => Promise<ExportResult>;
  onRefreshEmbedded: () => string;
}

const SOURCE_LABELS: Record<DeviceSource, string> = {
  "built-in": "Built-in",
  custom: "Custom",
  project: "This project",
};

export function createStarterDevice(id: string): DeviceLibraryRecord {
  const size = 40;
  const frame = { x: -size / 2, y: -size / 2, width: size, height: size };
  return {
    id,
    title: "Untitled device",
    category: "custom",
    keywords: [],
    electrical: true,
    palette: true,
    frame,
    selectionBox: { ...frame },
    labelBounds: { ...frame },
    artwork: {
      type: "svg",
      viewBox: `${frame.x} ${frame.y} ${frame.width} ${frame.height}`,
      body: "",
      source: "custom.svg",
      sourceSha256: "",
    },
    pins: [],
    labelAnchors: {
      reference: { x: size / 2 + 6, y: -4, anchor: "start" },
      value: { x: size / 2 + 6, y: 10, anchor: "start" },
    },
    spice: { prefix: "X", defaultValue: "", supported: false },
    metadata: { sourceCollection: "user", sourceRevision: null },
  };
}

function cloneRecord(
  record: DeviceLibraryRecord,
  id: string,
  title: string,
): DeviceLibraryRecord {
  const copy = copyDeviceRecord(record, id, title);
  delete copy.variantOf;
  delete copy.variantId;
  return {
    ...copy,
    metadata: { ...copy.metadata, sourceCollection: "user" },
  };
}

function DevicePreview({
  record,
  className = "device-library-preview",
}: {
  record: DeviceLibraryRecord;
  className?: string;
}) {
  return (
    <svg
      className={className}
      viewBox={record.artwork.viewBox}
      role="img"
      aria-label={`${record.title} preview`}
    >
      <g dangerouslySetInnerHTML={{ __html: record.artwork.body }} />
    </svg>
  );
}

export function DeviceLibraryScreen({
  builtInFile,
  userFile,
  embeddedFile,
  userDirty,
  onClose,
  onChangeUserLibrary,
  onDiscardUserLibrary,
  onSaveUserLibrary,
  onImportLibrary,
  onExportLibrary,
  onExportAudit,
  onRefreshEmbedded,
}: DeviceLibraryScreenProps) {
  const [tab, setTab] = useState<DeviceLibraryTab>("browse");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [source, setSource] = useState<"all" | DeviceSource>("all");
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [importState, setImportState] = useState<ImportState | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<Status>({
    kind: "info",
    message: "",
  });

  const builtInSymbols = useMemo(
    () => loadDeviceLibrary(builtInFile).symbols,
    [builtInFile],
  );
  const userDevices = useMemo(
    () =>
      [...(userFile?.devices ?? [])].sort(
        (left, right) =>
          left.title.localeCompare(right.title) ||
          left.id.localeCompare(right.id),
      ),
    [userFile],
  );
  const browseEntries = useMemo(() => {
    const entries = new Map<string, BrowseEntry>();
    for (const record of userFile?.devices ?? []) {
      entries.set(record.id, { record, source: "custom" });
    }
    for (const record of embeddedFile?.devices ?? []) {
      entries.set(record.id, { record, source: "project" });
    }
    for (const record of builtInFile.devices) {
      entries.set(record.id, { record, source: "built-in" });
    }
    return [...entries.values()].sort(
      (left, right) =>
        left.record.title.localeCompare(right.record.title) ||
        left.record.id.localeCompare(right.record.id),
    );
  }, [builtInFile, embeddedFile, userFile]);
  const categories = useMemo(
    () =>
      [...new Set(browseEntries.map((entry) => entry.record.category))].sort(),
    [browseEntries],
  );
  const filteredEntries = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return browseEntries.filter((entry) => {
      const record = entry.record;
      if (source !== "all" && entry.source !== source) {
        return false;
      }
      if (category !== "all" && record.category !== category) {
        return false;
      }
      return (
        !normalized ||
        record.title.toLowerCase().includes(normalized) ||
        record.id.toLowerCase().includes(normalized) ||
        record.category.toLowerCase().includes(normalized) ||
        record.keywords.some((keyword) =>
          keyword.toLowerCase().includes(normalized),
        ) ||
        record.pins.some(
          (pin) =>
            pin.name.toLowerCase().includes(normalized) ||
            pin.role.toLowerCase().includes(normalized),
        )
      );
    });
  }, [browseEntries, category, query, source]);
  const selectedDevices = useMemo(
    () => userDevices.filter((device) => selectedIds.has(device.id)),
    [selectedIds, userDevices],
  );
  const selectedExistingIds = useMemo(() => {
    const ids = new Set<string>();
    for (const entry of browseEntries) {
      ids.add(entry.record.id);
    }
    return ids;
  }, [browseEntries]);

  useEffect(() => {
    const available = new Set(userDevices.map((device) => device.id));
    setSelectedIds((current) => {
      const next = new Set([...current].filter((id) => available.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [userDevices]);

  const requestClose = useCallback(() => {
    if (userDirty) {
      setConfirmClose(true);
    } else {
      onClose();
    }
  }, [onClose, userDirty]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      if (editor) {
        return;
      }
      if (importState) {
        setImportState(null);
        return;
      }
      if (pendingDeleteId) {
        setPendingDeleteId(null);
        return;
      }
      if (confirmClose) {
        setConfirmClose(false);
        return;
      }
      requestClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [confirmClose, editor, importState, pendingDeleteId, requestClose]);

  const openNewDevice = () => {
    const existing = new Set([
      ...selectedExistingIds,
      ...userDevices.map((device) => device.id),
    ]);
    const id = uniqueDeviceId("device", existing);
    setEditor({
      record: createStarterDevice(id),
      mode: "create",
      artworkLocked: false,
    });
  };

  const openEditDevice = (record: DeviceLibraryRecord) => {
    setEditor({
      record,
      mode: "edit",
      artworkLocked: !record.artwork.shapes,
    });
  };

  const openCloneDevice = (record: DeviceLibraryRecord) => {
    const existing = new Set([
      ...selectedExistingIds,
      ...userDevices.map((device) => device.id),
    ]);
    const id = uniqueDeviceId(record.id, existing);
    setEditor({
      record: cloneRecord(record, id, `${record.title} (custom)`),
      mode: "clone",
      artworkLocked: !record.artwork.shapes,
    });
  };

  const saveEditorRecord = (record: DeviceLibraryRecord) => {
    const base = userFile ?? emptyUserDeviceLibrary();
    const devices = [
      ...base.devices.filter((device) => device.id !== record.id),
      record,
    ];
    onChangeUserLibrary(
      buildDeviceLibraryFile({
        id: base.id,
        title: base.title,
        collection: base.source.collection,
        devices,
      }),
    );
    setEditor((current) => current ? { ...current, record, mode: "edit" } : null);
    setTab("custom");
    setStatus({
      kind: "success",
      message: `${record.title} is updated in the draft library. Save the library to persist it.`,
    });
  };

  const duplicateDevice = (record: DeviceLibraryRecord) => {
    const existing = new Set(userDevices.map((device) => device.id));
    const id = uniqueDeviceId(record.id, existing);
    const copy = cloneRecord(record, id, `${record.title} (copy)`);
    const base = userFile ?? emptyUserDeviceLibrary();
    onChangeUserLibrary(
      buildDeviceLibraryFile({
        id: base.id,
        title: base.title,
        collection: base.source.collection,
        devices: [...base.devices, copy],
      }),
    );
    setStatus({ kind: "success", message: `Duplicated ${record.title}.` });
  };

  const deleteDevice = (record: DeviceLibraryRecord) => {
    const base = userFile ?? emptyUserDeviceLibrary();
    onChangeUserLibrary(
      buildDeviceLibraryFile({
        id: base.id,
        title: base.title,
        collection: base.source.collection,
        devices: base.devices.filter((device) => device.id !== record.id),
      }),
    );
    setPendingDeleteId(null);
    setStatus({ kind: "success", message: `Removed ${record.title} from the draft.` });
  };

  const saveUserLibrary = async () => {
    setSaving(true);
    try {
      const saved = await onSaveUserLibrary();
      setStatus(
        saved
          ? { kind: "success", message: "Custom device library saved." }
          : { kind: "error", message: "Could not save the custom device library." },
      );
      if (saved && confirmClose) {
        setConfirmClose(false);
        onClose();
      }
    } finally {
      setSaving(false);
    }
  };

  const exportLibrary = async () => {
    const devices = selectedDevices.length > 0 ? selectedDevices : userDevices;
    if (devices.length === 0) {
      setStatus({ kind: "error", message: "There are no custom devices to export." });
      return;
    }
    const library = buildDeviceLibraryFile({
      id: userFile?.id ?? "drawic-user",
      title: userFile?.title ?? "Custom devices",
      collection: userFile?.source.collection ?? "user",
      devices,
    });
    try {
      const result = await onExportLibrary(library);
      setStatus(
        result.canceled
          ? { kind: "info", message: "Library export canceled." }
          : {
              kind: "success",
              message: `Exported ${devices.length} device${devices.length === 1 ? "" : "s"}.`,
            },
      );
    } catch {
      setStatus({ kind: "error", message: "Could not export the device library." });
    }
  };

  const importLibrary = async () => {
    try {
      const result = await onImportLibrary();
      if (result.canceled || !result.content) {
        setStatus({ kind: "info", message: "Library import canceled." });
        return;
      }
      const incoming = parseDeviceLibraryText(result.content, {
        sanitize: true,
      });
      const builtInIds = new Set(builtInFile.devices.map((device) => device.id));
      const reservedId = incoming.devices.find((device) => builtInIds.has(device.id))?.id;
      if (reservedId) {
        throw new Error(`The built-in device ID ${reservedId} cannot be imported.`);
      }
      const conflicts = deviceLibraryConflicts(userFile, incoming);
      const realConflicts = conflicts.filter((conflict) => !conflict.identical);
      if (realConflicts.length === 0) {
        const merged = mergeImportedDeviceLibrary(userFile, incoming, "keep-local");
        onChangeUserLibrary(merged.library);
        setStatus({
          kind: "success",
          message: `Imported ${merged.added} device${merged.added === 1 ? "" : "s"}.`,
        });
      } else {
        setImportState({ incoming, conflicts });
      }
    } catch (error) {
      setStatus({
        kind: "error",
        message: `Could not import the device library: ${
          error instanceof Error ? error.message : "invalid file"
        }`,
      });
    }
  };

  const applyImport = (policy: DeviceImportPolicy) => {
    if (!importState) {
      return;
    }
    const result = mergeImportedDeviceLibrary(
      userFile,
      importState.incoming,
      policy,
    );
    onChangeUserLibrary(result.library);
    setImportState(null);
    setStatus({
      kind: "success",
      message: `Imported ${result.added} device${result.added === 1 ? "" : "s"}${
        result.skipped > 0 ? `; kept ${result.skipped} local` : ""
      }.`,
    });
  };

  const refreshEmbedded = () => {
    const message = onRefreshEmbedded();
    setStatus({ kind: "success", message });
  };

  if (editor) {
    return (
      <DeviceEditor
        initial={editor.record}
        mode={editor.mode}
        artworkLocked={editor.artworkLocked}
        onSave={saveEditorRecord}
        onCancel={() => setEditor(null)}
      />
    );
  }

  return (
    <section
      className="device-library-screen"
      role="dialog"
      aria-modal="true"
      aria-labelledby="device-library-title"
    >
      <header className="device-library-header">
        <div>
          <h2 id="device-library-title">Device library</h2>
        </div>
        <div className="device-library-tabs" role="tablist" aria-label="Device library sections">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "browse"}
            className={tab === "browse" ? "is-active" : ""}
            onClick={() => setTab("browse")}
          >
            Browse <span>{browseEntries.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "audit"}
            className={tab === "audit" ? "is-active" : ""}
            onClick={() => setTab("audit")}
          >
            Audit
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "custom"}
            className={tab === "custom" ? "is-active" : ""}
            onClick={() => setTab("custom")}
          >
            Custom <span>{userDevices.length}</span>
          </button>
        </div>
        <button
          type="button"
          className="icon-button"
          onClick={requestClose}
          aria-label="Close device library"
        >
          <Icon name="close" />
        </button>
      </header>

      {status.message ? (
        <div className={`device-library-status is-${status.kind}`} role="status">
          {status.message}
        </div>
      ) : null}

      {tab === "browse" ? (
        <>
          <div className="device-library-controls">
            <label className="search-field">
              <span className="sr-only">Search devices</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search device, pin, keyword"
                type="search"
              />
            </label>
            <label className="category-field">
              <span>Category</span>
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value)}
              >
                <option value="all">All categories</option>
                {categories.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label className="category-field">
              <span>Source</span>
              <select
                value={source}
                onChange={(event) =>
                  setSource(event.target.value as "all" | DeviceSource)
                }
              >
                <option value="all">All sources</option>
                <option value="built-in">Built-in</option>
                <option value="custom">Custom</option>
                <option value="project">This project</option>
              </select>
            </label>
            <span className="device-library-count">
              {filteredEntries.length} of {browseEntries.length} devices
            </span>
          </div>
          <div className="device-browse-grid">
            {filteredEntries.map((entry) => (
              <article className="device-browse-card" key={`${entry.source}:${entry.record.id}`}>
                <DevicePreview record={entry.record} />
                <div className="device-browse-card-body">
                  <header>
                    <h3>{entry.record.title}</h3>
                    <span className={`device-source is-${entry.source}`}>
                      {SOURCE_LABELS[entry.source]}
                    </span>
                  </header>
                  <p>
                    <code>{entry.record.id}</code> · {entry.record.category} ·{" "}
                    {entry.record.pins.length}p
                  </p>
                  <div className="device-browse-actions">
                    {entry.source === "custom" ? (
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => openEditDevice(entry.record)}
                      >
                        Edit
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => openCloneDevice(entry.record)}
                    >
                      Clone
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
          {filteredEntries.length === 0 ? (
            <div className="device-library-empty">
              No devices match the current filters.
            </div>
          ) : null}
        </>
      ) : null}

      {tab === "audit" ? (
        <div className="device-library-audit">
          <PinAuditScreen
            embedded
            symbols={builtInSymbols}
            libraryId={builtInFile.id}
            libraryRevision={builtInFile.revision}
            onExport={onExportAudit}
          />
        </div>
      ) : null}

      {tab === "custom" ? (
        <>
          <div className="device-library-controls device-library-custom-controls">
            <div className="device-library-custom-intro">
              <strong>Custom devices</strong>
              <span>{userDevices.length} in this library</span>
            </div>
            <div className="device-library-custom-command-group">
              <button type="button" className="primary-button" onClick={openNewDevice}>
                <Icon name="new" /> New device
              </button>
              <button type="button" className="device-library-secondary-button" onClick={() => void importLibrary()}>
                Import library…
              </button>
              <button
                type="button"
                className="device-library-secondary-button"
                disabled={userDevices.length === 0}
                onClick={() => void exportLibrary()}
              >
                <Icon name="export" /> Export{" "}
                {selectedDevices.length > 0 ? `${selectedDevices.length} selected` : "all"}
              </button>
              <button
                type="button"
                className="device-library-secondary-button"
                onClick={refreshEmbedded}
                title="Refresh this project's embedded device snapshot from the saved draft library"
              >
                Refresh project devices
              </button>
            </div>
            <div className="device-library-save-group">
              <span className={userDirty ? "is-dirty" : ""} role="status">
                {userDirty ? "Unsaved library changes" : "Library saved"}
              </span>
              <button
                type="button"
                className="primary-button"
                disabled={!userDirty || saving}
                onClick={() => void saveUserLibrary()}
              >
                <Icon name="save" /> {saving ? "Saving…" : "Save library"}
              </button>
            </div>
          </div>
          <div className="device-custom-list">
            {userDevices.map((record) => (
              <article className="device-custom-row" key={record.id}>
                <label className="device-select">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(record.id)}
                    onChange={(event) =>
                      setSelectedIds((current) => {
                        const next = new Set(current);
                        if (event.target.checked) {
                          next.add(record.id);
                        } else {
                          next.delete(record.id);
                        }
                        return next;
                      })
                    }
                    aria-label={`Select ${record.title}`}
                  />
                </label>
                <DevicePreview record={record} className="device-custom-preview" />
                <div className="device-custom-meta">
                  <h3>{record.title}</h3>
                  <p>
                    <code>{record.id}</code> · {record.category} ·{" "}
                    {record.pins.length} pins ·{" "}
                    {record.artwork.shapes ? "editable artwork" : "fixed artwork"}
                  </p>
                </div>
                <div className="device-custom-actions">
                  <button type="button" className="text-button" onClick={() => openEditDevice(record)}>
                    Edit
                  </button>
                  <button type="button" className="text-button" onClick={() => duplicateDevice(record)}>
                    Duplicate
                  </button>
                  <button
                    type="button"
                    className="text-button is-danger"
                    onClick={() => setPendingDeleteId(record.id)}
                  >
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
          {userDevices.length === 0 ? (
            <div className="device-library-empty">
              No custom devices yet. Create one or import a shared library.
            </div>
          ) : null}
        </>
      ) : null}

      {importState ? (
        <div className="modal-backdrop" role="presentation">
          <div className="modal-card device-import-dialog" role="dialog" aria-modal="true">
            <span className="modal-kicker">Library import</span>
            <h2>{importState.conflicts.filter((conflict) => !conflict.identical).length} conflicting devices</h2>
            <p>
              The imported library defines device IDs that already exist locally.
              Choose how to resolve them. Identical devices are always skipped.
            </p>
            <ul>
              {importState.conflicts
                .filter((conflict) => !conflict.identical)
                .slice(0, 12)
                .map((conflict) => (
                  <li key={conflict.id}>
                    <code>{conflict.id}</code>
                  </li>
                ))}
            </ul>
            <div className="modal-actions">
              <button type="button" onClick={() => setImportState(null)}>
                Cancel
              </button>
              <button type="button" onClick={() => applyImport("keep-local")}>
                Keep local
              </button>
              <button type="button" onClick={() => applyImport("copy")}>
                Import as copies
              </button>
              <button type="button" className="primary-button" onClick={() => applyImport("replace")}>
                Replace
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {pendingDeleteId ? (
        <div className="modal-backdrop" role="presentation">
          <div className="modal-card" role="alertdialog" aria-modal="true">
            <span className="modal-kicker">Delete device</span>
            <h2>Remove {userDevices.find((device) => device.id === pendingDeleteId)?.title}?</h2>
            <p>Existing project files that embed this device keep their snapshot.</p>
            <div className="modal-actions">
              <button type="button" onClick={() => setPendingDeleteId(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="primary-button is-danger"
                onClick={() => {
                  const record = userDevices.find((device) => device.id === pendingDeleteId);
                  if (record) {
                    deleteDevice(record);
                  }
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmClose ? (
        <div className="modal-backdrop" role="presentation">
          <div className="modal-card" role="alertdialog" aria-modal="true">
            <span className="modal-kicker">Unsaved library change</span>
            <h2>Save the custom device library?</h2>
            <p>
              Device edits are kept in the draft until you save the library.
            </p>
            <div className="modal-actions">
              <button type="button" onClick={() => setConfirmClose(false)}>
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onDiscardUserLibrary();
                  setConfirmClose(false);
                  onClose();
                }}
              >
                Discard
              </button>
              <button
                type="button"
                className="primary-button"
                disabled={saving}
                onClick={() => void saveUserLibrary()}
              >
                <Icon name="save" /> Save
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
