import type { StyleDiffEntry, StylePropertyName, StyleToken } from "../types.js";
import { bordersMatch, boxShadowsMatch, colorsMatch, fontFamiliesMatch, pxValuesMatch } from "./normalize.js";

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
  "width",
  "height",
]);
const COLOR_PROPERTIES = new Set<StylePropertyName>(["color", "backgroundColor"]);

// Friendly group names a component/part can list in `compare` to scope which properties are checked.
const COMPARE_GROUPS: Record<string, StylePropertyName[]> = {
  background: ["backgroundColor"],
  backgroundcolor: ["backgroundColor"],
  border: ["border"],
  radius: ["borderRadius"],
  borderradius: ["borderRadius"],
  shadow: ["boxShadow"],
  boxshadow: ["boxShadow"],
  padding: ["paddingTop", "paddingRight", "paddingBottom", "paddingLeft"],
  gap: ["gap"],
  size: ["width", "height"],
  width: ["width"],
  height: ["height"],
  typography: ["color", "fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing"],
  font: ["fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing"],
  color: ["color"],
  fontfamily: ["fontFamily"],
  fontsize: ["fontSize"],
  fontweight: ["fontWeight"],
  lineheight: ["lineHeight"],
  letterspacing: ["letterSpacing"],
};

/** Expands `compare` group names into the concrete set of properties to keep, or null for "compare all". */
function expandCompare(compare: string[] | undefined): Set<StylePropertyName> | null {
  if (!compare || compare.length === 0) return null;
  const allowed = new Set<StylePropertyName>();
  for (const name of compare) {
    const props = COMPARE_GROUPS[name.trim().toLowerCase()];
    if (props) for (const p of props) allowed.add(p);
  }
  return allowed;
}

// For these, an absent Figma value has a well-defined visual meaning (no fill/radius/shadow/gap/
// border), so a real production value is still compared against that implicit default rather than
// left blank — this is only used for *display*: both sides are already filtered upstream (Figma
// extraction only pushes tokens it actually found; production capture only keeps values that are
// set away from the browser default), so a property only reaches this diff at all when at least
// one side has something real to say.
const ASSUMED_FIGMA_DEFAULTS: Partial<Record<StylePropertyName, string>> = {
  backgroundColor: "rgba(0, 0, 0, 0)",
  borderRadius: "0px",
  border: "none",
  boxShadow: "none",
  gap: "0px",
};

function tokensToMap(tokens: StyleToken[]): Map<StylePropertyName, string> {
  return new Map(tokens.map((t) => [t.property, t.value]));
}

// Different "nothing here" spellings across Figma/CSS (no fill vs 0px vs none vs the browser's
// unset default, plus the common `background: 0 0` position-only reset) shouldn't count as a
// mismatch against each other.
const NONE_LIKE_VALUES = new Set(["none", "normal", "0px", "0 0", "rgba(0, 0, 0, 0)", "transparent"]);
function isNoneLike(value: string | null): boolean {
  return value == null || NONE_LIKE_VALUES.has(value);
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
  if (property === "border") return bordersMatch(expected, actual);
  if (property === "fontWeight") return expected === actual;
  return expected === actual;
}

/** Compares Figma-derived tokens (expected) against production computed styles (actual). Both
 *  sides are pre-filtered to "real" values only (see figma/extractStyles.ts and
 *  production/captureElement.ts), so a property showing up here means Figma set it, production set
 *  it, or both — nothing shows purely because a default sentinel was assumed. */
export function diffStyleTokens(
  expectedTokens: StyleToken[],
  actualTokens: StyleToken[],
  fontAliasOverrides: Record<string, string> = {},
  compare?: string[]
): StyleDiffEntry[] {
  const expectedMap = tokensToMap(expectedTokens);
  const actualMap = tokensToMap(actualTokens);
  const actualSourceMap = sourcesToMap(actualTokens);
  const allowed = expandCompare(compare);
  const properties = new Set<StylePropertyName>([...expectedMap.keys(), ...actualMap.keys()]);

  const diffs: StyleDiffEntry[] = [];
  for (const property of properties) {
    if (allowed && !allowed.has(property)) continue;
    const actual = actualMap.get(property) ?? null;
    let expected = expectedMap.get(property) ?? null;

    // "auto" gap (space-between distribution) has no fixed value at all — not comparable either way.
    if (property === "gap" && expected === "auto") continue;

    // Production always reports a rendered width/height, but that's only a designed value to check
    // when Figma explicitly fixed the axis — otherwise skip so layout-driven sizes aren't flagged.
    if ((property === "width" || property === "height") && expected == null) continue;

    if (expected == null) {
      const assumedDefault = ASSUMED_FIGMA_DEFAULTS[property];
      if (assumedDefault != null) expected = assumedDefault;
    }

    // If both sides are just "nothing" in whatever form (none/0/null/0px), treat that as a pass
    // rather than a failure, even when the literal strings don't match (e.g. "0px" vs "normal").
    const pass = isNoneLike(expected) && isNoneLike(actual)
      ? true
      : propertiesMatch(property, expected, actual, fontAliasOverrides);

    diffs.push({
      property,
      expected,
      actual,
      pass,
      actualSource: actualSourceMap.get(property),
    });
  }

  return diffs.sort((a, b) => a.property.localeCompare(b.property));
}
