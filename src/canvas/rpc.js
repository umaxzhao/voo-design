/**
 * Standalone RPC bridge implementation for voo_design.
 */

export const CONTEXT_GONE = "CONTEXT_GONE";

export class RpcError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "RpcError";
    this.code = code;
  }
}

let currentEnvironment = { mode: "standalone", hosted: false };

export function setEnvironment(env) {
  currentEnvironment = { ...currentEnvironment, ...env };
}

export function getEnvironment() {
  return currentEnvironment;
}

export function hasChromeApis() {
  return false;
}

export function isInSidePanel() {
  return false;
}

export function isStandaloneTab() {
  return true;
}

export function isHostAvailable() {
  return false;
}

export function onHostEvent(event, handler) {
  return () => {};
}

export async function callBackground(op, payload) {
  return null;
}

export async function callBackgroundJob(op, payload, callbacks = {}) {
  return null;
}

export function callBackgroundStream(op, payload, onChunk) {
  return () => {};
}

export async function callHost(op, payload) {
  return null;
}

export function signalHost(op, payload) {
  // No-op in standalone mode
}
