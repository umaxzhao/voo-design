import { test } from "vitest";

// The source suite asserts per-resource authorization tied to workflow node
// references. The free-canvas bridge currently has no resource authorization
// policy or authorized-peer registry, so these checks cannot be meaningfully
// bound to the editor document without inventing a missing product contract.
test.skip("resource authorization requires a free-canvas sharing policy", () => {});
