import type { StyleDiffEntry, StylePropertyName, StyleToken } from "../types.js";
import { boxShadowsMatch, colorsMatch, fontFamiliesMatch, pxValuesMatch } from "./normalize.js";

const PX_PROPERTIES = new Set<StylePropertyName>([
  "fontSize",
  "lineHeight",
  "letterSpacing",
  "borderRadius",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "gap",
]);
const COLOR_PROPERTIES = new Set<StylePropertyName>(["color", "backgroundColor"]);

// Figma omits these when there's genuinely nothing to compare (no auto-layout, no text layer) —
// there's no ground truth, so we skip the check rather than reporting a false failure.
const SKIP_WHEN_EXPECTED_MISSING = new Set<StylePropertyName>([
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "color",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "lineHeight",
  "letterSpacing",
]);

// For these, an absent Figma value has a well-defined visual meaning (no fill/radius/shadow/gap), so
// we still compare against that implicit default instead of skipping — catches unintended production
// styling (e.g. production adding spacing that the design never called for).
const ASSUMED_FIGMA_DEFAULTS: Partial<Record<StylePropertyName, string>> = {
  backgroundColor: "rgba(0, 0, 0, 0)",
  borderRadius: "0px",
  boxShadow: "none",
  gap: "0px",
};

function tokensToMap(tokens: StyleToken[]): Map<StylePropertyName, string> {
  return new Map(tokens.map((t) => [t.property, t.value]));
}

function sourcesToMap(tokens: StyleToken[]): Map<StylePropertyName, string> {
  const map = new Map<StylePropertyName, string>();
  for (const t of tokens) if (t.source) map.set(t.property, t.source);
  return map;
}

function propertiesMatch(
  property: StylePropertyName,
  expected: string | null,
  actual: string | null,
  fontAliasOverrides: Record<string, string>
): boolean {
  if (expected == null || actual == null) return expected === actual;
  if (COLOR_PROPERTIES.has(property)) return colorsMatch(expected, actual);
  if (PX_PROPERTIES.has(property)) return pxValuesMatch(expected, actual);
  if (property === "fontFamily") return fontFamiliesMatch(expected, actual, fontAliasOverrides);
  if (property === "boxShadow") return boxShadowsMatch(expected, actual);
  if (property === "fontWeight") return expected === actual;
  return expected === actual;
}

/** Compares Figma-derived tokens (expected) against production computed styles (actual). */
export function diffStyleTokens(
  expectedTokens: StyleToken[],
  actualTokens: StyleToken[],
  fontAliasOverrides: Record<string, string> = {}
): StyleDiffEntry[] {
  const expectedMap = tokensToMap(expectedTokens);
  const actualMap = tokensToMap(actualTokens);
  const actualSourceMap = sourcesToMap(actualTokens);
  const properties = new Set<StylePropertyName>([...expectedMap.keys(), ...actualMap.keys()]);

  const diffs: StyleDiffEntry[] = [];
  for (const property of properties) {
    const actual = actualMap.get(property) ?? null;
    let expected = expectedMap.get(property) ?? null;

    // "auto" gap (space-between distribution) has no fixed value at all — not comparable either way.
    if (property === "gap" && expected === "auto") continue;

    if (expected == null) {
      if (SKIP_WHEN_EXPECTED_MISSING.has(property)) continue;
      expected = ASSUMED_FIGMA_DEFAULTS[property] ?? null;
    }

    diffs.push({
      property,
      expected,
      actual,
      pass: propertiesMatch(property, expected, actual, fontAliasOverrides),
      actualSource: actualSourceMap.get(property),
    });
  }

  return diffs.sort((a, b) => a.property.localeCompare(b.property));
}
