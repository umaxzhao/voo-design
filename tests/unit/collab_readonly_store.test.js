import { test } from "vitest";

// The source test targets useWorkflowStore. voo_design has no workflow_store;
// this free canvas store does not expose that workflow write barrier contract.
test.skip("workflow_store is absent; do not port workflow_store into free canvas", () => {});
