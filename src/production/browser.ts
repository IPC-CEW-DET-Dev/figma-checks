import { chromium, type Browser, type BrowserContext } from "playwright";

export interface ViewportSize {
  width: number;
  height: number;
}

const DEFAULT_VIEWPORT: ViewportSize = { width: 1440, height: 900 };

export async function launchBrowser(): Promise<Browser> {
  return chromium.launch();
}

export async function newContext(browser: Browser, viewport?: ViewportSize): Promise<BrowserContext> {
  return browser.newContext({ viewport: viewport ?? DEFAULT_VIEWPORT });
}
