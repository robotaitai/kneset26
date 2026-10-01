import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRepository, normalizeText } from "../src/data/repository.js";

const fileLoader = (name) => readFile(new URL(`../data/${name}.json`, import.meta.url), "utf8").then(JSON.parse);
const repo = createRepository(fileLoader);

test("loads every commitment and paginates", async () => {
  const all = await repo.getCommitments();
  assert.equal(all.total, 49);
  const p = await repo.getCommitments({ offset: 10, limit: 5 });
  assert.equal(p.total, 49);
  assert.equal(p.items.length, 5);
  assert.equal(p.items[0].commitment_id, all.items[10].commitment_id);
});

test("filters commitments by topic and entity together", async () => {
  const { items, total } = await repo.getCommitments({ topic: "education", entityId: "faction_yisrael_beiteinu" });
  assert.ok(total > 0);
  for (const c of items) {
    assert.equal(c.topic, "education");
    assert.equal(c.entity_id, "faction_yisrael_beiteinu");
  }
});

test("entity with no documented commitments returns empty, not an error", async () => {
  const { total } = await repo.getCommitments({ entityId: "faction_likud" });
  assert.equal(total, 0);
});

test("free-text search ignores Hebrew quote marks", async () => {
  assert.equal(normalizeText('ש"ס'), normalizeText("ש״ס"));
  const { items } = await repo.getCommitments({ q: "גיל הרך" });
  assert.ok(items.length > 0);
  for (const c of items) assert.match(normalizeText(c.commitment), /גיל הרך/);
});

test("facets count other dimensions", async () => {
  const { byTopic, byEntity } = await repo.getCommitmentFacets({ topic: "health" });
  assert.ok(byTopic.get("education") > 0, "topic facet ignores the topic filter");
  for (const [, n] of byEntity) assert.ok(n > 0);
});

test("actions are sorted newest first and carry a stage", async () => {
  const { items } = await repo.getActions();
  assert.equal(items.length, 7);
  for (let i = 1; i < items.length; i++) assert.ok(String(items[i - 1].date) >= String(items[i].date));
  for (const a of items) assert.ok(a.stage);
  for (const a of items) assert.equal(a.outcome_verified, false);
});

test("metric series group observations in period order", async () => {
  const obs = await repo.getObservations("S_housing_price_index_bi_monthly_change");
  assert.equal(obs.length, 12);
  for (let i = 1; i < obs.length; i++) assert.ok(obs[i - 1].period_end <= obs[i].period_end);
  const { items } = await repo.getMetricSeries({ topic: "health" });
  assert.ok(items.every((s) => s.topic === "health"));
});

test("no links or attributions are inferred", async () => {
  assert.equal(await repo.getLinkCount(), 0);
  assert.deepEqual(await repo.getLinksForCommitment("C_IB_001"), []);
  assert.deepEqual(await repo.getAttributionsForSeries("S_national_health_expenditure"), []);
});

test("source lookup and citations", async () => {
  const s = await repo.getSource("SRC_CBS_CPI_AUG26");
  assert.equal(s.source_type, "official_primary");
  const n = await repo.countCitations("SRC_CBS_CPI_AUG26");
  assert.ok(n.metrics > 0);
  assert.equal(await repo.getSource("NOPE"), null);
});

// ---------------------------------------------------------------------------
// Comparison matrix

test("comparison: every row comes from the taxonomy config, in order", async () => {
  const subtopics = await repo.getSubtopics();
  const cmp = await repo.getComparison({ mode: "now", partyIds: ["faction_likud"], topicIds: ["education"] });
  assert.equal(cmp.topics.length, 1);
  const expected = subtopics.filter((s) => s.topic === "education").map((s) => s.subtopic_id);
  assert.deepEqual(cmp.topics[0].rows.map((r) => r.subtopic.subtopic_id), expected);
});

test("comparison: party with no data gets empty cells, never inferred content", async () => {
  const cmp = await repo.getComparison({ mode: "now", partyIds: ["faction_likud"] });
  for (const t of cmp.topics) for (const r of t.rows) {
    const cell = r.cells.faction_likud;
    assert.equal(cell.current.length, 0);
    assert.equal(cell.past.length, 0);
    assert.equal(cell.track_status, null);
  }
});

test("comparison: cells contain only that party's commitments for that row", async () => {
  const ids = ["party_beyahad", "faction_yisrael_beiteinu", "party_democrats"];
  const cmp = await repo.getComparison({ mode: "now", partyIds: ids });
  let n = 0;
  for (const t of cmp.topics) for (const r of t.rows) for (const id of ids) {
    for (const c of r.cells[id].current) {
      assert.equal(c.entity_id, id);
      assert.ok(c.subtopic_ids.includes(r.subtopic.subtopic_id));
      n++;
    }
  }
  assert.ok(n > 0);
});

test("comparison: actions are never placed in a party cell without an explicit link", async () => {
  const cmp = await repo.getComparison({ mode: "track", partyIds: ["faction_likud", "faction_shas", "party_beyahad"] });
  const rowActions = cmp.topics.flatMap((t) => t.rows.flatMap((r) => r.actions));
  assert.ok(rowActions.length > 0, "seed actions appear at row level");
  for (const t of cmp.topics) for (const r of t.rows) for (const cell of Object.values(r.cells)) {
    assert.equal(cell.links.length, 0, "seed has no commitment_action_links");
  }
});

test("comparison: KPI definitions are identical regardless of selected parties", async () => {
  const a = await repo.getComparison({ mode: "outcomes", partyIds: ["faction_likud"], topicIds: ["housing"] });
  const b = await repo.getComparison({ mode: "outcomes", partyIds: ["party_democrats", "faction_yesh_atid"], topicIds: ["housing"] });
  const kpis = (c) => c.topics[0].rows.flatMap((r) => r.kpis.map((k) => JSON.stringify([k.kpi, k.observations])));
  assert.deepEqual(kpis(a), kpis(b));
  assert.ok(kpis(a).length > 0);
});

test("comparison: every metric series is reachable through exactly one KPI row", async () => {
  const cmp = await repo.getComparison({ mode: "outcomes", partyIds: [] });
  const seen = cmp.topics.flatMap((t) => t.rows.flatMap((r) => r.kpis.flatMap((k) => k.kpi.series_ids)));
  const series = await repo.getMetricSeries();
  assert.equal(seen.length, series.total);
  assert.equal(new Set(seen).size, series.total);
});

test("track status: promise alone is 'not verified', never implemented", async () => {
  const { trackStatus, highestStage } = await import("../src/data/comparison.js");
  assert.equal(trackStatus({ past: [], links: [] }), null);
  assert.equal(trackStatus({ past: [{}], links: [] }), "not_verified");
  assert.equal(trackStatus({ past: [{}], links: [{ action: { stage: "approved" } }, { action: { stage: "budgeted" } }] }), "budgeted");
  assert.equal(highestStage([{ stage: "target" }, { stage: "proposed" }]), "target");
});

test("comparison: a documented link puts the action in that party's cell only", async () => {
  const { buildComparison } = await import("../src/data/comparison.js");
  const load = (n) => readFile(new URL(`../data/${n}.json`, import.meta.url), "utf8").then(JSON.parse);
  const names = ["meta", "compare", "parties", "topics", "subtopics", "commitments", "actions", "kpis", "metric_series", "metrics", "attributions", "authorities"];
  const d = Object.fromEntries(await Promise.all(names.map(async (n) => [n, await load(n)])));
  d.series = d.metric_series;
  // Synthetic past promise + explicit link, as curated data would add them.
  d.commitments = [...d.commitments, { commitment_id: "C_TEST_PAST", entity_id: "faction_likud", topic: "housing", subtopic_ids: ["ho_rent"], campaign: "knesset25", commitment: "x", source_id: "SRC_KNESSET_FACTIONS" }];
  d.links = [{ link_id: "L1", commitment_id: "C_TEST_PAST", action_id: "A_BUDGET_RENT_ASSIST_2025", relationship: "implements", explanation: "test", source_ids: ["SRC_BUDGET_2025"] }];
  const cmp = buildComparison(d, { mode: "track", partyIds: ["faction_likud", "party_beyahad"], topicIds: ["housing"] });
  const row = cmp.topics[0].rows.find((r) => r.subtopic.subtopic_id === "ho_rent");
  assert.equal(row.cells.faction_likud.track_status, "budgeted");
  assert.equal(row.cells.faction_likud.links[0].action.action_id, "A_BUDGET_RENT_ASSIST_2025");
  assert.equal(row.cells.party_beyahad.links.length, 0);
  const other = cmp.topics[0].rows.find((r) => r.subtopic.subtopic_id === "ho_prices");
  assert.equal(other.cells.faction_likud.track_status, null, "link does not leak to other rows");
});

// ---------------------------------------------------------------------------
// Knesset-derived authorities and people

test("authorities: contiguous Knesset rows are merged into one term", async () => {
  const a = await repo.getAuthorities();
  const kish = a.filter((x) => x.holder_name === "יואב קיש" && x.office === "משרד החינוך");
  assert.equal(kish.length, 1);
  assert.equal(kish[0].start, "2022-12-29");
  assert.equal(kish[0].end, null);
  assert.equal(kish[0].entity_id, "faction_likud");
  const bennett = a.filter((x) => x.holder_name === "נפתלי בנט" && x.office === "משרד החינוך");
  assert.equal(bennett.length, 2, "a one-day gap (2015-12-06/07) is not merged over");
});

test("authorities: every record maps to comparison topics and cites the Knesset", async () => {
  const [a, topics] = await Promise.all([repo.getAuthorities(), repo.getTopics()]);
  const ids = new Set(topics.map((t) => t.id));
  assert.ok(a.length > 100);
  for (const x of a) {
    assert.ok(x.topics.length && x.topics.every((t) => ids.has(t)), x.authority_id);
    assert.equal(x.source_id, "SRC_KNESSET_ODATA_POSITIONS");
    assert.ok(x.source_record_ids.length >= 1);
  }
});

test("outcomes: a 2025 KPI lists the holders of that period, newest first", async () => {
  const cmp = await repo.getComparison({ mode: "outcomes", partyIds: [], topicIds: ["personal_security"] });
  const k = cmp.topics[0].rows.flatMap((r) => r.kpis).find((x) => x.kpi.kpi_id === "homicide_victims");
  const names = k.authorities.map((x) => x.holder_name);
  assert.ok(names.includes("איתמר בן גביר"));
  assert.ok(names.includes("בנימין נתניהו"));
  for (let i = 1; i < k.authorities.length; i++) assert.ok(k.authorities[i - 1].start >= k.authorities[i].start);
  assert.ok(k.authorities.every((x) => x.topics.includes("personal_security")));
});

test("people: current Knesset members carry their mapped party", async () => {
  const people = await repo.getPeople();
  const current = people.filter((p) => p.in_current_knesset);
  assert.ok(current.length >= 120);
  const mapped = current.filter((p) => p.entity_ids.length);
  assert.ok(mapped.length / current.length > 0.95);
});
