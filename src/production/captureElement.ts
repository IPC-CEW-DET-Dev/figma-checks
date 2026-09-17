import type { BrowserContext } from "playwright";
import type { StyleToken } from "../types.js";
import { getDeclaredRootStyles } from "./declaredStyles.js";

export interface CaptureResult {
  tokens: StyleToken[];
  screenshotPath: string;
}

/** Navigates to the page, screenshots the element, and reads its computed styles in one pass. */
export async function captureElement(
  context: BrowserContext,
  url: string,
  selector: string,
  screenshotDest: string,
  excludeSelector?: string
): Promise<CaptureResult> {
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: "networkidle" });
    const locator = page.locator(selector).first();
    await locator.waitFor({ state: "visible", timeout: 15000 });
    await locator.screenshot({ path: screenshotDest });

    const values = await locator.evaluate(
      (root, excludeSelector) => {
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

        // The matched selector is often a bare layout wrapper — the real design tokens (background,
        // padding, font, etc.) usually live on a styled descendant, so scan the subtree for overrides.
        // Traversal is breadth-first (nearby overrides win over distant ones), and any subtree matching
        // `excludeSelector` is skipped entirely for ALL properties — useful when that subtree belongs
        // to a different logical section being tested separately (e.g. a shared text-block component).
        // Named helper functions are avoided here: esbuild's dev transform wraps them in a `__name()`
        // call that isn't defined once this callback is serialized into the browser page context.
        const elements: Element[] = [root];
        const queue: Element[] = [root];
        while (queue.length > 0) {
          const current = queue.shift() as Element;
          for (const child of Array.from(current.children)) {
            if (excludeSelector && child.matches(excludeSelector)) continue;
            elements.push(child);
            queue.push(child);
          }
        }

        const styles = elements.map((el) => {
          const s = getComputedStyle(el);
          const result: Record<string, string> = {};
          for (const prop of PROPERTIES) result[prop] = s[prop];
          return result;
        });
        const descriptors = elements.map((el) => {
          const tag = el.tagName.toLowerCase();
          const id = el.id ? `#${el.id}` : "";
          const classAttr = el.getAttribute("class");
          const classSelector = classAttr ? "." + classAttr.trim().split(/\s+/).join(".") : "";
          return `${tag}${id}${classSelector}`;
        });

        const rootStyle = styles[0];
        const merged: Record<string, string> = { ...rootStyle };
        const sources: Record<string, string> = {};

        // Only look at descendants for box-model properties when the matched element's OWN value is
        // still an unset default — if the element already carries a real value (e.g. a button with its
        // own 24px padding), trust it rather than letting some incidental inner wrapper (with 0px, say)
        // "override" a value that was already correct.
        const BOX_PROPERTY_DEFAULTS: Record<string, string> = {
          backgroundColor: "rgba(0, 0, 0, 0)",
          borderRadius: "0px",
          borderWidth: "0px",
          borderStyle: "none",
          boxShadow: "none",
          paddingTop: "0px",
          paddingRight: "0px",
          paddingBottom: "0px",
          paddingLeft: "0px",
          gap: "normal",
        };

        for (const prop of PROPERTIES) {
          const boxDefault = BOX_PROPERTY_DEFAULTS[prop];
          if (boxDefault != null && rootStyle[prop] !== boxDefault) continue;

          const overrideIndex = styles.findIndex((d, i) => i > 0 && d[prop] !== rootStyle[prop]);
          if (overrideIndex > 0) {
            merged[prop] = styles[overrideIndex][prop];
            sources[prop] = descriptors[overrideIndex];
          }
        }

        // Consolidate the three border longhands into a single "border" value (matching how it
        // reads in the browser's own style panel) — only kept when a real border exists at all.
        const hasBorder = merged.borderStyle !== "none" && merged.borderWidth !== "0px";
        const border = hasBorder ? `${merged.borderWidth} ${merged.borderStyle} ${merged.borderColor}` : "none";
        const borderSource = hasBorder ? (sources.borderColor ?? sources.borderWidth ?? sources.borderStyle) : undefined;
        delete merged.borderColor;
        delete merged.borderWidth;
        delete merged.borderStyle;
        delete sources.borderColor;
        delete sources.borderWidth;
        delete sources.borderStyle;

        // Only keep box-model properties that are actually set away from the browser default — an
        // element sitting at the plain default isn't something the BEM class "declared", it's noise.
        for (const prop of Object.keys(BOX_PROPERTY_DEFAULTS)) {
          if (prop === "borderWidth" || prop === "borderStyle") continue; // folded into "border" above
          if (merged[prop] === BOX_PROPERTY_DEFAULTS[prop]) {
            delete merged[prop];
            delete sources[prop];
          }
        }
        if (hasBorder) {
          merged.border = border;
          if (borderSource) sources.border = borderSource;
        }

        // Typography only means something if the element actually renders text — an icon-only
        // button still resolves inherited font/color values, but none of that was "declared" for it.
        const hasText = Boolean(root.textContent && root.textContent.trim().length > 0);
        if (!hasText) {
          for (const prop of ["color", "fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing"]) {
            delete merged[prop];
            delete sources[prop];
          }
        }

        const rect = root.getBoundingClientRect();
        merged.width = `${Math.round(rect.width)}px`;
        merged.height = `${Math.round(rect.height)}px`;

        return { merged, sources };
      },
      excludeSelector
    );

    // getComputedStyle always resolves *some* value for background/border, even when the matched
    // class never actually declared it (inherited/browser defaults look identical to a real
    // declaration) — prefer the element's own literal CSS declaration when one exists, so a class
    // like `.close { background: 0 0; border: none; }` reports exactly that, not a computed guess.
    const declared = await getDeclaredRootStyles(page, selector);
    const merged = values.merged;
    const sources = values.sources;

    if (declared.background || declared["background-color"]) {
      merged.backgroundColor = declared.background ?? declared["background-color"];
    }
    if (declared.border) {
      merged.border = declared.border;
    } else if (declared["border-color"] || declared["border-style"] || declared["border-width"]) {
      merged.border = [declared["border-width"], declared["border-style"], declared["border-color"]]
        .filter(Boolean)
        .join(" ");
    }

    const tokens: StyleToken[] = Object.entries(merged)
      .filter(([, value]) => Boolean(value))
      .map(([property, value]) => ({
        property: property as StyleToken["property"],
        value,
        source: sources[property],
      }));

    return { tokens, screenshotPath: screenshotDest };
  } finally {
    await page.close();
  }
}
