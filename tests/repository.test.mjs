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
