import type { FigmaNode, FigmaPaint, FigmaEffect } from "./client.js";
import type { StyleToken } from "../types.js";

function paintToRgba(paint: FigmaPaint): string | null {
  if (paint.type !== "SOLID" || !paint.color) return null;
  const { r, g, b, a } = paint.color;
  const alpha = a * (paint.opacity ?? 1);
  return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${round(alpha, 2)})`;
}

function effectToBoxShadow(effect: FigmaEffect): string | null {
  if (effect.type !== "DROP_SHADOW" || !effect.color) return null;
  const { r, g, b, a } = effect.color;
  const x = effect.offset?.x ?? 0;
  const y = effect.offset?.y ?? 0;
  const radius = effect.radius ?? 0;
  return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${round(a, 2)}) ${x}px ${y}px ${radius}px 0px`;
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/** Depth-first search for the first TEXT node, used as the representative text style for a component. */
function findFirstTextNode(node: FigmaNode): FigmaNode | null {
  if (node.type === "TEXT") return node;
  for (const child of node.children ?? []) {
    const found = findFirstTextNode(child);
    if (found) return found;
  }
  return null;
}

/**
 * Breadth-first list of the node and all descendants. The node you point `nodeId` at is often a
 * thin wrapper (especially for component instances) — the real fills/radius/padding are frequently
 * one or two levels deeper on an inner frame, so callers scan this list for the first match instead
 * of only trusting the exact node.
 */
function collectNodesBreadthFirst(root: FigmaNode): FigmaNode[] {
  const nodes: FigmaNode[] = [root];
  const queue: FigmaNode[] = [root];
  while (queue.length > 0) {
    const current = queue.shift() as FigmaNode;
    for (const child of current.children ?? []) {
      nodes.push(child);
      queue.push(child);
    }
  }
  return nodes;
}

export function extractStyleTokens(node: FigmaNode): StyleToken[] {
  const tokens: StyleToken[] = [];
  const nodes = collectNodesBreadthFirst(node);

  const fillNode = nodes.find((n) => n.fills?.some((f) => paintToRgba(f) != null));
  const fillColor = fillNode?.fills?.map(paintToRgba).find((c) => c != null);
  if (fillColor) tokens.push({ property: "backgroundColor", value: fillColor });

  const radiusNode = nodes.find((n) => n.cornerRadius != null);
  if (radiusNode) {
    tokens.push({ property: "borderRadius", value: `${radiusNode.cornerRadius}px` });
  }

  const shadowNode = nodes.find((n) => n.effects?.some((e) => effectToBoxShadow(e) != null));
  const shadow = shadowNode?.effects?.map(effectToBoxShadow).find((s) => s != null);
  if (shadow) tokens.push({ property: "boxShadow", value: shadow });

  const layoutNode = nodes.find((n) => n.layoutMode && n.layoutMode !== "NONE");
  if (layoutNode) {
    tokens.push({ property: "paddingTop", value: `${layoutNode.paddingTop ?? 0}px` });
    tokens.push({ property: "paddingRight", value: `${layoutNode.paddingRight ?? 0}px` });
    tokens.push({ property: "paddingBottom", value: `${layoutNode.paddingBottom ?? 0}px` });
    tokens.push({ property: "paddingLeft", value: `${layoutNode.paddingLeft ?? 0}px` });
    tokens.push({ property: "gap", value: `${layoutNode.itemSpacing ?? 0}px` });
  }

  const textNode = findFirstTextNode(node);
  if (textNode?.style) {
    const { fontFamily, fontWeight, fontSize, lineHeightPx, letterSpacing } = textNode.style;
    if (fontFamily) tokens.push({ property: "fontFamily", value: fontFamily });
    if (fontWeight != null) tokens.push({ property: "fontWeight", value: String(fontWeight) });
    if (fontSize != null) tokens.push({ property: "fontSize", value: `${fontSize}px` });
    if (lineHeightPx != null) tokens.push({ property: "lineHeight", value: `${round(lineHeightPx, 2)}px` });
    if (letterSpacing != null) tokens.push({ property: "letterSpacing", value: `${round(letterSpacing, 2)}px` });
  }
  const textColor = textNode?.fills?.map(paintToRgba).find((c) => c != null);
  if (textColor) tokens.push({ property: "color", value: textColor });

  return tokens;
}
