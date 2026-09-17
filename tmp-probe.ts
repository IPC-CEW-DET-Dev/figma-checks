import { launchBrowser, newContext } from "./src/production/browser.js";

const URL = "https://www.everbank.com/banking/money-market";

async function main() {
  const browser = await launchBrowser();
  const ctx = await newContext(browser, { width: 1440, height: 900 });
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: "networkidle" });

  const panelSel = '[class$="accordion-block__panel"][id$="access-money"]';
  const data = await page.locator(panelSel).first().evaluate((root) => {
    const pick = (el: Element | null) =>
      !el
        ? null
        : {
            tag: el.tagName.toLowerCase(),
            cls: el.getAttribute("class"),
            fontFamily: getComputedStyle(el).fontFamily,
            fontSize: getComputedStyle(el).fontSize,
            fontWeight: getComputedStyle(el).fontWeight,
            lineHeight: getComputedStyle(el).lineHeight,
            color: getComputedStyle(el).color,
            borderTop: getComputedStyle(el).borderTop,
            borderBottom: getComputedStyle(el).borderBottom,
            padding: getComputedStyle(el).padding,
            gap: getComputedStyle(el).gap,
            display: getComputedStyle(el).display,
            directText: Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? "").trim().length > 0),
          };
    const header = root.querySelector('[class*="accordion-block__panel-header"]');
    const icon = root.querySelector('[class*="accordion-block__icon"]');
    const content = root.querySelector('[class*="accordion-block__panel-content"]');
    let headerText: Element | null = null;
    if (header) {
      const walk: Element[] = [header];
      while (walk.length) {
        const cur = walk.shift() as Element;
        const hasDirect = Array.from(cur.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? "").trim().length > 0);
        if (hasDirect) { headerText = cur; break; }
        for (const c of Array.from(cur.children)) walk.push(c);
      }
    }
    return {
      panel: pick(root),
      header: pick(header),
      headerFirstTextEl: pick(headerText),
      headerHTML: (header as HTMLElement | null)?.outerHTML.slice(0, 900),
      icon: pick(icon),
      iconSvg: pick(icon?.querySelector("svg") ?? null),
      content: pick(content),
    };
  });

  console.log(JSON.stringify(data, null, 2));
  await browser.close();
}

main();
