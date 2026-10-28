import { lazy, Suspense } from "react";
import { editorPropertiesPropTypes } from "./editor_properties/properties_panel_types.js";

const EditorProperties = lazy(() => import("./editor_properties/index.jsx"));

/** Load inspector tools without suspending the canvas and its pointer handlers. */
export default function DeferredEditorProperties(props) {
  return (
    <Suspense fallback={null}>
      <EditorProperties {...props} />
    </Suspense>
  );
}

DeferredEditorProperties.propTypes = editorPropertiesPropTypes;
