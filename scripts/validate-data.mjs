#!/usr/bin/env node
// Validates data/*.json. Exits 1 on any error.
// Usage: node scripts/validate-data.mjs [data-dir]

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { COLLECTIONS, DATE_RE, parsePeriod, ACTION_STAGE_BY_STATUS } from "./schema.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = resolve(process.argv[2] || resolve(ROOT, "data"));

const errors = [];
const warnings = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);
const warn = (where, msg) => warnings.push(`${where}: ${msg}`);
const isEmpty = (v) => v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);

// Load every collection.
const data = {};
for (const name of Object.keys(COLLECTIONS)) {
  const file = resolve(DIR, name + ".json");
  if (!existsSync(file)) { err(name, `missing file ${name}.json`); data[name] = []; continue; }
  try {
    data[name] = JSON.parse(readFileSync(file, "utf8"));
    if (!Array.isArray(data[name])) { err(name, "must be a JSON array"); data[name] = []; }
  } catch (e) {
    err(name, `invalid JSON (${e.message})`);
    data[name] = [];
  }
}

// Unique IDs, per collection and globally across record collections.
const ids = {};
const globalIds = new Map();
for (const [name, schema] of Object.entries(COLLECTIONS)) {
  ids[name] = new Set();
  data[name].forEach((rec, i) => {
    const id = rec[schema.id];
    const where = `${name}[${i}]`;
    if (isEmpty(id)) return err(where, `missing id field "${schema.id}"`);
    if (ids[name].has(id)) err(`${name}/${id}`, "duplicate id");
    ids[name].add(id);
    if (name === "topics") return;
    if (globalIds.has(id) && globalIds.get(id) !== name) err(`${name}/${id}`, `id also used in ${globalIds.get(id)}`);
    globalIds.set(id, name);
  });
}

// Per-record checks.
for (const [name, schema] of Object.entries(COLLECTIONS)) {
  for (const rec of data[name]) {
    const where = `${name}/${rec[schema.id] ?? "?"}`;
    for (const f of schema.required || []) {
      if (!(f in rec)) err(where, `missing required field "${f}"`);
      else if (isEmpty(rec[f]) && !Array.isArray(rec[f])) err(where, `required field "${f}" is empty`);
    }
    for (const f of schema.nonEmptyArrays || []) {
      if (!Array.isArray(rec[f]) || rec[f].length === 0) err(where, `"${f}" must be a non-empty array`);
    }
    for (const f of schema.dates || []) {
      if (!isEmpty(rec[f]) && !(typeof rec[f] === "string" && DATE_RE.test(rec[f]) && validDate(rec[f])))
        err(where, `"${f}" is not YYYY, YYYY-MM or YYYY-MM-DD: ${JSON.stringify(rec[f])}`);
    }
    for (const f of schema.numbers || []) {
      if (!isEmpty(rec[f]) && !(typeof rec[f] === "number" && Number.isFinite(rec[f])))
        err(where, `"${f}" must be a finite number: ${JSON.stringify(rec[f])}`);
    }
    for (const f of schema.periods || []) {
      if (!parsePeriod(rec[f])) err(where, `unrecognized period ${JSON.stringify(rec[f])}`);
    }
    for (const f of schema.urls || []) {
      if (!isEmpty(rec[f]) && !validUrl(rec[f])) err(where, `"${f}" is not a valid http(s) URL: ${rec[f]}`);
    }
    for (const [f, allowed] of Object.entries(schema.enums || {})) {
      if (!isEmpty(rec[f]) && !allowed.includes(rec[f])) err(where, `"${f}" must be one of ${allowed.join(", ")}; got "${rec[f]}"`);
    }
    for (const [f, target] of Object.entries(schema.refs || {})) {
      if (isEmpty(rec[f])) continue;
      for (const v of [].concat(rec[f])) {
        if (!ids[target].has(v)) err(where, `"${f}" points to missing ${target} record "${v}"`);
      }
    }
  }
}

// Cross-record consistency.
for (const a of data.actions) {
  if (a.status && ACTION_STAGE_BY_STATUS[a.status] && ACTION_STAGE_BY_STATUS[a.status] !== a.stage)
    err(`actions/${a.action_id}`, `stage "${a.stage}" does not match status "${a.status}"`);
}
for (const s of data.metric_series) {
  const obs = data.metrics.filter((m) => m.series_id === s.series_id);
  if (!obs.length) err(`metric_series/${s.series_id}`, "series has no observations");
  if (s.observation_count !== undefined && s.observation_count !== obs.length)
    err(`metric_series/${s.series_id}`, `observation_count ${s.observation_count} != ${obs.length}`);
  const seen = new Set();
  for (const o of obs) {
    const k = o.period + "|" + (o.geography || "");
    if (seen.has(k)) err(`metrics/${o.metric_id}`, `duplicate observation for ${s.series_id} at ${k}`);
    seen.add(k);
  }
}
for (const m of data.metrics) {
  const p = parsePeriod(m.period);
  if (p && (m.period_start !== p.start || m.period_end !== p.end))
    err(`metrics/${m.metric_id}`, "period_start/period_end do not match period");
}
for (const c of data.commitments) {
  const party = data.parties.find((p) => p.entity_id === c.entity_id);
  if (party && c.entity_name && !party.name.startsWith(c.entity_name))
    warn(`commitments/${c.commitment_id}`, `entity_name "${c.entity_name}" differs from party name "${party.name}"`);
}
// Comparison rows: every placement must stay inside the record's own topic.
const subtopicTopic = new Map(data.subtopics.map((s) => [s.subtopic_id, s.topic]));
const checkRows = (name, rec, idField, ids) => {
  for (const id of [].concat(ids || [])) {
    const t = subtopicTopic.get(id);
    if (t && t !== rec.topic) err(`${name}/${rec[idField]}`, `row "${id}" belongs to topic "${t}", record topic is "${rec.topic}"`);
  }
};
for (const c of data.commitments) {
  checkRows("commitments", c, "commitment_id", c.subtopic_ids);
  if (isEmpty(c.subtopic_ids)) warn(`commitments/${c.commitment_id}`, "not placed in any comparison row");
}
for (const a of data.actions) {
  checkRows("actions", a, "action_id", a.subtopic_ids);
  if (isEmpty(a.subtopic_ids)) warn(`actions/${a.action_id}`, "not placed in any comparison row");
}
for (const k of data.kpis) {
  checkRows("kpis", k, "kpi_id", k.subtopic);
  for (const sid of k.series_ids || []) {
    const s = data.metric_series.find((x) => x.series_id === sid);
    if (s && s.kpi_id !== k.kpi_id) err(`kpis/${k.kpi_id}`, `series "${sid}" says it belongs to KPI "${s.kpi_id}"`);
    if (s && s.unit !== k.unit) err(`kpis/${k.kpi_id}`, `unit "${k.unit}" differs from series "${sid}" unit "${s.unit}"`);
  }
}
for (const a of data.authorities) {
  if (a.start && a.end && String(a.end) < String(a.start)) err(`authorities/${a.authority_id}`, `end ${a.end} is before start ${a.start}`);
}

// Presentation config must point at real parties.
const compareFile = resolve(DIR, "compare.json");
if (existsSync(compareFile)) {
  const cfg = JSON.parse(readFileSync(compareFile, "utf8"));
  for (const id of [...(cfg.default_parties || []), ...Object.keys(cfg.short_names || {})])
    if (!ids.parties.has(id)) err("compare", `unknown party "${id}"`);
} else err("compare", "missing file compare.json");

for (const s of data.sources) {
  if (isEmpty(s.source_date)) warn(`sources/${s.source_id}`, "no source_date");
}
const cited = new Set(
  ["parties", "people", "commitments", "actions", "metrics", "authorities"].flatMap((n) => data[n].map((r) => r.source_id))
    .concat(["commitment_action_links", "attributions"].flatMap((n) => data[n].flatMap((r) => r.source_ids || []))),
);
for (const s of data.sources) if (!cited.has(s.source_id)) warn(`sources/${s.source_id}`, "not cited by any record");

// Report.
const count = (n) => `${n} ${data[n].length}`;
console.log(`data:validate ${DIR}`);
console.log("  " + Object.keys(COLLECTIONS).map(count).join(", "));
if (warnings.length) {
  console.log(`  ${warnings.length} warning(s):`);
  for (const w of warnings) console.log("    warn: " + w);
}
if (errors.length) {
  for (const e of errors) console.error("    error: " + e);
  console.error(`data:validate FAILED with ${errors.length} error(s)`);
  process.exit(1);
}
console.log("data:validate ok");

function validUrl(s) {
  try {
    const u = new URL(s);
    return (u.protocol === "https:" || u.protocol === "http:") && u.hostname.includes(".");
  } catch {
    return false;
  }
}

function validDate(s) {
  const [y, m, d] = s.split("-").map(Number);
  if (m !== undefined && (m < 1 || m > 12)) return false;
  if (d !== undefined) {
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  }
  return true;
}
