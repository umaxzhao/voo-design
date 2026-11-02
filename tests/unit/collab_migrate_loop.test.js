import { test } from "vitest";

// The source test exercises workflow graph-node migration and orphan-edge
// pruning. The free canvas document is pages/layers/settings and has no
// workflow node/edge migration contract to port into this bridge test.
test.skip("workflow graph migration convergence is not applicable to editor documents", () => {});
