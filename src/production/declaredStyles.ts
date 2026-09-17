import type { Page } from "playwright";

const TRACKED_PROPERTIES = ["background", "background-color", "border", "border-color", "border-style", "border-width"];

interface CSSProperty {
  name: string;
  value: string;
}

interface RuleMatch {
  rule?: {
    origin?: string;
    style?: { cssProperties?: CSSProperty[] };
  };
}

interface MatchedStylesResult {
  matchedCSSRules?: RuleMatch[];
}

/** Author-declared rules only — excludes browser/user-agent default styling (e.g. a plain
 *  `<button>`'s built-in border), which looks identical to a real declaration once resolved but
 *  isn't something anyone actually wrote for this component. */
function collectAuthoredProperties(rules: RuleMatch[] | undefined, into: Record<string, string>): void {
  for (const match of rules ?? []) {
    if (match.rule?.origin === "user-agent") continue;
    for (const prop of match.rule?.style?.cssProperties ?? []) {
      if (TRACKED_PROPERTIES.includes(prop.name) && prop.value) into[prop.name] = prop.value;
    }
  }
}

/**
 * Reads the literal background/border values declared on the matched element itself via the
 * DevTools protocol (`CSS.getMatchedStylesForNode`) — unlike `getComputedStyle`, this distinguishes
 * a real author declaration (e.g. `.close { background: 0 0; border: none; }`) from a browser
 * default that merely resolves to the same-looking computed value. background/border don't inherit,
 * so only the element's own matched rules are relevant (no need to walk ancestors).
 */
export async function getDeclaredRootStyles(page: Page, selector: string): Promise<Record<string, string>> {
  const client = await page.context().newCDPSession(page);
  try {
    await client.send("DOM.enable");
    await client.send("CSS.enable");
    const { root } = await client.send("DOM.getDocument", { depth: -1, pierce: true });
    const { nodeId } = await client.send("DOM.querySelector", { nodeId: root.nodeId, selector });
    if (!nodeId) return {};

    const matched = (await client.send("CSS.getMatchedStylesForNode", { nodeId })) as MatchedStylesResult;
    const declared: Record<string, string> = {};
    collectAuthoredProperties(matched.matchedCSSRules, declared);
    return declared;
  } finally {
    await client.detach().catch(() => undefined);
  }
}
