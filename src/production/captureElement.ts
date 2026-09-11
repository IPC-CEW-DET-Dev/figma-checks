import type { BrowserContext } from "playwright";
import type { StyleToken } from "../types.js";

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
        // `excludeSelector` is skipped entirely — useful when the matched element also wraps an
        // unrelated sibling section (e.g. a header wrapper that also contains a collapsible panel).
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
        for (const prop of PROPERTIES) {
          const overrideIndex = styles.findIndex((d, i) => i > 0 && d[prop] !== rootStyle[prop]);
          if (overrideIndex > 0) {
            merged[prop] = styles[overrideIndex][prop];
            sources[prop] = descriptors[overrideIndex];
          }
        }
        return { merged, sources };
      },
      excludeSelector
    );

    const tokens = Object.entries(values.merged)
      .filter(([, value]) => value && value !== "none" && value !== "normal")
      .map(([property, value]) => ({
        property: property as StyleToken["property"],
        value,
        source: values.sources[property],
      }));

    return { tokens, screenshotPath: screenshotDest };
  } finally {
    await page.close();
  }
}
