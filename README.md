# component-tester

Compares Figma components against their live production implementation and generates an HTML report. Comparison is **strict and explicit**: you name a Figma frame/layer and a production CSS class, and the tool compares only the styles declared on that exact layer against that exact element (color, typography, spacing, radius, border, shadow, and — for fixed-size layers — width/height). Any difference is flagged as an error. A side-by-side pixel-diff screenshot is also produced for reference, but it never affects pass/fail — only style-token mismatches do.

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
- **Strict, root-only comparison** — the tool reads only the styles declared on the exact element your `selector` targets and the exact Figma layer you name (after transparently unwrapping a single pass-through wrapper frame, common for component instances). It does **not** scan descendants to "find" a value, so every reported token belongs to the element/layer you specified. Pick a `selector` and Figma layer that point directly at the piece you want to compare — for composite components, use `parts` (below) to map each sub-element to its own layer. Width/height are only compared when the Figma layer has an explicitly fixed size (e.g. an icon or close button); layout-driven "fill"/"hug" sizes are ignored.
  > The older `production.excludeSelector` / `figma.excludeLayerName` fields are now ignored (there's no descendant scan left to exclude from) and can be removed from your config.
- `compare` (optional, on a component or a `part`) — restrict the comparison to specific property groups so each layer→class pair only checks what's relevant. Accepts group names `background`, `border`, `radius`, `shadow`, `padding`, `gap`, `size`, `typography`, `font`, `color` (or exact property names like `paddingBottom`). Omit to compare everything found. Example: a header part uses `["padding", "typography"]`, an icon uses `["size"]`, a content wrapper whose inner text belongs to other components uses `["padding"]`.
- `viewport` (optional) — `{ "width": number, "height": number }`, defaults to 1440x900.
- `parts` (optional) — for composite components that combine multiple visually distinct sub-sections (e.g. an accordion's header + body), a single flat style-token diff isn't meaningful — there's no one "the" padding/gap when several sub-frames each have their own. `parts` lets you declare named sub-sections, each independently diffed:
  ```json
  {
    "name": "Accordion Open",
    "figma": { "fileKey": "abc123", "nodeId": "1:1" },
    "production": { "url": "https://example.com/faq", "selector": ".accordion-item" },
    "parts": [
      { "name": "Header", "figma": { "layerName": "Accordion Header" }, "production": { "selector": ".accordion-item__header" } },
      { "name": "Body", "figma": { "layerName": "Accordion Body" }, "production": { "selector": ".accordion-item__body" } }
    ]
  }
  ```
  - `figma.layerName` — the exact layer name of the sub-frame, as seen in the Figma layers panel (case-insensitive). Resolved by searching the parent component's already-fetched tree — no extra API call, and far easier to get right than a nested instance-child node ID.
  - `figma.nodeId` — an explicit node ID instead of `layerName`, if you already have it (e.g. via the Figma API) or the layer name isn't unique enough.
  - The top-level `figma`/`production` still drive the overall screenshot and visual pixel-diff for the whole composite; `parts` only affect style-token diffing.
- `hideGeneralTable` (optional, default `false`) — hides the top-level style-token table, keeping only the parts' tables (the top-level screenshot/visual-diff still shows). Set this when the top-level comparison is ambiguous or redundant once `parts` are added — see below.

### Recommended pattern: BEM-styled production code

If your production styles follow BEM (`.block`, `.block__element`), lean on `parts` instead of relying on the top-level comparison's node-selection heuristics (which have to guess which nested Figma frame/DOM element is "the" one when a component has multiple internal sections). Add one `part` per meaningful `block__element`, matching each to its corresponding Figma layer, and set `hideGeneralTable: true`:

```json
{
  "name": "Alert Block",
  "figma": { "fileKey": "abc123", "nodeId": "1:1" },
  "production": { "url": "https://example.com", "selector": ".alert-block" },
  "hideGeneralTable": true,
  "parts": [
    { "name": "Body", "figma": { "layerName": "Alert Body" }, "production": { "selector": ".alert-block__body" } },
    { "name": "Close Button", "figma": { "layerName": "Close" }, "production": { "selector": ".alert-block__close" } }
  ]
}
```

This keeps the top-level `figma`/`production` purely for the reference screenshot and visual pixel-diff, while every style-token comparison comes from an explicit, unambiguous element-to-layer mapping.

An optional top-level `fontAliasOverrides` map handles fonts renamed entirely between Figma and production (e.g. `"Inter": "InterVariable"`). Font matching is otherwise automatic (case-insensitive substring match against the CSS font stack).

## Running

```
npm run compare                      # run all components
npm run compare -- --only "Primary Button"
npm run compare -- --threshold 5     # visual-diff overlay sensitivity only (does not affect pass/fail)
```

Output is written to `reports/<timestamp>/report.html`, with per-component metadata, side-by-side Figma/production screenshots, a reference-only pixel-diff overlay, and a style-token pass/fail table. The command exits non-zero if any component has a failing style token or errors, so it can be wired into CI later. The visual pixel-diff is informational only and never affects pass/fail.

## Publishing the latest report (GitHub Pages)

`reports/<timestamp>/` is gitignored (each run generates a new timestamped folder, and images shouldn't bloat the repo), so GitHub Pages can't serve it directly. `npm run publish-report` copies the most recent run into a stable, committed path — `docs/reports/` — that always reflects the latest run, so the published URL never changes.

```
npm run compare
npm run publish-report
git add docs && git commit -m "Publish latest report" && git push
```

One-time setup: in the repo's GitHub Settings → Pages, set **Source** to "Deploy from a branch", **Branch** to `main`, **Folder** to `/docs`. The report will then be available at `https://<org>.github.io/<repo>/reports/`.
