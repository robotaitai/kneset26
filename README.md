# kneset26 – ביקורת בחירות כנסת 26

A side-by-side election comparison table for the Knesset 26 elections. Pick the parties you care about and a topic, and see what each one says now, what was promised before against what was actually done, and what happened to the relevant public metrics. Every value opens its full evidence: exact text, dates, budget, status, authority and sources.

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
| `npm test` | Tests for the data-access layer and comparison logic |

## 2. The comparison table (home page)

`/` (`#/compare`) is the product. Everything else is a secondary page.

- **Parties:** choose which to compare (default 5, max 8), add, remove, reorder (arrows or drag). Columns follow that order.
- **Topics:** "all topics", or pick one (e.g. Education) to see only its rows, then add more.
- **Modes:**
  1. `מה מבטיחים עכשיו` – current documented positions per party and row.
  2. `הבטיחו מול ביצעו` – per party: past promise / documented action / evidence status, as separate layers. Government actions the source does not attribute to any party are shown in their own column, never inside a party cell.
  3. `מה קרה בפועל` – objective KPIs per row, with values over time, the authority holder during the period, and the attribution state. Not a party scorecard; the KPI definition is identical whatever parties are selected.
- **Cells** are compact (short statement, target, timeframe, source). Clicking opens the evidence drawer with everything else.
- **Missing data** shows `לא נמצא מידע מתועד`. Nothing is filled by inference.
- State lives in the URL (`#/compare?mode=track&p=faction_yesh_atid,party_democrats&t=education`), so any view can be shared.

### Evidence layers

A single cell can carry several independent layers. They stay separate in the data model and are only joined by explicit records:

| Layer | Stored in | Joined by |
| --- | --- | --- |
| Current position | `commitments.json` with `campaign` = current campaign | – |
| Past promise | `commitments.json` with an earlier `campaign` | – |
| Action | `actions.json` | `commitment_action_links.json` (explicit, sourced) |
| Outcome | `kpis.json` -> `metric_series.json` -> `metrics.json` | row (subtopic) only, never per party |
| Authority | `authorities.json` (who held formal authority, when) | topic + period overlap |
| Attribution | `attributions.json` (explicit, sourced) | `action_id` + `metric_id` |

Evidence statuses (`התחייבות מתועדת`, `הוצע`, `יעד בתוכנית`, `אושר`, `תוקצב`, `בוצע`, `ביצוע לא אומת`) describe how far the documented evidence goes. They are not scores and share one neutral style.

### Rows, KPIs and classification (config, not code)

```
config/
  taxonomy.json        topics -> subtopics (row order of the table). `core: false` rows exist only
                       to hold seed records that fit no core row and are shown only when they have data
  classification.json  which row(s) each commitment and action appears in, and each commitment's campaign
  kpis.json            reusable KPI definitions (label, unit, denominator, source, series_ids, row)
  compare.json         default parties, max parties, short display names
```

`data:build` reads these, checks them (unknown rows, a record placed in a row of a different topic, a series without a KPI, a KPI unit that differs from its series, classification entries that are not in the seed), and writes `data/subtopics.json`, `data/kpis.json` and `data/compare.json`, plus `subtopic_ids` and `campaign` on each commitment/action. Classification only decides where a record is shown; it never links records to each other.

To add a row: add it to `config/taxonomy.json`. To move a record: edit `config/classification.json`. To define a KPI for a new series: add it to `config/kpis.json`. Then `npm run data:build && npm run data:validate`.

### Authority during a period

`data/authorities.json` is curated and currently empty, so the table shows `לא נמצא מידע מתועד` in that column. Record shape:

```json
{
  "authority_id": "AU_G37_HEALTH_01",
  "role": "minister",
  "office": "ministry_of_health",
  "office_label": "משרד הבריאות",
  "topics": ["health"],
  "holder_name": "...",
  "person_id": null,
  "entity_id": "faction_...",
  "government": "Government 37",
  "start": "2023-01-01",
  "end": null,
  "source_id": "SRC_..."
}
```

Each KPI row lists the authorities whose topic matches and whose term overlaps the KPI's observation period, with the fixed note `לא ניתן לקבוע קשר סיבתי מהנתון לבדו` unless an attribution record exists.

## 3. Where the data lives

```
seed/                         raw input (the original data pack, unchanged)
  election_audit_seed.json    source of truth for seed-derived records
  *.csv, README.md            original CSV export and pack notes, for reference
data/                         normalized files the site reads (committed)
  meta.json                   dataset metadata, counts, seed hash
  topics.json                 topics (from config/taxonomy.json)
  subtopics.json              comparison rows (from config/taxonomy.json)
  kpis.json                   KPI definitions (from config/kpis.json)
  compare.json                comparison defaults (from config/compare.json)
  authorities.json            who held authority over a topic, when (curated, empty)
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
  data/comparison.js          builds the comparison matrix (pure, tested in Node)
  views/compare.js            the comparison table (home)
  views/                      party, person, metrics, sources, commitments, actions (secondary)
  ui/drawer.js                evidence drawer for a cell / row of actions / KPI
  ui/                         DOM helpers, formatting, filters, chart, labels
scripts/
  build-data.mjs              import/normalize
  validate-data.mjs           validation
  schema.mjs                  shared vocabulary, enums and collection schemas
```

`data:build` overwrites the seed-derived files. It never overwrites the curated files (`people`, `commitment_action_links`, `attributions`, `authorities`); it only creates them empty when missing. Every seed field is carried through: the build fails if a field is dropped or changed.

Records reference each other by stable ID (`entity_id`, `commitment_id`, `action_id`, `series_id`, `metric_id`, `source_id`). Source metadata lives only in `sources.json`.

The UI never reads files directly. It calls `src/data/repository.js` (`getComparison({ mode, partyIds, topicIds })`, `getParties`, `getCommitments(filters)`, `getActions(filters)`, `getMetricSeries(filters)`, `getObservations(seriesId)`, `getSources`, `getSource(id)`, ...). Collections load lazily, are indexed once, and list calls return `{ items, total }` with `offset`/`limit`, so views paginate instead of rendering everything. To move to an API or database, replace the loader passed to `createRepository`.

## 4. Adding a commitment

1. Add the source to `sources` in `seed/election_audit_seed.json` if it is not there yet (see section 7).
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

3. Place it in a row: add `"C_XX_001": { "subtopics": ["edu_teacher_pay"], "campaign": "knesset26" }` to `config/classification.json`. Use an earlier campaign (e.g. `knesset25`) for a past promise; it then appears in `הבטיחו מול ביצעו`.
4. `npm run data:build && npm run data:validate`

Leave `target` and `timeframe` as `null` unless the source states them. The UI shows `לא נמצא מידע מתועד` for missing values.

## 5. Adding an action

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

Then place it in a row in `config/classification.json` (`"actions"`). `status` is kept verbatim. The build derives a normalized `stage` (`proposed | target | approved | budgeted | implemented`) through `ACTION_STAGE_BY_STATUS` in `scripts/schema.mjs`; a new status value fails the build until it is mapped. `implementation_verified` is true only for `implemented`, and `outcome_verified` is always false until an attribution exists.

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

## 6. Adding a metric

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

The build groups observations into a series by `metric_name + unit + population`, so a new period of an existing metric joins its series and appears in the table and chart automatically. A brand-new series needs a KPI definition in `config/kpis.json` (the build fails without one). Supported `period` formats: `2026-09`, `2026`, `2025/26` (school year), and `<period> to <period>`. `value` must be a number.

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

## 7. How sources work

Every record has a `source_id` pointing into `sources.json`:

| Field | Meaning |
| --- | --- |
| `publisher`, `title`, `url` | Who published what, and where |
| `source_type` | `official_primary` (state bodies), `party_primary` (party-controlled), `secondary` |
| `source_date` | Publication date, `null` when the source does not state one |
| `retrieved_at` | When it was collected |
| `notes` | Caveats |

Records carry their own `verified_at`. Every value in the table opens the evidence drawer with all of this; "כל השדות" shows every field of the underlying record. A commitment may carry an optional `source_excerpt`; when absent the drawer says no excerpt is stored.

## 8. Validating the dataset

```bash
npm run data:validate
```

Checks unique IDs (per collection and across collections), required fields, enums, `YYYY[-MM[-DD]]` dates, parseable periods, numeric values, `http(s)` URLs, and that every reference (`source_id`, `entity_id`, `series_id`, `topic`, link and attribution targets) points to an existing record. It also checks series/observation consistency, that every row placement stays within the record's topic, KPI/series unit agreement, authority date order, and that `compare.json` names real parties. Missing `source_date` and uncited sources are reported as warnings. Any error exits with code 1.

## 9. Methodology and neutrality

1. A **commitment** records what a party says it intends to do. It is not evidence of implementation.
2. An **action** records a documented government, parliamentary, budget or work-plan act. Approval or budgeting is not evidence of implementation.
3. A **metric** records an observed public outcome. Metrics are shown independently of political promises.
4. An **attribution** is an explicit, sourced claim connecting an action to a metric. None is inferred.
5. Commitments and actions are connected only by explicit, sourced links, never by shared topic.
6. Missing data stays missing: `לא נמצא מידע מתועד`, `סטטוס ביצוע לא אומת`, `לא ניתן לקבוע קשר סיבתי` are valid product states.
7. No overall score, ranking, winner, "best party", voting-match percentage, recommendation, or positive/negative points. Values are shown as published, without good/bad coloring. Evidence statuses share one neutral style.
8. Party-controlled sources are labeled `party_primary`; official state sources `official_primary`.
9. Different metrics may refer to different years because official publication lags differ by domain. The measurement period is always shown.
10. Outcome rows show who held formal authority during the period, never that they caused the change. KPI definitions are fixed and identical for every political actor.

Coverage of the current seed is partial: several parties have no documented commitments yet. A low or zero count reflects collection scope, not the party.
