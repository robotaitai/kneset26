# kneset26 – ביקורת בחירות כנסת 26

A neutral evidence explorer for the Knesset 26 elections: documented party commitments, documented government actions, and official public metrics, each shown with its source and date.

Live site: https://robotaitai.github.io/kneset26/

> **A change in a public metric during a politician's term is not, by itself, evidence that the politician caused the change.**
>
> שינוי במדד ציבורי בתקופת כהונתו של פוליטיקאי אינו, כשלעצמו, ראיה לכך שהפוליטיקאי גרם לשינוי.

`Commitment ≠ Action ≠ Metric ≠ Attribution`

## 1. Running the site

Requirements: Node 20+. No dependencies to install.

```bash
npm start
```

Opens a static server at http://localhost:8126. The site is plain HTML/CSS/ES modules with no build step for the UI, so GitHub Pages serves the repo root of `main` directly.

| Command | What it does |
| --- | --- |
| `npm start` | Local static server (`scripts/serve.mjs`) |
| `npm run data:build` | Seed JSON -> normalized `data/*.json` |
| `npm run data:validate` | Validates `data/`, exits non-zero on errors |
| `npm test` | Tests for the data-access layer |

## 2. Where the data lives

```
seed/                         raw input (the original data pack, unchanged)
  election_audit_seed.json    source of truth for seed-derived records
  *.csv, README.md            original CSV export and pack notes, for reference
data/                         normalized files the site reads (committed)
  meta.json                   dataset metadata, counts, seed hash
  topics.json                 topic taxonomy and Hebrew labels
  parties.json                parties / factions / lists
  people.json                 politicians (curated, empty for now)
  commitments.json            what parties say they will do
  actions.json                documented government / budget / work-plan acts
  metric_series.json          what is measured (name, unit, population, sources)
  metrics.json                observations: one value per series, period, geography
  sources.json                source registry
  commitment_action_links.json  explicit commitment<->action relationships (curated, empty)
  attributions.json           explicit action<->metric relationships (curated, empty)
src/
  data/repository.js          the only module that knows how data is loaded
  views/                      commitments, tracking, outcomes
  ui/                         DOM helpers, filters, chart, evidence panel, labels
scripts/
  build-data.mjs              import/normalize
  validate-data.mjs           validation
  schema.mjs                  shared vocabulary, enums and collection schemas
```

`data:build` overwrites the seed-derived files. It never overwrites the curated files (`people`, `commitment_action_links`, `attributions`); it only creates them empty when missing. Every seed field is carried through: the build fails if a field is dropped or changed.

Records reference each other by stable ID (`entity_id`, `commitment_id`, `action_id`, `series_id`, `metric_id`, `source_id`). Source metadata lives only in `sources.json`.

The UI never reads files directly. It calls `src/data/repository.js` (`getParties`, `getCommitments(filters)`, `getActions(filters)`, `getMetricSeries(filters)`, `getObservations(seriesId)`, `getSources`, `getSource(id)`, ...). Collections load lazily, are indexed once, and list calls return `{ items, total }` with `offset`/`limit`, so views paginate instead of rendering everything. To move to an API or database, replace the loader passed to `createRepository`.

## 3. Adding a commitment

1. Add the source to `sources` in `seed/election_audit_seed.json` if it is not there yet (see section 6).
2. Add a record to `commitments`:

```json
{
  "commitment_id": "C_XX_001",
  "entity_id": "faction_example",
  "entity_name": "שם הגוף כפי שמופיע במקור",
  "topic": "education",
  "commitment": "הטקסט המתועד, קרוב ככל האפשר לנוסח המקור.",
  "target": null,
  "timeframe": null,
  "evidence_type": "documented_commitment",
  "source_id": "SRC_EXAMPLE_PLATFORM",
  "verified_at": "2026-10-01",
  "attribution_note": "This records what the party says it intends to do; it is not evidence of implementation or outcome."
}
```

3. `npm run data:build && npm run data:validate`

Leave `target` and `timeframe` as `null` unless the source states them. The UI shows `לא נמצא מידע מתועד` for missing values.

## 4. Adding an action

Add to `actions` in the seed:

```json
{
  "action_id": "A_1234_TOPIC_2026",
  "date": "2026-06-28",
  "actor_scope": "Government 37",
  "topic": "housing",
  "action_type": "government_decision",
  "status": "approved",
  "description": "What the source says was decided.",
  "amount_nis": null,
  "source_id": "SRC_GOV_DEC_1234",
  "attribution_strength": "direct_to_planning_decision",
  "outcome_link": "not_inferred"
}
```

`status` is kept verbatim. The build derives a normalized `stage` (`proposed | target | approved | budgeted | implemented`) through `ACTION_STAGE_BY_STATUS` in `scripts/schema.mjs`; a new status value fails the build until it is mapped. `implementation_verified` is true only for `implemented`, and `outcome_verified` is always false until an attribution exists.

To connect an action to a commitment, add a record to `data/commitment_action_links.json`. Only do this when a source explicitly establishes the relationship; sharing a topic is not enough:

```json
{
  "link_id": "L_0001",
  "commitment_id": "C_XX_001",
  "action_id": "A_1234_TOPIC_2026",
  "relationship": "implements | partially_implements | explicitly_references | contradicts",
  "explanation": "Why the source supports this link.",
  "source_ids": ["SRC_..."]
}
```

## 5. Adding a metric

Add one row per observation to `metrics` in the seed:

```json
{
  "metric_id": "M_CPI_SEP26_MOM",
  "topic": "cost_of_living",
  "metric_name": "Consumer Price Index monthly change",
  "period": "2026-09",
  "value": 0.3,
  "unit": "percent",
  "geography": "Israel",
  "population": null,
  "source_id": "SRC_CBS_CPI_SEP26",
  "note": null,
  "verified_at": "2026-10-15"
}
```

The build groups observations into a series by `metric_name + unit + population`, so a new period of an existing metric joins its series and appears in the time-series chart automatically. Supported `period` formats: `2026-09`, `2026`, `2025/26` (school year), and `<period> to <period>`. `value` must be a number.

Attributions (action -> metric) go in `data/attributions.json` and require evidence:

```json
{
  "attribution_id": "AT_0001",
  "action_id": "A_...",
  "metric_id": "M_...",
  "relationship": "direct | shared | limited | correlation_only | unknown",
  "explanation": "...",
  "source_ids": ["SRC_..."]
}
```

When no attribution exists the UI shows `לא ניתן לקבוע קשר סיבתי על בסיס הנתונים הקיימים`. That is the expected, normal state.

## 6. How sources work

Every record has a `source_id` pointing into `sources.json`:

| Field | Meaning |
| --- | --- |
| `publisher`, `title`, `url` | Who published what, and where |
| `source_type` | `official_primary` (state bodies), `party_primary` (party-controlled), `secondary` |
| `source_date` | Publication date, `null` when the source does not state one |
| `retrieved_at` | When it was collected |
| `notes` | Caveats |

Records carry their own `verified_at`. Every card in the UI has a "ראיות" button that opens the evidence panel with all of this plus every field of the record.

## 7. Validating the dataset

```bash
npm run data:validate
```

Checks unique IDs (per collection and across collections), required fields, enums, `YYYY[-MM[-DD]]` dates, parseable periods, numeric values, `http(s)` URLs, and that every reference (`source_id`, `entity_id`, `series_id`, `topic`, link and attribution targets) points to an existing record. It also checks series/observation consistency. Missing `source_date` and uncited sources are reported as warnings. Any error exits with code 1.

## 8. Methodology and neutrality

1. A **commitment** records what a party says it intends to do. It is not evidence of implementation.
2. An **action** records a documented government, parliamentary, budget or work-plan act. Approval or budgeting is not evidence of implementation.
3. A **metric** records an observed public outcome. Metrics are shown independently of political promises.
4. An **attribution** is an explicit, sourced claim connecting an action to a metric. None is inferred.
5. Commitments and actions are connected only by explicit, sourced links, never by shared topic.
6. Missing data stays missing: `לא נמצא מידע מתועד`, `סטטוס ביצוע לא אומת`, `לא ניתן לקבוע קשר סיבתי` are valid product states.
7. No scores, rankings, "best party" indicators, voting recommendations, or positive/negative points. Values are shown as published, without good/bad coloring.
8. Party-controlled sources are labeled `party_primary`; official state sources `official_primary`.
9. Different metrics may refer to different years because official publication lags differ by domain. The measurement period is always shown.

Coverage of the current seed is partial: several parties have no documented commitments yet. A low or zero count reflects collection scope, not the party.
