/**
 * Maps agent editor commands onto the open editor engine.
 *
 * The agent tools (select_region / select_object / refine_selection /
 * fill_selection / repaint_selection / layer_via_copy, and the read/export
 * helpers) cannot reach the engine directly — the editor lives inside a React
 * surface. The editor registers this executor with the workflow store on
 * mount (use_editor_engine.js); tools call `store.runEditorCommand`.
 *
 * Stage 2 has moved every command descriptor and implementation into
 * command_table.js; this file is now a thin store-facing adapter. It contains
 * no hand-written command branches.
 */

import { executeEditorCommand } from "./command_table.js";
import {
  createCommandReceipt,
  captureTransactionBaseline,
  rollbackTransaction,
  executeTransactionPipeline,
} from "./command_table/receipt.js";

// Re-exported so existing importers and tests keep importing from the bridge.
export {
  editorCommandError,
  downscaleDataUrl,
} from "./command_table.js";
export {
  createCommandReceipt,
  captureTransactionBaseline,
  rollbackTransaction,
  executeTransactionPipeline,
};

export function createEditorCommandBridge(engine, options = {}) {
  const nodeId = options?.nodeId ?? engine?.sourceWorkflowNodeId ?? null;
  return {
    nodeId,
    engine,
    /**
     * @param {{tool: string, args?: Object}} command
     * @param {{receipt?: boolean}} [execOptions]
     */
    async execute(command, execOptions = {}) {
      const needReceipt = execOptions?.receipt === true;
      const beforeDoc = needReceipt && engine?.getDocument
        ? JSON.parse(JSON.stringify(engine.getDocument()))
        : null;
      const rawResult = await executeEditorCommand(command?.tool, engine, {
        ...(nodeId ? { targetNodeId: nodeId } : {}),
        ...(command?.args ?? {}),
      });
      if (needReceipt) {
        const afterDoc = engine?.getDocument
          ? JSON.parse(JSON.stringify(engine.getDocument()))
          : null;
        return createCommandReceipt(engine, command, rawResult, {
          beforeDoc,
          afterDoc,
        });
      }
      return rawResult;
    },

    /**
     * Executes a single command and returns a standardized Receipt:
     * { success, changedNodeIds, selectionBounds, undoSnapshotId, ... }
     * @param {{tool: string, args?: Object}} command
     */
    async executeStep(command) {
      return this.execute(command, { receipt: true });
    },

    /**
     * Executes an array of commands sequentially inside a transaction pipeline.
     * Each step returns a standardized Receipt. If any step fails or throws,
     * the transaction cleanly rolls back to the pre-transaction baseline state
     * (verifying 100% document snapshot match).
     *
     * @param {Array<{tool: string, args?: Object}>} commands
     * @param {{throwOnError?: boolean}} [txOptions]
     */
    async executeTransaction(commands, txOptions = {}) {
      return executeTransactionPipeline(engine, commands, {
        nodeId,
        executeCommand: (cmd) => this.execute(cmd),
        ...txOptions,
      });
    },
  };
}
