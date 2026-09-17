import type { BrowserContext } from "playwright";
import type { StyleToken } from "../types.js";
import { getDeclaredRootStyles } from "./declaredStyles.js";

/** Extracts a real color (rgb/rgba/hex, non-transparent) from a `background` shorthand, or null when
 *  it carries no color — e.g. a `background: 0 0` position reset, `none`, or a gradient/named token. */
function colorFromBackground(value: string): string | null {
  const match = /rgba?\([^)]*\)|#[0-9a-fA-F]{3,8}\b/.exec(value);
  if (!match) return null;
  const rgba = /rgba?\(([^)]+)\)/.exec(match[0]);
  if (rgba) {
    const parts = rgba[1].split(",").map((p) => p.trim());
    if (parts.length === 4 && parseFloat(parts[3]) === 0) return null;
  }
  return match[0];
}

export interface CaptureResult {
  tokens: StyleToken[];
  screenshotPath: string;
}

/** Navigates to the page, screenshots the element, and reads its own computed styles in one pass. */
export async function captureElement(
  context: BrowserContext,
  url: string,
  selector: string,
  screenshotDest: string
): Promise<CaptureResult> {
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: "networkidle" });
    const locator = page.locator(selector).first();
    await locator.waitFor({ state: "visible", timeout: 15000 });
    // The node can detach mid-screenshot during hydration/animation — retry once after re-resolving.
    try {
      await locator.scrollIntoViewIfNeeded().catch(() => undefined);
      await locator.screenshot({ path: screenshotDest });
    } catch {
      const retry = page.locator(selector).first();
      await retry.waitFor({ state: "visible", timeout: 15000 });
      await retry.scrollIntoViewIfNeeded().catch(() => undefined);
      await retry.screenshot({ path: screenshotDest });
    }

    const merged = await locator.evaluate((root) => {
      const PROPERTIES = [
        "color",
        "backgroundColor",
        "fontFamily",
        "fontSize",
        "fontWeight",
        "lineHeight",
        "letterSpacing",
        "borderRadius",
        "borderColor",
        "borderWidth",
        "borderStyle",
        "boxShadow",
        "paddingTop",
        "paddingRight",
        "paddingBottom",
        "paddingLeft",
        "gap",
      ] as const;

      // Root-only: read the styles on the exact matched element, no descendant scan — a value only
      // ever reflects the class the selector actually targets.
      const s = getComputedStyle(root);
      const merged: Record<string, string> = {};
      for (const prop of PROPERTIES) merged[prop] = s[prop];

      // Border: pick the first side actually set — handles one-sided dividers (e.g. `border-bottom:
      // 1px solid …`), which getComputedStyle would otherwise report as an unusable multi-side string.
      const sides = [s.borderTop, s.borderRight, s.borderBottom, s.borderLeft];
      let borderValue = "none";
      for (const side of sides) {
        const bits = side.split(" ");
        if (parseFloat(bits[0]) > 0 && bits[1] && bits[1] !== "none") {
          borderValue = side;
          break;
        }
      }
      const hasBorder = borderValue !== "none";
      delete merged.borderColor;
      delete merged.borderWidth;
      delete merged.borderStyle;

      // Box-model properties sitting at the plain browser default weren't "declared" for this class —
      // drop them so they don't read as a real value the Figma layer must match.
      const BOX_PROPERTY_DEFAULTS: Record<string, string> = {
        backgroundColor: "rgba(0, 0, 0, 0)",
        borderRadius: "0px",
        boxShadow: "none",
        paddingTop: "0px",
        paddingRight: "0px",
        paddingBottom: "0px",
        paddingLeft: "0px",
        gap: "normal",
      };
      for (const prop of Object.keys(BOX_PROPERTY_DEFAULTS)) {
        if (merged[prop] === BOX_PROPERTY_DEFAULTS[prop]) delete merged[prop];
      }
      if (hasBorder) merged.border = borderValue;

      // Typography lives on the text itself, not the wrapping container — a panel/section often has
      // no font of its own and resolves to the browser default, so find the first descendant that
      // directly renders text and read its font/color from there.
      const TYPO = ["color", "fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing"] as const;
      let textEl: Element | null = null;
      const tq: Element[] = [root];
      while (tq.length > 0) {
        const cur = tq.shift() as Element;
        const rendersText = Array.from(cur.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? "").trim().length > 0);
        if (rendersText) {
          textEl = cur;
          break;
        }
        for (const c of Array.from(cur.children)) tq.push(c);
      }
      if (textEl) {
        const ts = getComputedStyle(textEl);
        for (const prop of TYPO) merged[prop] = ts[prop];
      } else {
        for (const prop of TYPO) delete merged[prop];
      }

      const rect = root.getBoundingClientRect();
      merged.width = `${Math.round(rect.width)}px`;
      merged.height = `${Math.round(rect.height)}px`;

      return merged;
    });

    // getComputedStyle always resolves *some* value for background/border, even when the matched
    // class never actually declared it (inherited/browser defaults look identical to a real
    // declaration) — prefer the element's own literal CSS declaration when one exists, so a class
    // like `.close { background: 0 0; border: none; }` reports exactly that, not a computed guess.
    const declared = await getDeclaredRootStyles(page, selector);

    // Prefer the class's own declared background color; a `background` shorthand carrying no color
    // (e.g. `background: 0 0`, a position reset) means no background color — not a value of "0 0".
    const declaredBg = declared["background-color"] ?? declared.background;
    if (declaredBg) {
      const bgColor = colorFromBackground(declaredBg);
      if (bgColor) merged.backgroundColor = bgColor;
      else if (/^(0 0|none|transparent|initial|unset|inherit)$/i.test(declaredBg.trim())) delete merged.backgroundColor;
    }
    if (declared.border) {
      merged.border = declared.border;
    }

    const tokens: StyleToken[] = Object.entries(merged)
      .filter(([, value]) => Boolean(value))
      .map(([property, value]) => ({
        property: property as StyleToken["property"],
        value,
      }));

    return { tokens, screenshotPath: screenshotDest };
  } finally {
    await page.close();
  }
}
