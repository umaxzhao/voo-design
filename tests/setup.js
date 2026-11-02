// Global test environment setup for Vitest
import { webcrypto } from "node:crypto";
import { afterAll, afterEach, expect } from "vitest";
import { watchPropTypeWarnings } from "./helpers/prop-type-warnings.js";

if (!globalThis.crypto) {
  globalThis.crypto = webcrypto;
}

const propTypeWarnings = watchPropTypeWarnings();
afterEach(() => {
  expect(propTypeWarnings.takeWarnings(), "Unexpected React prop contract warnings").toEqual([]);
});
afterAll(() => propTypeWarnings.restore());
