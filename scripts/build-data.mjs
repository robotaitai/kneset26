#!/usr/bin/env node
// Builds the normalized data/ files from the seed JSON.
// Usage: node scripts/build-data.mjs [path/to/election_audit_seed.json]
//
// Seed-derived files are overwritten on every run. Curated files
// (commitment_action_links, attributions) are never overwritten; they are
// created empty if missing. people and authorities are generated from
// seed/knesset/snapshot.json when it exists, and curated otherwise.
//
// Config-derived files (subtopics, kpis) come from config/*.json, and each
// commitment/action gets the comparison rows it belongs to from
// config/classification.json. Classification only places a record in a row;
// it never links records to each other.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { deriveKnesset } from "./knesset.mjs";
import { TOPICS, SUBTOPICS, ACTION_STAGE_BY_STATUS, parsePeriod, datePrecision, readConfig } from "./schema.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SEED = resolve(process.argv[2] || resolve(ROOT, "seed/election_audit_seed.json"));
const OUT = resolve(ROOT, "data");

const errors = [];
const fail = (msg) => errors.push(msg);

const raw = readFileSync(SEED);
const seed = JSON.parse(raw);
for (const key of ["metadata", "parties", "commitments", "actions", "metrics", "sources"]) {
  if (!(key in seed)) fail(`seed is missing "${key}"`);
}
if (errors.length) done();

const topicIds = new Set(TOPICS.map((t) => t.id));
const classification = readConfig("classification");
const subtopicById = new Map(SUBTOPICS.map((s) => [s.subtopic_id, s]));
// Returns the row ids for a record, checking each row belongs to the record's topic.
const classify = (kind, rec, idField) => {
  const entry = classification[kind][rec[idField]];
  if (!entry) { fail(`${rec[idField]}: not classified (add it to config/classification.json "${kind}")`); return { subtopics: [] }; }
  for (const id of entry.subtopics || []) {
    const st = subtopicById.get(id);
    if (!st) fail(`${rec[idField]}: unknown subtopic "${id}" in config/classification.json`);
    else if (st.topic !== rec.topic) fail(`${rec[idField]}: subtopic "${id}" belongs to "${st.topic}", record topic is "${rec.topic}"`);
  }
  return entry;
};
for (const kind of ["commitments", "actions"]) {
  const known = new Set(seed[kind].map((r) => r[kind === "commitments" ? "commitment_id" : "action_id"]));
  for (const id of Object.keys(classification[kind])) if (!known.has(id)) fail(`config/classification.json: ${kind} "${id}" is not in the seed`);
}
const checkTopic = (rec, idField) => {
  if (!topicIds.has(rec.topic)) fail(`${rec[idField]}: unknown topic "${rec.topic}" (add it to scripts/schema.mjs)`);
};

// Entities and sources pass through unchanged.
const parties = seed.parties.map((p) => ({ ...p }));
const sources = seed.sources.map((s) => ({ ...s }));

// Official Knesset records (ministers, MKs, factions), imported by
// scripts/import-knesset.mjs. Without a snapshot, authorities and people
// stay as curated files.
const KNESSET_SNAPSHOT = resolve(ROOT, "seed/knesset/snapshot.json");
const knesset = existsSync(KNESSET_SNAPSHOT)
  ? deriveKnesset(JSON.parse(readFileSync(KNESSET_SNAPSHOT, "utf8")), readConfig("knesset_import"))
  : null;
if (knesset) {
  for (const s of knesset.sources) {
    if (sources.some((x) => x.source_id === s.source_id)) fail(`source ${s.source_id} defined twice`);
    sources.push(s);
  }
}

const commitments = seed.commitments.map((c) => {
  checkTopic(c, "commitment_id");
  const cls = classify("commitments", c, "commitment_id");
  return { ...c, person_ids: c.person_ids || [], subtopic_ids: cls.subtopics || [], campaign: c.campaign ?? cls.campaign ?? null };
});

const actions = seed.actions.map((a) => {
  checkTopic(a, "action_id");
  const stage = ACTION_STAGE_BY_STATUS[a.status];
  if (!stage) fail(`${a.action_id}: no stage mapping for status "${a.status}" (add it to scripts/schema.mjs)`);
  const cls = classify("actions", a, "action_id");
  return {
    ...a,
    subtopic_ids: cls.subtopics || [],
    date_precision: datePrecision(a.date),
    stage: stage || null,
    implementation_verified: stage === "implemented",
    outcome_verified: false,
  };
});

// Metrics: split each flat seed row into a series (what is measured) and an
// observation (one value for one period/geography). Series are keyed by
// name + unit + population so a single series can hold many periods.
const seriesByKey = new Map();
const metricSeries = [];
const metrics = seed.metrics.map((m) => {
  checkTopic(m, "metric_id");
  const key = [m.metric_name, m.unit, m.population || ""].join("|");
  let s = seriesByKey.get(key);
  if (!s) {
    s = {
      series_id: seriesId(m),
      topic: m.topic,
      metric_name: m.metric_name,
      unit: m.unit,
      population: m.population ?? null,
    };
    if (metricSeries.some((x) => x.series_id === s.series_id)) fail(`series id collision: ${s.series_id}`);
    seriesByKey.set(key, s);
    metricSeries.push(s);
  } else if (s.topic !== m.topic) {
    fail(`${m.metric_id}: series "${s.series_id}" has mixed topics (${s.topic}, ${m.topic})`);
  }
  const p = parsePeriod(m.period);
  if (!p) fail(`${m.metric_id}: unrecognized period "${m.period}"`);
  return {
    metric_id: m.metric_id,
    series_id: s.series_id,
    period: m.period,
    period_type: p?.type ?? null,
    period_start: p?.start ?? null,
    period_end: p?.end ?? null,
    value: m.value,
    geography: m.geography ?? null,
    population: m.population ?? null,
    note: m.note ?? null,
    source_id: m.source_id,
    verified_at: m.verified_at,
  };
});

for (const s of metricSeries) {
  const obs = metrics.filter((o) => o.series_id === s.series_id);
  s.observation_count = obs.length;
  s.geographies = [...new Set(obs.map((o) => o.geography).filter(Boolean))];
  s.source_ids = [...new Set(obs.map((o) => o.source_id))];
  const ends = obs.map((o) => o.period_end).filter(Boolean).sort();
  s.latest_period_end = ends.at(-1) || null;
}

// No-silent-discard check: every seed field must survive with the same value.
assertPreserved("parties", seed.parties, parties, "entity_id");
assertPreserved("sources", seed.sources, sources, "source_id");
assertPreserved("commitments", seed.commitments, commitments, "commitment_id");
assertPreserved("actions", seed.actions, actions, "action_id");
const seriesById = new Map(metricSeries.map((s) => [s.series_id, s]));
assertPreserved("metrics", seed.metrics,
  metrics.map((o) => ({ ...seriesById.get(o.series_id), ...o })), "metric_id");

// KPI definitions: one per series, each placed in a row of its own topic.
const kpis = readConfig("kpis").kpis;
const seriesInKpi = new Map();
for (const k of kpis) {
  const st = subtopicById.get(k.subtopic);
  if (!st) fail(`kpi ${k.kpi_id}: unknown subtopic "${k.subtopic}"`);
  else if (st.topic !== k.topic) fail(`kpi ${k.kpi_id}: subtopic "${k.subtopic}" is not in topic "${k.topic}"`);
  for (const sid of k.series_ids) {
    const s = metricSeries.find((x) => x.series_id === sid);
    if (!s) { fail(`kpi ${k.kpi_id}: unknown series "${sid}"`); continue; }
    if (s.unit !== k.unit) fail(`kpi ${k.kpi_id}: unit "${k.unit}" differs from series unit "${s.unit}"`);
    if (seriesInKpi.has(sid)) fail(`series ${sid} is in two KPIs (${seriesInKpi.get(sid)}, ${k.kpi_id})`);
    seriesInKpi.set(sid, k.kpi_id);
  }
}
for (const s of metricSeries) {
  if (!seriesInKpi.has(s.series_id)) fail(`series ${s.series_id} has no KPI definition (add it to config/kpis.json)`);
  s.kpi_id = seriesInKpi.get(s.series_id) ?? null;
}

if (errors.length) done();

mkdirSync(OUT, { recursive: true });
const counts = {
  parties: parties.length,
  people: knesset ? knesset.people.length : 0,
  commitments: commitments.length,
  actions: actions.length,
  metric_series: metricSeries.length,
  metrics: metrics.length,
  sources: sources.length,
  subtopics: SUBTOPICS.length,
  kpis: kpis.length,
};

write("topics", TOPICS);
write("subtopics", SUBTOPICS);
write("kpis", kpis);
write("compare", readConfig("compare"));
write("parties", parties);
write("commitments", commitments);
write("actions", actions);
write("metric_series", metricSeries);
write("metrics", metrics);
write("sources", sources);
if (knesset) {
  write("people", knesset.people);
  write("authorities", knesset.authorities);
}
for (const curated of ["people", "commitment_action_links", "attributions", "authorities"]) {
  if (knesset && (curated === "people" || curated === "authorities")) { counts[curated] = knesset[curated].length; continue; }
  const p = resolve(OUT, curated + ".json");
  if (!existsSync(p)) write(curated, []);
  counts[curated] = JSON.parse(readFileSync(p, "utf8")).length;
}
write("meta", {
  ...seed.metadata,
  current_campaign: classification.current_campaign,
  campaigns: classification.campaigns,
  built_from: relative(ROOT, SEED),
  seed_sha256: createHash("sha256").update(raw).digest("hex"),
  counts,
});

console.log(`data:build ok -> ${relative(ROOT, OUT)}/`);
for (const [k, v] of Object.entries(counts)) console.log(`  ${k.padEnd(24)} ${v}`);

// ---------------------------------------------------------------------------

function write(name, value) {
  writeFileSync(resolve(OUT, name + ".json"), JSON.stringify(value, null, 2) + "\n");
}

function seriesId(m) {
  const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  return "S_" + slug(m.metric_name) + (m.population ? "__" + slug(m.population) : "");
}

function assertPreserved(name, seedRows, outRows, idField) {
  const byId = new Map(outRows.map((r) => [r[idField], r]));
  for (const row of seedRows) {
    const out = byId.get(row[idField]);
    if (!out) { fail(`${name}: record ${row[idField]} dropped`); continue; }
    for (const [k, v] of Object.entries(row)) {
      if (!(k in out)) fail(`${name}/${row[idField]}: field "${k}" dropped`);
      else if (JSON.stringify(out[k] ?? null) !== JSON.stringify(v ?? null)) fail(`${name}/${row[idField]}: field "${k}" changed`);
    }
  }
}

function done() {
  for (const e of errors) console.error("  error: " + e);
  console.error(`data:build failed with ${errors.length} error(s)`);
  process.exit(1);
}
