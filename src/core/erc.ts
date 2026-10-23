import { buildConnectivity, pinGraphKey, wireGraphKey } from "./connectivity";
import { isOrthogonalPath } from "./geometry";
import type { Diagnostic, SchematicCell, SymbolDefinition } from "./model";

export function runElectricalRules(
  cell: SchematicCell,
  library: readonly SymbolDefinition[],
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const connectivity = buildConnectivity(cell, library);
  const symbols = new Map(library.map((symbol) => [symbol.id, symbol]));

  const refs = new Map<string, string[]>();
  for (const node of cell.nodes) {
    if (!node.reference.trim()) {
      diagnostics.push({
        code: "empty-reference",
        severity: "error",
        message: `Device ${node.id} has no reference designator.`,
        cellId: cell.id,
        itemId: node.id,
      });
    } else {
      const nodes = refs.get(node.reference.trim()) ?? [];
      nodes.push(node.id);
      refs.set(node.reference.trim(), nodes);
    }
  }
  for (const [reference, nodeIds] of refs) {
    if (nodeIds.length > 1) {
      for (const nodeId of nodeIds) {
        diagnostics.push({
          code: "duplicate-reference",
          severity: "error",
          message: `Reference ${reference} is used more than once.`,
          cellId: cell.id,
          itemId: nodeId,
        });
      }
    }
  }

  const groupsByNetwork = new Map(connectivity.groups.map((group) => [connectivity.networkIdByKey.get(group[0]!)!, group]));
  for (const pin of connectivity.pinTerminals) {
    const networkId = connectivity.networkIdByPin.get(pin.key);
    const group = networkId ? groupsByNetwork.get(networkId) ?? [] : [];
    const attached =
      group.some((key) => key.startsWith("wire:")) || group.some((key) => key.startsWith("label:"));
    if (!attached) {
      const reference = pin.node.reference || pin.node.id;
      diagnostics.push({
        code: "dangling-pin",
        severity: "warning",
        message: `${reference} pin ${pin.symbol.pins[pin.pinIndex]?.key ?? pin.pinIndex + 1} is not connected.`,
        cellId: cell.id,
        itemId: pin.node.id,
      });
    }
  }

  for (const node of cell.nodes) {
    if (!symbols.has(node.symbolId)) {
      diagnostics.push({
        code: "missing-symbol",
        severity: "error",
        message: `${node.reference || node.id} uses an unavailable device symbol.`,
        cellId: cell.id,
        itemId: node.id,
      });
    }
  }

  for (const wire of cell.wires) {
    if (wire.points.length < 2 || !isOrthogonalPath(wire.points)) {
      diagnostics.push({
        code: "invalid-wire",
        severity: "error",
        message: "A wire must contain at least two orthogonal points.",
        cellId: cell.id,
        itemId: wire.id,
      });
    }
  }

  for (const [networkId, names] of connectivity.netNamesByGroup) {
    if (names.length > 1) {
      const item = connectivity.groups
        .find((group) => connectivity.networkIdByKey.get(group[0]!) === networkId)
        ?.find((key) => key.startsWith("label:"));
      diagnostics.push({
        code: "conflicting-net-names",
        severity: "warning",
        message: `One electrical network has conflicting labels: ${names.join(", ")}.`,
        cellId: cell.id,
        ...(item ? { itemId: item.slice("label:".length) } : {}),
      });
    }
  }

  const coveredPins = new Map<string, number>();
  for (const pin of connectivity.pinTerminals) {
    coveredPins.set(pinGraphKey(pin.node.id, pin.pinIndex), pin.pinIndex);
  }
  if (cell.nodes.length > 0 && connectivity.pinTerminals.length === 0) {
    diagnostics.push({
      code: "no-electrical-terminals",
      severity: "warning",
      message: "No resolvable electrical terminals were found in this cell.",
      cellId: cell.id,
    });
  }
  for (const wire of cell.wires) {
    if (!connectivity.networkIdByKey.has(wireGraphKey(wire.id))) {
      diagnostics.push({
        code: "disconnected-wire",
        severity: "warning",
        message: "A wire is not represented in the connectivity graph.",
        cellId: cell.id,
        itemId: wire.id,
      });
    }
  }

  return diagnostics;
}
