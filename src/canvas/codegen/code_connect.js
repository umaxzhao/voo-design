/**
 * Code Connect model for mapping design components to production code.
 *
 * A component document or canvas instance can hold a `codeConnect` definition:
 * {
 *   componentName: string, // e.g. "Button"
 *   importPath: string,    // e.g. "@/components/ui/button"
 *   template: string,      // e.g. "<Button variant=\"{variant}\">{label}</Button>"
 *   props: Record<string, string>, // property name -> code prop mapping or literal
 * }
 */

export function normalizeCodeConnect(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const componentName = String(value.componentName ?? "").trim();
  const importPath = String(value.importPath ?? "").trim();
  const template = String(value.template ?? "").trim();
  if (!componentName && !template) return null;
  return {
    componentName: componentName || "Component",
    importPath,
    template,
    props: value.props && typeof value.props === "object" ? { ...value.props } : {},
  };
}

/**
 * Resolves the code connection snippet for a given component or instance node.
 */
export function resolveCodeSnippet(node, componentDoc = null) {
  const mapping =
    normalizeCodeConnect(node?.codeConnect) ||
    normalizeCodeConnect(componentDoc?.codeConnect);
  if (!mapping) return null;

  const { componentName, importPath, template, props } = mapping;
  const instanceProps = node?.componentProperties ?? {};

  let snippet = template;
  if (!snippet) {
    const propPairs = Object.entries(instanceProps)
      .map(([k, v]) => {
        if (typeof v === "boolean") return v ? k : `${k}={false}`;
        if (typeof v === "number") return `${k}={${v}}`;
        return `${k}="${v}"`;
      })
      .join(" ");
    snippet = `<${componentName}${propPairs ? ` ${propPairs}` : ""}>${node?.text ?? ""}</${componentName}>`;
  } else {
    for (const [key, val] of Object.entries(instanceProps)) {
      snippet = snippet.replaceAll(`{${key}}`, String(val));
    }
  }

  const importStatement = importPath ? `import { ${componentName} } from "${importPath}";\n\n` : "";
  return {
    componentName,
    importPath,
    importStatement,
    code: `${importStatement}${snippet}`,
  };
}
