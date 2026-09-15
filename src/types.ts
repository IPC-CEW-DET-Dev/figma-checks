export interface ComponentPart {
  name: string;
  /** Either `layerName` (searched within the parent component's already-fetched tree — no extra API
   *  call, and far easier to obtain than a nested instance-child node ID) or an explicit `nodeId`. */
  figma: { layerName?: string; nodeId?: string; variantName?: string; excludeLayerName?: string };
  production: { selector: string; excludeSelector?: string };
}

export interface Viewport {
  width: number;
  height: number;
}

export interface ComponentSpec {
  name: string;
  figma: { fileKey: string; nodeId: string; variantName?: string; excludeLayerName?: string };
  production: { url: string; selector: string; excludeSelector?: string };
  viewport?: Viewport;
  /** For composite components (e.g. an accordion's header+body): named sub-sections, each with its
   *  own explicit Figma node and production selector, so style diffs don't have to guess which
   *  nested frame/element is "the" one. The top-level figma/production above still drive the overall
   *  screenshot and visual diff. */
  parts?: ComponentPart[];
}

export interface ManifestConfig {
  fontAliasOverrides?: Record<string, string>;
  /** Named, reusable viewports (e.g. "desktop", "mobile") that components can reference by name
   *  instead of repeating `{ width, height }` everywhere. Resolved at load time. */
  viewports?: Record<string, Viewport>;
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

export interface StyleDiffEntry {
  property: StylePropertyName;
  expected: string | null;
  actual: string | null;
  pass: boolean;
  /** CSS-selector-like description of the production element the actual value came from. */
  actualSource?: string;
}

export interface ComponentImages {
  figmaImagePath: string;
  productionImagePath: string;
  diffImagePath: string;
  mismatchPercent: number;
}

export interface ComponentPartResult {
  name: string;
  figma: { layerName?: string; nodeId?: string; variantName?: string; excludeLayerName?: string };
  production: { selector: string; excludeSelector?: string };
  styleDiffs: StyleDiffEntry[];
  error?: string;
}

export interface ComponentResult {
  name: string;
  figma: { fileKey: string; nodeId: string; variantName?: string; excludeLayerName?: string };
  production: { url: string; selector: string; excludeSelector?: string };
  styleDiffs: StyleDiffEntry[];
  parts: ComponentPartResult[];
  images: ComponentImages | null;
  error?: string;
}

export interface RunResult {
  timestamp: string;
  displayTimestamp: string;
  outputDir: string;
  components: ComponentResult[];
}
