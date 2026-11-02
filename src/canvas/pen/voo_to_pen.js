/** Pen export entry point; paint, document structure and loss reporting stay independent. */
export { PEN_WRITE_VERSION } from "./pen-write-contract.js";
export { localPathGeometry, buildPenDocument, serializePenDocument } from "./pen-write-document.js";
export { penSaveLosses } from "./pen-write-losses.js";
