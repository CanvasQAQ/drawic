import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  defaultDeviceValue,
  loadDeviceLibrary,
  parseDeviceLibrary,
  suggestedReference,
} from "../core/library";
import {
  addComponent,
  addAnnotation as addAnnotationOperation,
  addShape as addShapeOperation,
  addWire as addWireOperation,
  mirrorSelection,
  moveNodes,
  removeSelection,
  renameNet,
  rotateSelection,
  updateAnnotation,
  updateNode,
  updateNodeLabel,
  updateShape,
  updateWirePoints,
} from "../core/editor";
import { buildConnectivity } from "../core/connectivity";
import { runElectricalRules } from "../core/erc";
import { buildSchematicSvg } from "../core/export/svg";
import {
  commitHistory,
  createHistory,
  redoHistory,
  undoHistory,
  type HistoryState,
} from "../core/history";
import {
  createDocument,
  createEmptyPage,
  createIdentifier,
  defaultNetName,
  junctionSelectionId,
  pageById,
  parseProjectText,
  serializeProject,
  type Annotation,
  type Diagnostic,
  type DrawicDocument,
  type Point,
  type SelectionRef,
  type ShapeKind,
  type SymbolDefinition,
} from "../core/model";
import {
  addJunction,
  addPage,
  deletePage,
  duplicatePage,
  movePage,
  renamePage,
} from "../core/project";
import { exportSpice, importSpice } from "../core/spice";
import { normalizeDocumentWireOverlaps } from "../core/wireMerge";
import type { AppCommand, OpenProjectPayload } from "../shared/bridge";
import builtInDeviceLibraryJson from "./assets/device-libraries/drawic-built-in.drawiclib.json";
import { PageBar } from "./components/PageBar";
import { ExportDialog, NameDialog, UnsavedDialog } from "./components/Dialogs";
import { ErcPanel } from "./components/ErcPanel";
import { Icon } from "./components/Icons";
import { LibraryPanel } from "./components/LibraryPanel";
import { PropertiesPanel } from "./components/PropertiesPanel";
import { SchematicCanvas } from "./components/SchematicCanvas";
import { Toolbar, type EditorTool } from "./components/Toolbar";

const library = loadDeviceLibrary(parseDeviceLibrary(builtInDeviceLibraryJson)).symbols;

type NameDialogState =
  | { kind: "new-page"; initial: string }
  | { kind: "rename-page"; initial: string }
  | null;

type PendingAction = () => void | Promise<void>;
type ExportKind = "svg" | "png" | "pdf";

function projectNameFromPath(path: string | null): string {
  if (!path) {
    return "Untitled";
  }
  return (
    path
      .split(/[\\/]/)
      .at(-1)
      ?.replace(/\.drawic\.json$/i, "") ?? "Untitled"
  );
}

function nextPageName(document: DrawicDocument): string {
  let index = document.pages.length + 1;
  while (document.pages.some((page) => page.name === `Page ${index}`)) {
    index += 1;
  }
  return `Page ${index}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "An unexpected error occurred.";
}

export function App() {
  const [initialDocument] = useState(() => createDocument());
  const [activePageId, setActivePageId] = useState(
    () => initialDocument.pages[0]?.id ?? "",
  );
  const [history, setHistory] = useState<HistoryState<DrawicDocument>>(() =>
    createHistory(initialDocument),
  );
  const [savedText, setSavedText] = useState(() => serializeProject(initialDocument));
  const [filePath, setFilePath] = useState<string | null>(null);
  const [selection, setSelection] = useState<SelectionRef[]>([]);
  const [tool, setTool] = useState<EditorTool>("select");
  const [placementSymbol, setPlacementSymbol] = useState<SymbolDefinition | null>(null);
  const [libraryVisible, setLibraryVisible] = useState(true);
  const [propertiesVisible, setPropertiesVisible] = useState(true);
  const [diagnostics, setDiagnostics] = useState<Diagnostic[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [nameDialog, setNameDialog] = useState<NameDialogState>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [recovery, setRecovery] = useState<{
    content: string;
    savedAt: string;
  } | null>(null);
  const launchChecked = useRef(false);
  const recoveryChecked = useRef(false);

  const document = history.present;
  const page = useMemo(
    () => document.pages.find((candidate) => candidate.id === activePageId) ?? document.pages[0]!,
    [activePageId, document],
  );
  const serialized = useMemo(() => serializeProject(document), [document]);
  const pageConnectivity = useMemo(
    () => buildConnectivity(page, library),
    [page],
  );
  const dirty = serialized !== savedText;
  const visiblePathName = filePath ?? `${document.title}.drawic.json`;
  const hasSelection = selection.length > 0;
  const hasNodeSelection = selection.some((item) => item.kind === "node");
  const hasShapeSelection = selection.some((item) => item.kind === "shape");

  const commitDocument = useCallback((next: DrawicDocument) => {
    setHistory((current) => commitHistory(current, next));
  }, []);

  const commitMutation = useCallback((mutation: (current: DrawicDocument) => DrawicDocument) => {
    setHistory((current) => commitHistory(current, mutation(current.present)));
  }, []);

  const replaceDocument = useCallback(
    (next: DrawicDocument, saved: string | null, path: string | null, resetHistory = true) => {
      if (resetHistory) {
        setHistory(createHistory(next));
      } else {
        commitDocument(next);
      }
      if (saved !== null) {
        setSavedText(saved);
      }
      setFilePath(path);
      setActivePageId(next.pages[0]?.id ?? "");
      setSelection([]);
      setPlacementSymbol(null);
      setTool("select");
      setDiagnostics(null);
    },
    [commitDocument],
  );

  const saveProject = useCallback(
    async (forceDialog = false): Promise<boolean> => {
      try {
        const content = serializeProject(history.present);
        const result = await window.drawic.saveProject({
          path: forceDialog ? null : filePath,
          suggestedName: projectNameFromPath(filePath),
          content,
          projectId: history.present.id,
        });
        if (result.canceled || !result.path) {
          return false;
        }
        setFilePath(result.path);
        setSavedText(content);
        await window.drawic.clearRecovery(history.present.id);
        setNotice(`Saved ${projectNameFromPath(result.path)}.drawic.json`);
        return true;
      } catch (error) {
        setNotice(`Save failed: ${errorMessage(error)}`);
        return false;
      }
    },
    [filePath, history.present],
  );

  const loadOpenPayload = useCallback(
    (payload: OpenProjectPayload) => {
      try {
        const parsed = parseProjectText(payload.content);
        const normalized = normalizeDocumentWireOverlaps(parsed);
        replaceDocument(normalized, serializeProject(parsed), payload.path);
        setNotice(`Opened ${projectNameFromPath(payload.path)}.drawic.json`);
      } catch (error) {
        setNotice(`Could not open project: ${errorMessage(error)}`);
      }
    },
    [replaceDocument],
  );

  const guardUnsaved = useCallback(
    (action: PendingAction) => {
      if (dirty) {
        setPendingAction(() => action);
      } else {
        void action();
      }
    },
    [dirty],
  );

  const newProject = useCallback(() => {
    guardUnsaved(() => {
      const next = createDocument();
      replaceDocument(next, serializeProject(next), null);
      setNotice("Started a new Drawic project.");
    });
  }, [guardUnsaved, replaceDocument]);

  const openProject = useCallback(() => {
    guardUnsaved(async () => {
      try {
        const payload = await window.drawic.openProject();
        if (payload) {
          loadOpenPayload(payload);
        }
      } catch (error) {
        setNotice(`Open failed: ${errorMessage(error)}`);
      }
    });
  }, [guardUnsaved, loadOpenPayload]);

  const importSpiceFile = useCallback(async () => {
    try {
      const payload = await window.drawic.importSpice();
      if (!payload) {
        return;
      }
      const imported = importSpice(payload.content, {
        pageName:
          payload.path
            .split(/[\\/]/)
            .at(-1)
            ?.replace(/\.[^.]+$/, "") ?? "Imported SPICE",
        library,
      });
      commitMutation((current) => addPage(current, imported.page));
      setActivePageId(imported.page.id);
      setSelection([]);
      setTool("select");
      const warningText =
        imported.warnings.length > 0 ? ` ${imported.warnings.length} warning(s).` : "";
      setNotice(
        `Imported ${imported.page.nodes.length} SPICE element(s) into ${imported.page.name}.${warningText}`,
      );
    } catch (error) {
      setNotice(`SPICE import failed: ${errorMessage(error)}`);
    }
  }, [commitMutation]);

  const exportDiagram = useCallback(
    async (kind: ExportKind) => {
      setExportOpen(false);
      try {
        const activePage = pageById(history.present, activePageId);
        const svg = buildSchematicSvg(activePage, library);
        const result = await window.drawic.exportSchematic({
          kind,
          suggestedName: `${projectNameFromPath(filePath)}-${activePage.name}`,
          svg,
        });
        if (!result.canceled && result.path) {
          setNotice(
            `Exported ${kind.toUpperCase()} (${result.bytes?.toLocaleString() ?? "?"} bytes).`,
          );
        }
      } catch (error) {
        setNotice(`Export failed: ${errorMessage(error)}`);
      }
    },
    [activePageId, filePath, history.present],
  );

  const saveSpiceFile = useCallback(async () => {
    try {
      const activePage = pageById(history.present, activePageId);
      const result = exportSpice(activePage, library);
      const saved = await window.drawic.saveSpice(
        `${projectNameFromPath(filePath)}-${activePage.name}`,
        result.text,
      );
      if (!saved.canceled && saved.path) {
        const unsupported =
          result.unsupportedDevices.length > 0
            ? ` ${result.unsupportedDevices.length} device(s) were explicitly omitted.`
            : "";
        setNotice(`Exported SPICE netlist.${unsupported}`);
      }
    } catch (error) {
      setNotice(`SPICE export failed: ${errorMessage(error)}`);
    }
  }, [activePageId, filePath, history.present]);

  const runErc = useCallback(() => {
    setDiagnostics(runElectricalRules(pageById(history.present, activePageId), library));
  }, [activePageId, history.present]);

  const goToDiagnostic = useCallback(
    (itemId: string) => {
      const active = pageById(history.present, activePageId);
      if (active.nodes.some((node) => node.id === itemId)) {
        setSelection([{ kind: "node", id: itemId }]);
      } else if (active.wires.some((wire) => wire.id === itemId)) {
        setSelection([{ kind: "wire", id: itemId }]);
      } else if (active.annotations.some((annotation) => annotation.id === itemId)) {
        setSelection([{ kind: "annotation", id: itemId }]);
      }
    },
    [activePageId, history.present],
  );

  const undo = useCallback(() => {
    setHistory((current) => undoHistory(current));
    setDiagnostics(null);
  }, []);

  const redo = useCallback(() => {
    setHistory((current) => redoHistory(current));
    setDiagnostics(null);
  }, []);

  const deleteSelection = useCallback(() => {
    if (selection.length === 0) {
      return;
    }
    commitMutation((current) => removeSelection(current, activePageId, selection));
    setSelection([]);
    setDiagnostics(null);
  }, [activePageId, commitMutation, selection]);

  const rotateSelected = useCallback(() => {
    commitMutation((current) =>
      rotateSelection(current, activePageId, selection, library),
    );
    setDiagnostics(null);
  }, [activePageId, commitMutation, selection]);

  const mirrorSelected = useCallback(() => {
    commitMutation((current) =>
      mirrorSelection(current, activePageId, selection, library),
    );
    setDiagnostics(null);
  }, [activePageId, commitMutation, selection]);

  const placeAt = useCallback(
    (point: Point) => {
      if (!placementSymbol) {
        return;
      }
      const active = pageById(history.present, activePageId);
      const reference = suggestedReference(
        placementSymbol,
        active.nodes.map((node) => node.reference),
      );
      const id = createIdentifier("node");
      commitMutation((current) =>
        addComponent(current, activePageId, {
          symbol: placementSymbol,
          reference,
          value: defaultDeviceValue(placementSymbol.id, placementSymbol),
          point,
          id,
        }),
      );
      setSelection([{ kind: "node", id }]);
      setNotice(`Placed ${reference}. Placement remains active.`);
    },
    [activePageId, commitMutation, history.present, placementSymbol],
  );

  const addWire = useCallback(
    (
      points: Point[],
      anchors?: {
        startAnchor?: { deviceId: string; pinId: string };
        endAnchor?: { deviceId: string; pinId: string };
      },
      junctionPoints?: Point[],
    ) => {
      const id = createIdentifier("wire");
      commitMutation((current) =>
        addWireOperation(current, activePageId, {
          points,
          id,
          ...(junctionPoints && junctionPoints.length > 0
            ? { junctionPoints }
            : {}),
          ...anchors,
        }),
      );
      setSelection([{ kind: "wire", id }]);
      setDiagnostics(null);
    },
    [activePageId, commitMutation],
  );

  const addJunctionPoint = useCallback(
    (point: Point) => {
      commitMutation((current) => addJunction(current, activePageId, point));
      setNotice("Junction added. Crossing wires now share a net at this point.");
      setDiagnostics(null);
    },
    [activePageId, commitMutation],
  );

  const updateWire = useCallback(
    (wireId: string, points: Point[]) => {
      commitMutation((current) =>
        updateWirePoints(current, page.id, wireId, points),
      );
      setDiagnostics(null);
    },
    [commitMutation, page.id],
  );

  const addDrawingShape = useCallback(
    (
      kind: ShapeKind,
      bounds: { x: number; y: number; width: number; height: number },
    ) => {
      const id = createIdentifier("shape");
      commitMutation((current) =>
        addShapeOperation(current, page.id, { ...bounds, kind, id }),
      );
      setSelection([{ kind: "shape", id }]);
      setDiagnostics(null);
    },
    [commitMutation, page.id],
  );

  const addLabel = useCallback(
    (kind: Annotation["kind"], point: Point, wireId?: string) => {
      const active = pageById(history.present, activePageId);
      let text = "Text";
      if (kind === "net") {
        text =
          (wireId && pageConnectivity.netNameByWire.get(wireId)) ??
          defaultNetName(
            Math.max(0, active.wires.findIndex((wire) => wire.id === wireId)),
          );
      }
      const id = createIdentifier("annotation");
      commitMutation((current) =>
        addAnnotationOperation(current, activePageId, {
          kind,
          text,
          point,
          id,
          ...(wireId ? { wireId } : {}),
        }),
      );
      setSelection([{ kind: "annotation", id }]);
      setDiagnostics(null);
      setNotice(
        kind === "net"
          ? "Net label added to the wire. Edit its name in Properties."
          : "Text added. Edit it in Properties.",
      );
    },
    [activePageId, commitMutation, history.present, pageConnectivity],
  );

  const updateWireName = useCallback(
    (wireId: string, name: string) => {
      const active = pageById(history.present, activePageId);
      const networkId = pageConnectivity.networkIdByWire.get(wireId);
      if (!networkId) {
        return;
      }
      const wireIds = active.wires
        .filter(
          (wire) =>
            pageConnectivity.networkIdByWire.get(wire.id) === networkId,
        )
        .map((wire) => wire.id);
      const annotationIds = active.annotations
        .filter(
          (annotation) =>
            pageConnectivity.networkIdByAnnotation.get(annotation.id) ===
            networkId,
        )
        .map((annotation) => annotation.id);
      commitMutation((current) =>
        renameNet(
          current,
          activePageId,
          wireIds,
          annotationIds,
          name,
        ),
      );
      setDiagnostics(null);
    },
    [
      activePageId,
      commitMutation,
      history.present,
      pageConnectivity,
    ],
  );

  const moveSelected = useCallback(
    (delta: Point) => {
      const ids = selection.filter((item) => item.kind === "node").map((item) => item.id);
      if (ids.length > 0) {
        commitMutation((current) =>
          moveNodes(current, activePageId, ids, delta, library),
        );
        setDiagnostics(null);
      }
    },
    [activePageId, commitMutation, selection],
  );

  const changeTool = useCallback((nextTool: EditorTool) => {
    setTool(nextTool);
    if (nextTool !== "place") {
      setPlacementSymbol(null);
    }
    if (nextTool === "net-label") {
      setNotice("Net Label: click a wire to attach a visible network name.");
    } else if (nextTool === "junction") {
      setNotice("Junction: click where wires should become one network.");
    }
  }, []);

  const chooseSymbol = useCallback((symbol: SymbolDefinition) => {
    setPlacementSymbol(symbol);
    setTool("place");
    setNotice(`Placement mode: ${symbol.label}. Escape finishes continuous placement.`);
  }, []);

  const createPageWithName = useCallback(
    (name: string) => {
      const nextPage = createEmptyPage(name, createIdentifier("page"));
      commitMutation((current) => addPage(current, nextPage));
      setActivePageId(nextPage.id);
      setSelection([]);
      setTool("select");
      setNameDialog(null);
      setNotice(`Created page ${name}.`);
    },
    [commitMutation],
  );

  const renameActivePage = useCallback(
    (name: string) => {
      commitMutation((current) => renamePage(current, activePageId, name));
      setNameDialog(null);
    },
    [activePageId, commitMutation],
  );

  const duplicateActivePage = useCallback(() => {
    const pageId = createIdentifier("page");
    commitMutation((current) =>
      duplicatePage(current, activePageId, { idFactory: createIdentifier, pageId }),
    );
    setActivePageId(pageId);
    setSelection([]);
    setDiagnostics(null);
    setNotice("Page duplicated.");
  }, [activePageId, commitMutation]);

  const deleteActivePage = useCallback(() => {
    if (document.pages.length <= 1) {
      return;
    }
    const index = document.pages.findIndex((candidate) => candidate.id === activePageId);
    const fallback = document.pages[index - 1] ?? document.pages[index + 1];
    commitMutation((current) => deletePage(current, activePageId));
    if (fallback) {
      setActivePageId(fallback.id);
    }
    setSelection([]);
    setDiagnostics(null);
  }, [activePageId, commitMutation, document.pages]);

  const moveActivePage = useCallback(
    (pageId: string, direction: -1 | 1) => {
      commitMutation((current) => movePage(current, pageId, direction));
    },
    [commitMutation],
  );

  const exportOpenHandler = useCallback(() => setExportOpen(true), []);

  useEffect(() => {
    window.drawic.setDocumentDirty(dirty);
  }, [dirty]);

  useEffect(() => {
    if (!dirty) {
      return;
    }
    const timer = window.setTimeout(() => {
      void window.drawic
        .checkpoint({ projectId: document.id, content: serialized })
        .catch((error) => setNotice(`Recovery checkpoint failed: ${errorMessage(error)}`));
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [dirty, document.id, serialized]);

  useEffect(() => {
    if (launchChecked.current) {
      return;
    }
    launchChecked.current = true;
    void window.drawic
      .getLaunchProject()
      .then((payload) => {
        if (payload) {
          loadOpenPayload(payload);
        }
      })
      .catch((error) => setNotice(`Launch file failed: ${errorMessage(error)}`));
  }, [loadOpenPayload]);

  useEffect(() => {
    if (recoveryChecked.current) {
      return;
    }
    recoveryChecked.current = true;
    void window.drawic
      .getRecovery()
      .then((payload) => {
        if (payload) {
          setRecovery({ content: payload.content, savedAt: payload.savedAt });
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!document.pages.some((candidate) => candidate.id === activePageId)) {
      setActivePageId(document.pages[0]?.id ?? "");
      return;
    }
    const active = pageById(document, activePageId);
    setSelection((current) =>
      current.filter((item) => {
        if (item.kind === "node") {
          return active.nodes.some((node) => node.id === item.id);
        }
        if (item.kind === "node-label") {
          return active.nodes.some((node) => node.id === item.id);
        }
        if (item.kind === "wire") {
          return active.wires.some((wire) => wire.id === item.id);
        }
        if (item.kind === "junction") {
          return active.junctions.some(
            (junction) => junctionSelectionId(junction) === item.id,
          );
        }
        if (item.kind === "annotation") {
          return active.annotations.some((annotation) => annotation.id === item.id);
        }
        return active.shapes.some((shape) => shape.id === item.id);
      }),
    );
  }, [activePageId, document]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable;
      if (event.key === "Escape") {
        setPlacementSymbol(null);
        setTool("select");
        setExportOpen(false);
        setNameDialog(null);
        return;
      }
      if (isTyping) {
        return;
      }
      if (event.key.toLowerCase() === "v") {
        event.preventDefault();
        changeTool("select");
      } else if (event.key.toLowerCase() === "w") {
        event.preventDefault();
        changeTool("wire");
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [changeTool]);

  const handleCommand = useCallback(
    (command: AppCommand) => {
      switch (command) {
        case "new-project":
          newProject();
          break;
        case "open-project":
          openProject();
          break;
        case "save-project":
          void saveProject(false);
          break;
        case "save-project-as":
          void saveProject(true);
          break;
        case "save-project-before-close":
          void saveProject(false).then((saved) => {
            if (saved) {
              window.drawic.finishClose();
            }
          });
          break;
        case "undo":
          undo();
          break;
        case "redo":
          redo();
          break;
        case "delete-selection":
          deleteSelection();
          break;
        case "rotate-selection":
          rotateSelected();
          break;
        case "mirror-selection":
          mirrorSelected();
          break;
        case "export-svg":
          void exportDiagram("svg");
          break;
        case "export-png":
          void exportDiagram("png");
          break;
        case "export-pdf":
          void exportDiagram("pdf");
          break;
        case "import-spice":
          void importSpiceFile();
          break;
        case "export-spice":
          void saveSpiceFile();
          break;
        case "run-erc":
          runErc();
          break;
        case "toggle-library":
          setLibraryVisible((visible) => !visible);
          break;
        case "toggle-properties":
          setPropertiesVisible((visible) => !visible);
          break;
      }
    },
    [
      deleteSelection,
      exportDiagram,
      importSpiceFile,
      mirrorSelected,
      newProject,
      openProject,
      redo,
      rotateSelected,
      runErc,
      saveProject,
      saveSpiceFile,
      undo,
    ],
  );

  useEffect(() => window.drawic.onCommand(handleCommand), [handleCommand]);

  useEffect(
    () =>
      window.drawic.onProjectOpen((payload) => {
        guardUnsaved(() => loadOpenPayload(payload));
      }),
    [guardUnsaved, loadOpenPayload],
  );

  const restoreRecovery = useCallback(() => {
    if (!recovery) {
      return;
    }
    try {
      const parsed = parseProjectText(recovery.content);
      replaceDocument(parsed, "", null);
      setRecovery(null);
      setNotice("Recovered unsaved work. Save it to a project file when ready.");
    } catch (error) {
      setNotice(`Recovery data is invalid: ${errorMessage(error)}`);
    }
  }, [recovery, replaceDocument]);

  const dismissRecovery = useCallback(async () => {
    if (!recovery) {
      return;
    }
    try {
      const parsed = parseProjectText(recovery.content);
      await window.drawic.clearRecovery(parsed.id);
    } catch {
      // An unreadable recovery file cannot yield a safe project identifier.
    }
    setRecovery(null);
  }, [recovery]);

  const runPendingSave = useCallback(async () => {
    const action = pendingAction;
    const saved = await saveProject(false);
    if (saved && action) {
      setPendingAction(null);
      await action();
    }
  }, [pendingAction, saveProject]);

  const runPendingDiscard = useCallback(async () => {
    const action = pendingAction;
    setPendingAction(null);
    if (action) {
      await action();
    }
  }, [pendingAction]);

  return (
    <div className="app-shell">
      <Toolbar
        documentTitle={`${projectNameFromPath(filePath)}${dirty ? " •" : ""}`}
        dirty={dirty}
        tool={tool}
        canUndo={history.past.length > 0}
        canRedo={history.future.length > 0}
        canDelete={hasSelection}
        canRotate={hasNodeSelection || hasShapeSelection}
        canMirror={hasNodeSelection}
        placementLabel={placementSymbol?.label ?? null}
        onNew={newProject}
        onOpen={openProject}
        onSave={() => void saveProject(false)}
        onTool={changeTool}
        onUndo={undo}
        onRedo={redo}
        onDelete={deleteSelection}
        onRotate={rotateSelected}
        onMirror={mirrorSelected}
        onExport={exportOpenHandler}
      />

      {recovery ? (
        <div className="recovery-banner" role="status">
          <span>
            <strong>Recovery available.</strong> Drawic found unsaved work from{" "}
            {new Date(recovery.savedAt).toLocaleString()}.
          </span>
          <div>
            <button type="button" className="text-button" onClick={() => void dismissRecovery()}>
              Dismiss
            </button>
            <button type="button" className="primary-button small" onClick={restoreRecovery}>
              Restore
            </button>
          </div>
        </div>
      ) : null}

      {notice ? (
        <div className="notice-bar" role="status">
          <span>{notice}</span>
          <button type="button" aria-label="Dismiss message" onClick={() => setNotice(null)}>
            <Icon name="close" />
          </button>
        </div>
      ) : null}

      <div
        className={`workspace${libraryVisible ? " has-library" : " no-library"}${propertiesVisible ? " has-properties" : " no-properties"}`}
      >
        {libraryVisible ? (
          <LibraryPanel
            symbols={library}
            selectedSymbolId={placementSymbol?.id ?? null}
            onSelect={chooseSymbol}
            onCollapse={() => setLibraryVisible(false)}
          />
        ) : (
          <button
            type="button"
            className="panel-rail panel-rail-left"
            onClick={() => setLibraryVisible(true)}
            aria-label="Show device library"
          >
            <span>Devices</span>
            <Icon name="chevron" />
          </button>
        )}

        <main className="editor-column">
          <PageBar
            pages={document.pages}
            activePageId={page.id}
            onSelect={(pageId) => {
              setActivePageId(pageId);
              setSelection([]);
              setDiagnostics(null);
            }}
            onAdd={() =>
              setNameDialog({ kind: "new-page", initial: nextPageName(document) })
            }
            onRename={() =>
              setNameDialog({ kind: "rename-page", initial: page.name })
            }
            onDuplicate={duplicateActivePage}
            onDelete={deleteActivePage}
            onMove={moveActivePage}
          />
          <SchematicCanvas
            page={page}
            library={library}
            tool={tool}
            placementSymbol={placementSymbol}
            selection={selection}
            onSelectionChange={setSelection}
            onPlace={placeAt}
            onAddWire={addWire}
            onUpdateWire={updateWire}
            onUpdateNode={(nodeId, patch) =>
              commitMutation((current) =>
                updateNode(current, page.id, nodeId, patch, library),
              )
            }
            onMoveNodeLabel={(nodeId, label, delta) =>
              commitMutation((current) => {
                const node = pageById(current, page.id).nodes.find(
                  (candidate) => candidate.id === nodeId,
                );
                return updateNodeLabel(current, page.id, nodeId, label, {
                  offset: {
                    x: (node?.labelLayout?.[label]?.offset.x ?? 0) + delta.x,
                    y: (node?.labelLayout?.[label]?.offset.y ?? 0) + delta.y,
                  },
                });
              })
            }
            onAddJunction={addJunctionPoint}
            onAddAnnotation={addLabel}
            onUpdateAnnotation={(annotationId, patch) =>
              commitMutation((current) =>
                updateAnnotation(current, page.id, annotationId, patch),
              )
            }
            onAddShape={addDrawingShape}
            onUpdateShape={(shapeId, patch) =>
              commitMutation((current) => updateShape(current, page.id, shapeId, patch))
            }
            onMoveSelected={moveSelected}
          />
        </main>

        {propertiesVisible ? (
          <PropertiesPanel
            page={page}
            selection={selection}
            netNameByWire={pageConnectivity.netNameByWire}
            onUpdateNode={(nodeId, patch) =>
              commitMutation((current) =>
                updateNode(current, page.id, nodeId, patch, library),
              )
            }
            onUpdateNodeLabel={(nodeId, label, patch) =>
              commitMutation((current) =>
                updateNodeLabel(current, page.id, nodeId, label, patch),
              )
            }
            onUpdateAnnotation={(annotationId, patch) =>
              commitMutation((current) =>
                updateAnnotation(current, page.id, annotationId, patch),
              )
            }
            onUpdateShape={(shapeId, patch) =>
              commitMutation((current) => updateShape(current, page.id, shapeId, patch))
            }
            onUpdateWireName={updateWireName}
            onRotate={rotateSelected}
            onMirror={mirrorSelected}
            onDelete={deleteSelection}
            onCollapse={() => setPropertiesVisible(false)}
            onRenamePage={() =>
              setNameDialog({ kind: "rename-page", initial: page.name })
            }
          />
        ) : (
          <button
            type="button"
            className="panel-rail panel-rail-right"
            onClick={() => setPropertiesVisible(true)}
            aria-label="Show properties"
          >
            <Icon name="chevron" />
            <span>Properties</span>
          </button>
        )}
      </div>

      <footer className="status-bar">
        <div>
          <span className="status-led" aria-hidden="true" />
          <span>{page.name}</span>
          <span>{page.nodes.length} devices</span>
          <span>{page.wires.length} wires</span>
          <span>{page.annotations.length} labels</span>
        </div>
        <div>
          <span>
            Tool:{" "}
            {placementSymbol
              ? `Place ${placementSymbol.label}`
              : tool === "net-label"
                ? "Net Label"
                : tool}
          </span>
          <button type="button" onClick={runErc}>
            Run ERC
          </button>
          <span>{dirty ? "Modified" : "Local file synced"}</span>
          <span>Preview 0.2.0</span>
        </div>
      </footer>

      {diagnostics ? (
        <ErcPanel
          diagnostics={diagnostics}
          onClose={() => setDiagnostics(null)}
          onSelectItem={goToDiagnostic}
        />
      ) : null}

      {nameDialog ? (
        <NameDialog
          key={`${nameDialog.kind}-${nameDialog.initial}`}
          title={nameDialog.kind === "new-page" ? "Create page" : "Rename page"}
          label="Page name"
          initialValue={nameDialog.initial}
          confirmLabel={nameDialog.kind === "new-page" ? "Create" : "Rename"}
          onCancel={() => setNameDialog(null)}
          onConfirm={
            nameDialog.kind === "new-page" ? createPageWithName : renameActivePage
          }
        />
      ) : null}

      {pendingAction ? (
        <UnsavedDialog
          onSave={() => void runPendingSave()}
          onDiscard={() => void runPendingDiscard()}
          onCancel={() => setPendingAction(null)}
        />
      ) : null}

      {exportOpen ? (
        <ExportDialog title="Export & tools" onClose={() => setExportOpen(false)}>
          <div className="export-grid">
            <button
              type="button"
              onClick={() => {
                setExportOpen(false);
                void importSpiceFile();
              }}
            >
              <span className="export-format">SPICE</span>
              <strong>Import netlist</strong>
              <small>Basic R, C, L, V, I, D, M, Q elements</small>
            </button>
            <button
              type="button"
              onClick={() => {
                setExportOpen(false);
                void saveSpiceFile();
              }}
            >
              <span className="export-format">CIR</span>
              <strong>Export SPICE</strong>
              <small>Deterministic local netlist</small>
            </button>
            <button type="button" onClick={() => void exportDiagram("svg")}>
              <span className="export-format">SVG</span>
              <strong>Export vector</strong>
              <small>Self-contained SVG with no external resources</small>
            </button>
            <button type="button" onClick={() => void exportDiagram("png")}>
              <span className="export-format">PNG</span>
              <strong>Export image</strong>
              <small>White-paper raster image</small>
            </button>
            <button type="button" onClick={() => void exportDiagram("pdf")}>
              <span className="export-format">PDF</span>
              <strong>Export document</strong>
              <small>Local bitmap-backed PDF</small>
            </button>
            <button
              type="button"
              onClick={() => {
                setExportOpen(false);
                runErc();
              }}
            >
              <span className="export-format">ERC</span>
              <strong>Check active page</strong>
              <small>References, dangling pins, and wire geometry</small>
            </button>
          </div>
          <p className="dialog-footnote">
            Current file: <code>{visiblePathName}</code>
          </p>
        </ExportDialog>
      ) : null}
    </div>
  );
}
