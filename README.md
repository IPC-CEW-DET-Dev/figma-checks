# component-tester

Compares Figma components against their live production implementation — both visually (pixel diff) and structurally (color, typography, spacing, radius, shadow) — and generates an HTML report.

## Setup

1. `npm install`
2. Copy `.env.example` to `.env` and add a [Figma personal access token](https://www.figma.com/developers/api#access-tokens):
   ```
   FIGMA_TOKEN=your-token-here
   ```
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
- `figma.nodeId` — right-click a layer in Figma → "Copy link", the `node-id` query param.
- `production.selector` — any CSS selector that uniquely targets the element (`id`, class, or a `data-testid` attribute). Prefer a dedicated test attribute if class names are unstable (e.g. CSS-in-JS).
- `viewport` (optional) — `{ "width": number, "height": number }`, defaults to 1440x900.

An optional top-level `fontAliasOverrides` map handles fonts renamed entirely between Figma and production (e.g. `"Inter": "InterVariable"`). Font matching is otherwise automatic (case-insensitive substring match against the CSS font stack).

## Running

```
npm run compare                      # run all components
npm run compare -- --only "Primary Button"
npm run compare -- --threshold 5     # allow up to 5% visual mismatch (default 2%)
```

Output is written to `reports/<timestamp>/report.html`, with per-component side-by-side images, a diff overlay, and a style-token pass/fail table. The command exits non-zero if any component fails, so it can be wired into CI later.
