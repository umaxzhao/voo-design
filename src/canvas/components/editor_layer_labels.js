export function editorLayerLabels(t) {
  const labels = {
    text: t("editor.layer.text"),
    brush: t("editor.layer.brush"),
    pen: t("editor.layer.vector"),
    rect: t("editor.layer.rect"),
    ellipse: t("editor.layer.ellipse"),
    image: t("editor.layer.image"),
    audio: t("editor.layer.audio"),
    region: t("editor.layer.region"),
    layer: t("editor.layer.generic"),
    group: t("editor.layer.group"),
    frame: t("editor.layer.frame") || "Frame",
    adjustment: t("editor.layer.adjustment"),
    arrow: t("editor.tool.arrow"),
    line: t("editor.tool.line"),
    polygon: t("editor.shape.polygon"),
    star: t("editor.shape.star"),
    canvasInstance: t("editor.instance.label"),
    mesh3d: t("editor.three.object"),
    "combine.union": t("editor.props.combine.union"),
    "combine.subtract": t("editor.props.combine.subtract"),
    "combine.intersect": t("editor.props.combine.intersect"),
    "combine.exclude": t("editor.props.combine.exclude")
  };
  return labels;
}
