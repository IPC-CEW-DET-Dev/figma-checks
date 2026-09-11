# component-tester

Compares Figma components against their live production implementation — structurally (color, typography, spacing, radius, shadow) — and generates an HTML report with side-by-side screenshots for visual reference.

## Setup

1. `npm install`
2. Copy `.env.example` to `.env` and add a [Figma personal access token](https://www.figma.com/developers/api#access-tokens):
   ```
   FIGMA_TOKEN=your-token-here
   ```
   When generating the token, Figma shows a long list of per-resource scope checkboxes. This tool only calls the file-nodes and image-export endpoints, so you only need:
   - **File content** → `Read only`

   Leave every other scope (Variables, Dev resources, Library assets, Comments, Webhooks, Projects, etc.) unchecked.
3. Edit `components.config.json` to describe the components you want to compare (see below).

## Configuring components

Each entry in `components.config.json` pairs a Figma node with a production DOM element:

```json
{
  "name": "Primary Button",
  "figma": { "fileKey": "abc123", "nodeId": "12:34" },
  "production": { "url": "https://example.com/pricing", "selector": ".btn-primary" }
}
```

- `figma.fileKey` — from the Figma file URL (`figma.com/file/<fileKey>/...`).
- `figma.nodeId` — right-click a layer in Figma → "Copy link", the `node-id` query param. This can point at either a single component frame, or a component-set (a component with variants like State=Default/Hover).
- `figma.variantName` (optional) — only needed if `nodeId` points at a component-set. If your component has variants (e.g. "State=Default, Size=Medium"), the tool automatically picks the variant matching the component's declared defaults — you don't need to hunt down an individual variant's node ID. Set `variantName` (a case-insensitive substring, e.g. `"Hover"`) only if you want to test a specific non-default state instead.
- `production.selector` — any CSS selector that uniquely targets the element (`id`, class, or a `data-testid` attribute). Prefer a dedicated test attribute if class names are unstable (e.g. CSS-in-JS). For dynamic/hashed class prefixes, use an attribute selector like `[class*="Accordion_root"]` (contains), `[class^="..."]` (starts with), or `[class$="..."]` (ends with) instead of an exact `.class` match.
- `production.excludeSelector` (optional) — the tool scans inside the matched element for the nearest descendant that actually carries each style (background, padding, font, etc.), since that's often not the exact node you selected. If the matched element also wraps an unrelated sibling section — e.g. an accordion header wrapper that also contains the (possibly hidden) collapsible panel — set this to a selector for that section so its styles aren't mistakenly picked up. Example: when testing "Accordion Header", set `excludeSelector` to the panel's class so its `gap`/padding don't leak into the header's results.
- `viewport` (optional) — `{ "width": number, "height": number }`, defaults to 1440x900.

An optional top-level `fontAliasOverrides` map handles fonts renamed entirely between Figma and production (e.g. `"Inter": "InterVariable"`). Font matching is otherwise automatic (case-insensitive substring match against the CSS font stack).

## Running

```
npm run compare                      # run all components
npm run compare -- --only "Primary Button"
```

Output is written to `reports/<timestamp>/report.html`, with per-component metadata, side-by-side Figma/production screenshots, and a style-token pass/fail table. The command exits non-zero if any component has a failing style token or an error, so it can be wired into CI later.
