import { createContext } from "react";

/**
 * The document's colour variables (`doc.colorVariables`: `{ id, name, value }`)
 * for the picker's "Document colours" row. The properties panel provides them;
 * a picker opened anywhere else sees an empty list. Context crosses the
 * swatch's portal, so no prop has to travel through every Swatch caller.
 */
export const DocumentColoursContext = createContext([]);
