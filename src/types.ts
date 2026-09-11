export interface ComponentSpec {
  name: string;
  figma: { fileKey: string; nodeId: string; variantName?: string };
  production: { url: string; selector: string; state?: "default"; excludeSelector?: string };
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
  /** For production tokens only: a CSS-selector-like description of the element the value came from. */
  source?: string;
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
  /** CSS-selector-like description of the production element the actual value came from. */
  actualSource?: string;
}

export interface ComponentImages {
  figmaImagePath: string;
  productionImagePath: string;
}

export interface ComponentResult {
  name: string;
  figma: { fileKey: string; nodeId: string; variantName?: string };
  production: { url: string; selector: string; excludeSelector?: string };
  styleDiffs: StyleDiffEntry[];
  images: ComponentImages | null;
  error?: string;
}

export interface RunResult {
  timestamp: string;
  displayTimestamp: string;
  outputDir: string;
  components: ComponentResult[];
}
