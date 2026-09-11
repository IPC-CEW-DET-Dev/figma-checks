export const PX_TOLERANCE = 1;
export const COLOR_TOLERANCE = 10; // max per-channel RGB distance treated as a match

export function parsePx(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = /-?\d*\.?\d+/.exec(value);
  return match ? parseFloat(match[0]) : null;
}

export interface RgbaColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** Parses `rgb()`/`rgba()`/`#hex` strings from either Figma extraction or getComputedStyle. */
export function parseColor(value: string | null | undefined): RgbaColor | null {
  if (!value) return null;
  const rgbaMatch = /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)/i.exec(value);
  if (rgbaMatch) {
    return {
      r: parseFloat(rgbaMatch[1]),
      g: parseFloat(rgbaMatch[2]),
      b: parseFloat(rgbaMatch[3]),
      a: rgbaMatch[4] != null ? parseFloat(rgbaMatch[4]) : 1,
    };
  }
  const hexMatch = /^#([0-9a-f]{6})$/i.exec(value.trim());
  if (hexMatch) {
    const hex = hexMatch[1];
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
      a: 1,
    };
  }
  return null;
}

export function colorsMatch(a: string | null, b: string | null): boolean {
  const ca = parseColor(a);
  const cb = parseColor(b);
  if (!ca || !cb) return a === b;
  const dist = Math.sqrt((ca.r - cb.r) ** 2 + (ca.g - cb.g) ** 2 + (ca.b - cb.b) ** 2);
  const alphaDist = Math.abs(ca.a - cb.a);
  return dist <= COLOR_TOLERANCE && alphaDist <= 0.05;
}

export function pxValuesMatch(a: string | null, b: string | null, tolerance = PX_TOLERANCE): boolean {
  const pa = parsePx(a);
  const pb = parsePx(b);
  if (pa == null || pb == null) return a === b;
  return Math.abs(pa - pb) <= tolerance;
}

function normalizeFontToken(name: string): string {
  return name.trim().replace(/^["']|["']$/g, "").toLowerCase();
}

/**
 * Figma stores a single font name while production CSS is usually a font stack. A match is
 * accepted when the Figma name appears in the stack, or via an explicit `fontAliasOverrides` entry.
 */
export function fontFamiliesMatch(
  figmaFont: string | null,
  productionFontStack: string | null,
  aliasOverrides: Record<string, string> = {}
): boolean {
  if (!figmaFont || !productionFontStack) return figmaFont === productionFontStack;

  const normalizedFigmaFont = normalizeFontToken(figmaFont);
  const override = aliasOverrides[figmaFont] ?? aliasOverrides[normalizedFigmaFont];
  const expected = override ? normalizeFontToken(override) : normalizedFigmaFont;

  const stackTokens = productionFontStack.split(",").map(normalizeFontToken);
  return stackTokens.some((token) => token.includes(expected) || expected.includes(token));
}

/** Loosely compares box-shadow strings by their first color + offset/blur values. */
export function boxShadowsMatch(a: string | null, b: string | null): boolean {
  if (!a || !b) return a === b;
  const parse = (value: string) => {
    const color = parseColor(value);
    const numbers = value.match(/-?\d*\.?\d+px/g)?.map((n) => parseFloat(n)) ?? [];
    return { color, numbers };
  };
  const pa = parse(a);
  const pb = parse(b);
  if (pa.color && pb.color && !colorsMatch(a, b)) return false;
  if (pa.numbers.length !== pb.numbers.length) return false;
  return pa.numbers.every((n, i) => Math.abs(n - pb.numbers[i]) <= PX_TOLERANCE);
}
