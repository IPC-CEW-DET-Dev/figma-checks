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

export function extractStyleTokens(node: FigmaNode): StyleToken[] {
  const tokens: StyleToken[] = [];

  const fillColor = node.fills?.map(paintToRgba).find((c) => c != null);
  if (fillColor) tokens.push({ property: "backgroundColor", value: fillColor });

  if (node.cornerRadius != null) {
    tokens.push({ property: "borderRadius", value: `${node.cornerRadius}px` });
  }

  const shadow = node.effects?.map(effectToBoxShadow).find((s) => s != null);
  if (shadow) tokens.push({ property: "boxShadow", value: shadow });

  if (node.layoutMode && node.layoutMode !== "NONE") {
    tokens.push({ property: "paddingTop", value: `${node.paddingTop ?? 0}px` });
    tokens.push({ property: "paddingRight", value: `${node.paddingRight ?? 0}px` });
    tokens.push({ property: "paddingBottom", value: `${node.paddingBottom ?? 0}px` });
    tokens.push({ property: "paddingLeft", value: `${node.paddingLeft ?? 0}px` });
    tokens.push({ property: "gap", value: `${node.itemSpacing ?? 0}px` });
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
