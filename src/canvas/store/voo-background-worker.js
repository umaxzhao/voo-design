import { encodeVooBinary } from "./voo_binary.js";
import { projectCover } from "../previews/project_cover.js";

/** Pure SVG construction and canonical packaging share the existing implementations. */
self.onmessage = ({ data }) => {
  const { id, operation, file } = data;
  try {
    if (operation === "cover") {
      const result = projectCover(file, { preferEmbedded: false });
      self.postMessage({ id, type: "result", result });
    } else if (operation === "encode") {
      const result = encodeVooBinary(file);
      self.postMessage({ id, type: "result", result }, [result.buffer]);
    } else throw new Error("voo-background-invalid-operation");
  } catch (error) {
    self.postMessage({ id, type: "error", message: error?.message || String(error) });
  }
};
