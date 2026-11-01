import { agentRequest, type AgentRequest } from "./agentCommands";
import { addComponent, addWire } from "./editor";
import { nodePinPosition, pointsEqual } from "./geometry";
import { commitHistory, createHistory, type HistoryState } from "./history";
import {
  allWires, createIdentifier, pageById, parseProjectText, serializeProject,
  type ConnectionAnchor, type DrawicDocument, type DrawingPage, type SymbolDefinition,
} from "./model";
import { findNetGraphViolations } from "./netGraph";
import { routeWireGeometry } from "./routing";

type EditRequest = Extract<AgentRequest, { tool: "edit_page" }>;
type DocumentHistory = HistoryState<DrawicDocument>;

const PAGE_SIZE = 50;
const RECEIPT_LIMIT = 128;
const HISTORY_BYTE_LIMIT = 64 * 1024 * 1024;

function readPage(page: DrawingPage, library: readonly SymbolDefinition[], request: Extract<AgentRequest, {tool: "read_page"}>) {
  const offset = request.offset ?? 0;
  const symbol = library.find(item => item.id === request.symbolId);
  if (request.symbolId && !symbol) throw new Error("unknown_symbol");
  const wires = allWires(page);
  return {
    pageId: page.id, pageName: page.name, grid: 10,
    nodeCount: page.nodes.length, wireCount: wires.length, symbolCount: library.length,
    nodes: page.nodes.slice(offset, offset + PAGE_SIZE).map(({ id, symbolId, x, y, reference, value, rotation }) =>
      ({ id, symbolId, x, y, reference, value, rotation })),
    wires: wires.slice(offset, offset + PAGE_SIZE).map(({ wire }) =>
      ({ id: wire.id, start: wire.start, end: wire.end })),
    symbols: library.slice(offset, offset + PAGE_SIZE).map(item => item.id),
    ...(symbol ? { pins: symbol.pins.map(({ key, x, y, side }) => ({ key, x, y, side })) } : {}),
  };
}

function pinPosition(page: DrawingPage, library: readonly SymbolDefinition[], anchor: ConnectionAnchor) {
  const node = page.nodes.find(item => item.id === anchor.deviceId);
  const symbol = library.find(item => item.id === node?.symbolId);
  const index = symbol?.pins.findIndex(pin => pin.key === anchor.pinId) ?? -1;
  if (!node || !symbol || index < 0) throw new Error("unknown_pin");
  return nodePinPosition(node, symbol, index);
}

function applyBatch(document: DrawicDocument, library: readonly SymbolDefinition[], request: EditRequest) {
  let candidate = document;
  for (const op of request.operations) {
    const page = pageById(candidate, request.pageId);
    const wires = allWires(page);
    if (page.nodes.length + wires.length >= 2000) throw new Error("page_limit");
    if (page.nodes.some(node => node.id === op.id) || wires.some(({ wire }) => wire.id === op.id)) {
      throw new Error("duplicate_id");
    }
    if (op.type === "place") {
      const symbol = library.find(item => item.id === op.symbolId && item.palette);
      if (!symbol) throw new Error("unknown_symbol");
      candidate = addComponent(candidate, page.id, {
        id: op.id, symbol, library, point: { x: op.x, y: op.y }, placementMode: "agent",
      });
    } else {
      const start = pinPosition(page, library, op.start);
      const end = pinPosition(page, library, op.end);
      if (pointsEqual(start, end)) throw new Error("coincident_pins");
      candidate = addWire(candidate, page.id, {
        id: op.id, startAnchor: op.start, endAnchor: op.end,
        points: routeWireGeometry(page, library, start, end, op.start, op.end),
      });
    }
  }
  const changed = pageById(candidate, request.pageId);
  const ids = new Set(request.operations.map(op => op.id));
  const wires = new Set(allWires(changed).map(({ wire }) => wire.id));
  if (request.operations.some(op => op.type === "connect" && !wires.has(op.id))) {
    throw new Error("wire_not_created");
  }
  if (findNetGraphViolations(changed).some(issue => issue.itemId && ids.has(issue.itemId))) {
    throw new Error("invalid_net_graph");
  }
  // Enforce document-wide uniqueness, including other pages and other object kinds.
  parseProjectText(serializeProject(candidate));
  return candidate;
}

export class EditorSession {
  private history: DocumentHistory;
  private readonly listeners = new Set<() => void>();
  private readonly receipts = new Map<string, { fingerprint: string; revision: number; ids: string[] }>();
  private readonly sizes = new WeakMap<DrawicDocument, number>();
  sessionId = createIdentifier("session");
  revision = 0;

  constructor(initial: DrawicDocument) {
    this.history = createHistory(initial);
  }

  snapshot = () => this.history;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  // Count a snapshot once when it enters history. Store the estimate, not another copy.
  private size(document: DrawicDocument) {
    const cached = this.sizes.get(document);
    if (cached !== undefined) return cached;
    const size = JSON.stringify(document).length * 2;
    this.sizes.set(document, size);
    return size;
  }

  update = (mutate: (value: DocumentHistory) => DocumentHistory) => {
    const next = mutate(this.history);
    if (next === this.history) return;
    let remaining = HISTORY_BYTE_LIMIT;
    let start = next.past.length;
    while (start > 0 && (remaining -= this.size(next.past[start - 1]!)) >= 0) start--;
    this.history = start ? { ...next, past: next.past.slice(start) } : next;
    this.revision++;
    this.listeners.forEach(listener => listener());
  };

  replace(document: DrawicDocument) {
    this.sessionId = createIdentifier("session");
    this.revision = 0;
    this.receipts.clear();
    this.history = createHistory(document);
    this.listeners.forEach(listener => listener());
  }

  // Changes in locally resolved device definitions affect electrical editing even
  // if the project file itself did not change.
  invalidateDeviceContext() {
    this.revision++;
  }

  request(raw: unknown, activePage: string, library: readonly SymbolDefinition[], busy: boolean) {
    const request = agentRequest.parse(raw);
    const version = { sessionId: this.sessionId, revision: this.revision };
    if (request.tool === "read_page") {
      const page = pageById(this.history.present, activePage);
      return { ...version, busy, ...readPage(page, library, request) };
    }
    if (request.sessionId !== this.sessionId) throw new Error("stale_session");
    const fingerprint = JSON.stringify(request);
    const receipt = this.receipts.get(request.requestId);
    if (receipt) {
      if (fingerprint !== receipt.fingerprint) throw new Error("request_id_reused");
      return { ...version, committedRevision: receipt.revision, ids: receipt.ids, replayed: true };
    }
    if (request.expectedRevision !== this.revision) throw new Error("revision_conflict");
    if (busy || request.pageId !== activePage) throw new Error("workspace_busy_or_inactive_page");
    const candidate = applyBatch(this.history.present, library, request);
    this.update(history => commitHistory(history, candidate));
    const ids = request.operations.map(op => op.id);
    this.receipts.set(request.requestId, { fingerprint, revision: this.revision, ids });
    if (this.receipts.size > RECEIPT_LIMIT) this.receipts.delete(this.receipts.keys().next().value!);
    return { sessionId: this.sessionId, revision: this.revision, committedRevision: this.revision, ids, replayed: false };
  }
}
