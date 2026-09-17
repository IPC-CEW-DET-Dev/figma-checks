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

/** Breadth-first search for the first TEXT node in the subtree — typography usually lives on a
 *  nested text layer, not the named container itself, so this is the one thing read below the root. */
function findFirstTextNode(root: FigmaNode): FigmaNode | null {
  const queue: FigmaNode[] = [root];
  while (queue.length > 0) {
    const current = queue.shift() as FigmaNode;
    if (current.type === "TEXT") return current;
    for (const child of current.children ?? []) queue.push(child);
  }
  return null;
}

/** True for icon-style instances (all children are plain vector shapes) — their `fills` tint the
 *  icon glyph, not a container background/radius/shadow, so they'd otherwise be mistaken for one. */
function isIconNode(node: FigmaNode): boolean {
  const children = node.children ?? [];
  return children.length > 0 && children.every((c) => c.type === "VECTOR");
}

/** Whether the node itself carries any real box-model styling (used to detect pass-through wrappers). */
function hasOwnBoxStyle(node: FigmaNode): boolean {
  const hasFill = node.type !== "TEXT" && Boolean(node.fills?.some((f) => paintToRgba(f) != null));
  const hasRadius = (node.cornerRadius ?? 0) > 0;
  const hasShadow = Boolean(node.effects?.some((e) => effectToBoxShadow(e) != null));
  const hasStroke = (node.strokeWeight ?? 0) > 0 && Boolean(node.strokes?.some((s) => paintToRgba(s) != null));
  const hasPadding =
    node.layoutMode != null &&
    node.layoutMode !== "NONE" &&
    ((node.paddingTop ?? 0) > 0 ||
      (node.paddingRight ?? 0) > 0 ||
      (node.paddingBottom ?? 0) > 0 ||
      (node.paddingLeft ?? 0) > 0 ||
      (node.itemSpacing ?? 0) > 0);
  return hasFill || hasRadius || hasShadow || hasStroke || hasPadding;
}

function boxesRoughlyEqual(a: FigmaNode["absoluteBoundingBox"], b: FigmaNode["absoluteBoundingBox"]): boolean {
  if (!a || !b) return false;
  return Math.abs(a.width - b.width) < 1 && Math.abs(a.height - b.height) < 1;
}

/**
 * Unwraps a pure pass-through wrapper — a node with no box styling of its own whose single child
 * fills its box (common for component instances, where the styled frame sits one level below the
 * instance root). Stops at icon/text children so a fixed-size icon container isn't collapsed into
 * its glyph. This is bounded (single child, same size only), not an open-ended subtree search.
 */
function resolveEffectiveNode(node: FigmaNode): FigmaNode {
  let current = node;
  while (!hasOwnBoxStyle(current) && (current.children?.length ?? 0) === 1) {
    const child = (current.children as FigmaNode[])[0];
    if (child.type === "VECTOR" || child.type === "TEXT" || isIconNode(child)) break;
    if (!boxesRoughlyEqual(current.absoluteBoundingBox, child.absoluteBoundingBox)) break;
    current = child;
  }
  return current;
}

/**
 * Root-only extraction: reads the design tokens declared on the named layer itself (after unwrapping
 * pure pass-through wrappers) — no subtree scan for "the real" value, so a token only ever reflects
 * the layer you specified. Typography is the one exception, read from the layer's own nested text.
 * Width/height are emitted only for axes Figma explicitly fixes (e.g. an icon/close-X container).
 */
export function extractStyleTokens(node: FigmaNode): StyleToken[] {
  const tokens: StyleToken[] = [];
  const box = resolveEffectiveNode(node);

  if (box.type !== "TEXT" && box.type !== "VECTOR" && !isIconNode(box)) {
    const fillColor = box.fills?.map(paintToRgba).find((c) => c != null);
    if (fillColor) tokens.push({ property: "backgroundColor", value: fillColor });
  }

  if ((box.cornerRadius ?? 0) > 0) {
    tokens.push({ property: "borderRadius", value: `${box.cornerRadius}px` });
  }

  const shadow = box.effects?.map(effectToBoxShadow).find((s) => s != null);
  if (shadow) tokens.push({ property: "boxShadow", value: shadow });

  if ((box.strokeWeight ?? 0) > 0) {
    const strokeColor = box.strokes?.map(paintToRgba).find((c) => c != null);
    if (strokeColor) tokens.push({ property: "border", value: `${box.strokeWeight}px solid ${strokeColor}` });
  }

  if (box.layoutMode && box.layoutMode !== "NONE") {
    tokens.push({ property: "paddingTop", value: `${box.paddingTop ?? 0}px` });
    tokens.push({ property: "paddingRight", value: `${box.paddingRight ?? 0}px` });
    tokens.push({ property: "paddingBottom", value: `${box.paddingBottom ?? 0}px` });
    tokens.push({ property: "paddingLeft", value: `${box.paddingLeft ?? 0}px` });
    // Figma omits `itemSpacing` entirely for "Auto" (space-between) gaps — sentinel so styleDiff skips it.
    tokens.push({ property: "gap", value: box.itemSpacing != null ? `${box.itemSpacing}px` : "auto" });
  }

  // Only cross-check size on axes the designer explicitly fixed — "fill"/"hug" axes are layout/
  // content-driven, so their measured size isn't a designed value worth comparing.
  const sizingBox = node.absoluteBoundingBox;
  if (sizingBox) {
    if (node.layoutSizingHorizontal === "FIXED") tokens.push({ property: "width", value: `${Math.round(sizingBox.width)}px` });
    if (node.layoutSizingVertical === "FIXED") tokens.push({ property: "height", value: `${Math.round(sizingBox.height)}px` });
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
