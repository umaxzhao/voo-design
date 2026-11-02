/**
 * Standardized Command Receipt and Transaction Pipeline for the Design Editor.
 *
 * Implements the DES6 receipt contract:
 *   { success: boolean, changedNodeIds: string[], selectionBounds: Object|null, undoSnapshotId: string|number|null }
 * And transaction execution with 100% clean document snapshot rollback.
 *
 * Pure module: zero React / DOM dependencies.
 */

/**
 * Creates a standardized Command Receipt for an executed command step.
 *
 * @param {Object} engine
 * @param {{tool: string, args?: Object}} command
 * @param {Object|any} rawResult
 * @param {{beforeDoc?: Object, afterDoc?: Object}} [context]
 * @returns {{
 *   success: boolean,
 *   changedNodeIds: string[],
 *   selectionBounds: {x: number, y: number, width: number, height: number} | null,
 *   undoSnapshotId: string | number | null
 * }}
 */
export function createCommandReceipt(engine, command, rawResult, context = {}) {
  const success = Boolean(
    rawResult?.ok ??
      rawResult?.success ??
      (rawResult !== false && rawResult !== undefined),
  );

  // 1. changedNodeIds
  const changedIds = new Set();
  if (Array.isArray(rawResult?.changedNodeIds)) {
    for (const id of rawResult.changedNodeIds) {
      if (id) changedIds.add(String(id));
    }
  } else if (rawResult?.nodeId) {
    changedIds.add(String(rawResult.nodeId));
  } else if (Array.isArray(rawResult?.affectedIds)) {
    for (const id of rawResult.affectedIds) {
      if (id) changedIds.add(String(id));
    }
  }

  // Detect node-level mutations from beforeDoc/afterDoc diff
  if (context.beforeDoc && context.afterDoc) {
    const beforeNodes = context.beforeDoc.nodes ?? [];
    const afterNodes = context.afterDoc.nodes ?? [];
    const beforeMap = new Map(
      beforeNodes.map((n) => [String(n.id), JSON.stringify(n)]),
    );
    const afterMap = new Map(
      afterNodes.map((n) => [String(n.id), JSON.stringify(n)]),
    );

    for (const [id, str] of afterMap) {
      if (!beforeMap.has(id) || beforeMap.get(id) !== str) {
        changedIds.add(id);
      }
    }
    for (const id of beforeMap.keys()) {
      if (!afterMap.has(id)) {
        changedIds.add(id);
      }
    }
  }
  const changedNodeIds = Array.from(changedIds);

  // 2. selectionBounds
  let selectionBounds = null;
  const rawBounds = rawResult?.selectionBounds ?? rawResult?.bounds;
  if (rawBounds && typeof rawBounds === "object") {
    selectionBounds = {
      x: Number(rawBounds.x ?? 0),
      y: Number(rawBounds.y ?? 0),
      width: Number(rawBounds.width ?? 0),
      height: Number(rawBounds.height ?? 0),
    };
  } else {
    const pixelSel = engine?.getPixelSelection?.();
    if (pixelSel?.bounds && typeof pixelSel.bounds === "object") {
      selectionBounds = {
        x: Number(pixelSel.bounds.x ?? 0),
        y: Number(pixelSel.bounds.y ?? 0),
        width: Number(pixelSel.bounds.width ?? 0),
        height: Number(pixelSel.bounds.height ?? 0),
      };
    }
  }

  // 3. undoSnapshotId
  let undoSnapshotId = null;
  if (rawResult?.undoSnapshotId !== undefined) {
    undoSnapshotId = rawResult.undoSnapshotId;
  } else if (typeof engine?.getCurrentHistoryIndex === "function") {
    const idx = engine.getCurrentHistoryIndex();
    const entries = engine?.getHistoryEntries?.();
    if (Array.isArray(entries) && typeof idx === "number" && entries[idx]?.id) {
      undoSnapshotId = entries[idx].id;
    } else if (typeof idx === "number" && idx >= 0) {
      undoSnapshotId = String(idx);
    }
  } else if (engine?.getLastHistoryEntry?.()?.id) {
    undoSnapshotId = engine.getLastHistoryEntry().id;
  }

  return {
    ...(typeof rawResult === "object" && rawResult !== null ? rawResult : {}),
    success,
    changedNodeIds,
    selectionBounds,
    undoSnapshotId,
  };
}

/**
 * Captures an exact pre-transaction baseline for rollback.
 *
 * @param {Object} engine
 * @returns {Object}
 */
export function captureTransactionBaseline(engine) {
  const rawDoc = engine?.getDocument ? engine.getDocument() : null;
  const docSnapshot = rawDoc
    ? JSON.stringify(rawDoc)
    : engine?.snapshotDoc
      ? engine.snapshotDoc()
      : null;
  const doc = docSnapshot ? JSON.parse(docSnapshot) : null;
  const historyIndex =
    typeof engine?.getCurrentHistoryIndex === "function"
      ? engine.getCurrentHistoryIndex()
      : null;
  const pixelSelection = engine?.getPixelSelection
    ? engine.getPixelSelection()
    : null;
  const pixelSelectionSnapshot = pixelSelection
    ? JSON.stringify(pixelSelection)
    : null;
  const activeTool = engine?.getTool ? engine.getTool() : null;
  const selectedIds = engine?.getSelectedIds
    ? engine.getSelectedIds()
    : engine?.getSelectedId
      ? [engine.getSelectedId()].filter(Boolean)
      : [];

  return {
    doc,
    docSnapshot,
    historyIndex,
    pixelSelection,
    pixelSelectionSnapshot,
    activeTool,
    selectedIds: [...selectedIds],
  };
}

/**
 * Rolls back all mutations to match the pre-transaction baseline 100%.
 *
 * @param {Object} engine
 * @param {Object} baseline
 * @returns {Promise<{restored: boolean, currentSnapshot: string, baselineSnapshot: string}>}
 */
export async function rollbackTransaction(engine, baseline) {
  // 1. Roll back via engine history if available
  if (
    typeof engine?.jumpToHistory === "function" &&
    typeof baseline.historyIndex === "number" &&
    baseline.historyIndex >= 0
  ) {
    await engine.jumpToHistory(baseline.historyIndex);
  } else if (
    typeof engine?.undo === "function" &&
    typeof baseline.historyIndex === "number"
  ) {
    while (
      typeof engine?.getCurrentHistoryIndex === "function" &&
      engine.getCurrentHistoryIndex() > baseline.historyIndex
    ) {
      await engine.undo();
    }
  }

  // 2. Restore document state directly if document differs or if history didn't restore it 100%
  if (baseline.docSnapshot) {
    const currentDoc = engine?.getDocument ? engine.getDocument() : null;
    const currentSnapshot = currentDoc ? JSON.stringify(currentDoc) : null;
    if (currentSnapshot !== baseline.docSnapshot) {
      if (typeof engine?.restoreSnapshot === "function") {
        await engine.restoreSnapshot(baseline.docSnapshot);
      } else if (typeof engine?.setDoc === "function") {
        engine.setDoc(JSON.parse(baseline.docSnapshot), { commit: false });
      } else if (typeof engine?.setDocument === "function") {
        engine.setDocument(JSON.parse(baseline.docSnapshot));
      } else if (engine && "doc" in engine) {
        engine.doc = JSON.parse(baseline.docSnapshot);
      }
    }
  }

  // 3. Restore document dimensions if changed and still differs from baseline
  if (baseline.doc && typeof engine?.setDocumentSize === "function") {
    const currentDoc = engine?.getDocument ? engine.getDocument() : null;
    if (
      currentDoc &&
      (currentDoc.width !== baseline.doc.width ||
        currentDoc.height !== baseline.doc.height)
    ) {
      engine.setDocumentSize(baseline.doc.width, baseline.doc.height);
    }
  }

  // 4. Restore pixel selection
  if (baseline.pixelSelectionSnapshot) {
    if (typeof engine?.setPixelSelection === "function") {
      engine.setPixelSelection(JSON.parse(baseline.pixelSelectionSnapshot));
    }
  } else {
    if (typeof engine?.clearPixelSelection === "function") {
      engine.clearPixelSelection();
    } else if (typeof engine?.setPixelSelection === "function") {
      engine.setPixelSelection(null);
    }
  }

  // 5. Restore active tool
  if (baseline.activeTool && typeof engine?.setTool === "function") {
    engine.setTool(baseline.activeTool);
  }

  // 6. Restore selected layers/nodes
  if (typeof engine?.selectNodes === "function") {
    engine.selectNodes(baseline.selectedIds);
  } else if (typeof engine?.setSelectedId === "function") {
    engine.setSelectedId(baseline.selectedIds[0] ?? null);
  }

  const finalDoc = engine?.getDocument ? engine.getDocument() : null;
  const finalSnapshot = finalDoc ? JSON.stringify(finalDoc) : null;
  const restored = finalSnapshot === baseline.docSnapshot;

  return {
    restored,
    currentSnapshot: finalSnapshot,
    baselineSnapshot: baseline.docSnapshot,
  };
}

/**
 * Executes a sequence of commands as a transaction pipeline.
 *
 * @param {Object} engine
 * @param {Array<{tool: string, args?: Object}>} commands
 * @param {{
 *   nodeId?: string,
 *   executeCommand: (cmd: Object) => Promise<any>,
 *   throwOnError?: boolean
 * }} options
 * @returns {Promise<Array<Object> & {success: boolean, receipts: Array<Object>, snapshotId: string|null}>}
 */
export async function executeTransactionPipeline(
  engine,
  commands,
  options = {},
) {
  const { executeCommand, throwOnError = true } = options;
  if (!Array.isArray(commands)) {
    throw new TypeError("executeTransaction requires an array of commands");
  }

  const baseline = captureTransactionBaseline(engine);
  const receipts = [];

  for (let i = 0; i < commands.length; i++) {
    const cmd = commands[i];
    const beforeDoc = engine?.getDocument
      ? JSON.parse(JSON.stringify(engine.getDocument()))
      : null;
    let rawResult;
    try {
      rawResult = await executeCommand(cmd);
      if (rawResult?.ok === false || rawResult?.success === false) {
        throw Object.assign(
          new Error(rawResult?.message ?? `Command ${cmd.tool} returned failure`),
          { rawResult, code: rawResult?.code ?? "COMMAND_FAILED" },
        );
      }
    } catch (err) {
      const rollbackStatus = await rollbackTransaction(engine, baseline);
      err.rolledBack = true;
      err.snapshotRestored = rollbackStatus.restored;
      err.failedStep = i;
      err.failedCommand = cmd;
      err.receipts = receipts;

      if (throwOnError) {
        throw err;
      }
      return Object.assign([...receipts], {
        success: false,
        rolledBack: true,
        snapshotRestored: rollbackStatus.restored,
        failedStep: i,
        failedCommand: cmd,
        receipts,
        error: err,
      });
    }

    const afterDoc = engine?.getDocument
      ? JSON.parse(JSON.stringify(engine.getDocument()))
      : null;
    const receipt = createCommandReceipt(engine, cmd, rawResult, {
      beforeDoc,
      afterDoc,
    });
    receipts.push(receipt);
  }

  const lastSnapshotId =
    receipts.length > 0 ? receipts[receipts.length - 1].undoSnapshotId : null;

  return Object.assign(receipts, {
    success: true,
    receipts,
    snapshotId: lastSnapshotId,
  });
}
