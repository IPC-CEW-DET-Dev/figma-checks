const FIGMA_API_BASE = "https://api.figma.com/v1";

export interface FigmaClientOptions {
  token: string;
}

export class FigmaClient {
  constructor(private readonly options: FigmaClientOptions) {}

  private async request<T>(url: string): Promise<T> {
    const res = await fetch(url, {
      headers: { "X-Figma-Token": this.options.token },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Figma API request failed (${res.status} ${res.statusText}) for ${url}: ${body}`);
    }
    return (await res.json()) as T;
  }

  /** Fetches the document subtree for a single node. */
  async getNode(fileKey: string, nodeId: string): Promise<FigmaNode> {
    const data = await this.request<FigmaNodesResponse>(
      `${FIGMA_API_BASE}/files/${fileKey}/nodes?ids=${encodeURIComponent(nodeId)}`
    );
    const entry = data.nodes[nodeId];
    if (!entry) {
      throw new Error(`Node ${nodeId} not found in Figma file ${fileKey}`);
    }
    return entry.document;
  }

  /** Fetches a rendered PNG export URL for a node. */
  async getImageUrl(fileKey: string, nodeId: string, scale = 2): Promise<string> {
    const data = await this.request<FigmaImagesResponse>(
      `${FIGMA_API_BASE}/images/${fileKey}?ids=${encodeURIComponent(nodeId)}&scale=${scale}&format=png`
    );
    const url = data.images[nodeId];
    if (!url) {
      throw new Error(`No image export returned for node ${nodeId} in Figma file ${fileKey}`);
    }
    return url;
  }
}

// Minimal shapes of the Figma REST API we rely on — not the full API surface.
export interface FigmaNodesResponse {
  nodes: Record<string, { document: FigmaNode }>;
}

export interface FigmaImagesResponse {
  images: Record<string, string>;
}

export interface FigmaPaint {
  type: string;
  color?: { r: number; g: number; b: number; a: number };
  opacity?: number;
}

export interface FigmaEffect {
  type: string;
  color?: { r: number; g: number; b: number; a: number };
  offset?: { x: number; y: number };
  radius?: number;
}

export interface FigmaTypeStyle {
  fontFamily?: string;
  fontWeight?: number;
  fontSize?: number;
  lineHeightPx?: number;
  letterSpacing?: number;
}

export interface FigmaComponentPropertyDefinition {
  type: "BOOLEAN" | "INSTANCE_SWAP" | "TEXT" | "VARIANT";
  defaultValue?: string | boolean;
  variantOptions?: string[];
}

export interface FigmaNode {
  id: string;
  name: string;
  type: string;
  fills?: FigmaPaint[];
  strokes?: FigmaPaint[];
  effects?: FigmaEffect[];
  cornerRadius?: number;
  style?: FigmaTypeStyle;
  layoutMode?: "NONE" | "HORIZONTAL" | "VERTICAL";
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  itemSpacing?: number;
  absoluteBoundingBox?: { x: number; y: number; width: number; height: number };
  componentPropertyDefinitions?: Record<string, FigmaComponentPropertyDefinition>;
  children?: FigmaNode[];
}
