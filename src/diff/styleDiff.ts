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

function tokensToMap(tokens: StyleToken[]): Map<StylePropertyName, string> {
  return new Map(tokens.map((t) => [t.property, t.value]));
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
  const properties = new Set<StylePropertyName>([...expectedMap.keys(), ...actualMap.keys()]);

  const diffs: StyleDiffEntry[] = [];
  for (const property of properties) {
    const expected = expectedMap.get(property) ?? null;
    const actual = actualMap.get(property) ?? null;
    diffs.push({
      property,
      expected,
      actual,
      pass: propertiesMatch(property, expected, actual, fontAliasOverrides),
    });
  }

  return diffs.sort((a, b) => a.property.localeCompare(b.property));
}
