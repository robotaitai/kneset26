# Implementation plan

## Current state (inspected)

- Static GitHub Pages site, no framework, no build step, no dependencies.
- `index.html` + `assets/app.js` (one IIFE that fetches `election_audit_seed.json` and renders everything at once) + `assets/style.css` (RTL, paper/ink design tokens, light/dark).
- Raw seed files (`*.csv`, `election_audit_seed.json`) sit at the repo root; they are byte-identical to `kneset26_real_data_seed_v0_1.zip`.
- Useful and kept: the visual language and CSS tokens, RTL-first layout, the "no arrows between columns" principle, GitHub Pages deployment from `main` root.
- Problems: data shape is coupled to the UI, everything renders at once, metrics are flat rows (no series/observation split), no validation, no explicit commitment-action or attribution relationships.

## Approach

Stay vanilla (ES modules, no bundler, no runtime dependencies) so Pages keeps working without a build. Node 20 is used only for scripts.

### 1. Data layout

```
seed/                       raw input, untouched (moved from repo root)
data/                       generated, committed, served to the browser
  meta.json                 dataset metadata, counts, build info
  topics.json               topic taxonomy (id, Hebrew label, primary flag)
  parties.json              entities
  people.json               persons (empty until a source provides them)
  commitments.json
  actions.json              + derived `stage`, `implementation_verified`
  metric_series.json        series definitions (what is measured, unit, geography, population)
  metrics.json              observations (metric_id, series_id, period, value, ...)
  commitment_action_links.json   explicit, sourced commitment<->action relationships (empty)
  attributions.json         explicit, sourced action<->metric relationships (empty)
  sources.json
```

- Every seed field is carried through; the build fails if a seed field is missing from the output.
- Metrics are split into series (entity) + observations, so tens of thousands of observations do not duplicate series metadata, and observations can later be sharded per series.
- Periods get parsed `period_type`, `period_start`, `period_end` for sorting and time-series display.
- Action `status` is kept verbatim; a normalized `stage` (`proposed | target | approved | budgeted | implemented`) is derived. No action is marked implemented or outcome-verified because the seed does not establish it.
- Links and attributions start empty. The UI states that no documented relationship exists.

### 2. Scripts (`package.json`, no dependencies)

- `npm run data:build` -> `scripts/build-data.mjs`: seed JSON -> `data/*.json`.
- `npm run data:validate` -> `scripts/validate-data.mjs`: unique IDs, required fields, enums, references, URLs, date/period formats, numeric values. Exits non-zero on error.
- `npm test` -> `node --test` on the repository layer.
- `npm start` -> `scripts/serve.mjs`, a tiny static server.

### 3. Data-access layer

`src/data/repository.js`: `createRepository(loader)`. The loader is the only thing that knows where data lives (fetch of local JSON today, an API later). Exposes `getParties`, `getTopics`, `getPeople`, `getCommitments(filters)`, `getActions(filters)`, `getMetricSeries(filters)`, `getObservations(seriesId)`, `getSources`, `getSource(id)`, `getLinksForCommitment`, `getAttributionsForAction/Metric`, `getRecordsCitingSource`. Collections are loaded lazily, indexed once (by id, topic, entity), and list calls return `{ items, total }` with `offset/limit` so views never render everything.

### 4. UI (`src/`)

Hash router with three views and URL-encoded filters:

1. `#/commitments` - מה מבטיחים עכשיו: filters by entity, topic, person (when data exists), free text; paginated cards.
2. `#/tracking` - הבטיחו מול ביצעו: per commitment, the commitment -> action -> metric chain, connected only by explicit links; otherwise "לא נמצא קשר מתועד". Separate action list with stage track and verification state.
3. `#/outcomes` - מה קרה בפועל: topic filter, series picker, time-series chart and observation table, geography/population, source and period up front, "לא ניתן לקבוע קשר סיבתי".

Shared evidence panel (`<dialog>`) for every record: publisher, title, type, source date, URL, retrieved/verified dates, caveats, and all record fields.

Missing values render as `לא נמצא מידע מתועד`, unknown implementation as `סטטוס ביצוע לא אומת`, unknown causality as `לא ניתן לקבוע קשר סיבתי`.

### 5. Docs

Rewrite `README.md` (run, data, adding records, sources, validation, methodology). Keep the original seed README as `seed/README.md`.
