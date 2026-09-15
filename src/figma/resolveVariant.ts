import type { FigmaNode } from "./client.js";

/** Parses a variant child's name (e.g. "State=Default, Size=Medium") into property/value pairs. */
function parseVariantProps(name: string): Record<string, string> {
  const props: Record<string, string> = {};
  for (const pair of name.split(",")) {
    const [key, value] = pair.split("=").map((s) => s.trim());
    if (key && value) props[key] = value;
  }
  return props;
}

/**
 * Resolves a component-set node down to a single variant to test. If `variantNameOverride` is
 * given, it's matched as a case-insensitive substring against each child's name. Otherwise the
 * variant matching the component set's declared default property values is used, falling back
 * to the first child if no default combination can be determined.
 */
export function resolveComponentVariant(node: FigmaNode, variantNameOverride?: string): FigmaNode {
  if (node.type !== "COMPONENT_SET" || !node.children?.length) return node;

  if (variantNameOverride) {
    const match = node.children.find((child) => child.name.toLowerCase().includes(variantNameOverride.toLowerCase()));
    if (match) return match;
  }

  const defaults = Object.entries(node.componentPropertyDefinitions ?? {})
    .filter(([, def]) => def.type === "VARIANT" && def.defaultValue != null)
    .map(([prop, def]) => [prop, String(def.defaultValue)] as const);

  if (defaults.length > 0) {
    const match = node.children.find((child) => {
      const props = parseVariantProps(child.name);
      return defaults.every(([prop, value]) => props[prop] === value);
    });
    if (match) return match;
  }

  return node.children[0];
}

/** Breadth-first search for a descendant (or the node itself) with an exact, case-insensitive name match. */
export function findNodeByName(root: FigmaNode, name: string): FigmaNode | null {
  const target = name.trim().toLowerCase();
  const queue: FigmaNode[] = [root];
  while (queue.length > 0) {
    const current = queue.shift() as FigmaNode;
    if (current.name.trim().toLowerCase() === target) return current;
    for (const child of current.children ?? []) queue.push(child);
  }
  return null;
}
