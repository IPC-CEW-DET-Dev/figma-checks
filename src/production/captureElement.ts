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
  screenshotDest: string
): Promise<CaptureResult> {
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: "networkidle" });
    const locator = page.locator(selector).first();
    await locator.waitFor({ state: "visible", timeout: 15000 });
    await locator.screenshot({ path: screenshotDest });

    const values = await locator.evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        color: s.color,
        backgroundColor: s.backgroundColor,
        fontFamily: s.fontFamily,
        fontSize: s.fontSize,
        fontWeight: s.fontWeight,
        lineHeight: s.lineHeight,
        letterSpacing: s.letterSpacing,
        borderRadius: s.borderRadius,
        boxShadow: s.boxShadow,
        paddingTop: s.paddingTop,
        paddingRight: s.paddingRight,
        paddingBottom: s.paddingBottom,
        paddingLeft: s.paddingLeft,
        gap: s.gap,
      };
    });

    const tokens = Object.entries(values)
      .filter(([, value]) => value && value !== "none" && value !== "normal")
      .map(([property, value]) => ({ property: property as StyleToken["property"], value }));

    return { tokens, screenshotPath: screenshotDest };
  } finally {
    await page.close();
  }
}
