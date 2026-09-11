export interface ComponentSpec {
  name: string;
  figma: { fileKey: string; nodeId: string };
  production: { url: string; selector: string; state?: "default" };
  viewport?: { width: number; height: number };
}

export interface ManifestConfig {
  fontAliasOverrides?: Record<string, string>;
  components: ComponentSpec[];
}

export type StylePropertyName =
  | "color"
  | "backgroundColor"
  | "fontFamily"
  | "fontSize"
  | "fontWeight"
  | "lineHeight"
  | "letterSpacing"
  | "borderRadius"
  | "boxShadow"
  | "paddingTop"
  | "paddingRight"
  | "paddingBottom"
  | "paddingLeft"
  | "gap";

/** A single style value pulled from either Figma or the production DOM, in a shared shape. */
export interface StyleToken {
  property: StylePropertyName;
  value: string;
}

export interface StyleTokenSet {
  tokens: StyleToken[];
}

export interface StyleDiffEntry {
  property: StylePropertyName;
  expected: string | null;
  actual: string | null;
  pass: boolean;
  delta?: string;
}

export interface VisualDiffResult {
  mismatchPercent: number;
  diffImagePath: string;
  figmaImagePath: string;
  productionImagePath: string;
}

export interface ComponentResult {
  name: string;
  styleDiffs: StyleDiffEntry[];
  visualDiff: VisualDiffResult | null;
  error?: string;
}

export interface RunResult {
  timestamp: string;
  outputDir: string;
  components: ComponentResult[];
}
