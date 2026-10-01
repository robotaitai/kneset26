#!/usr/bin/env node
// Imports official Knesset records (OData tables KNS_Person,
// KNS_PersonToPosition, KNS_Faction) into seed/knesset/snapshot.json.
//
// The tables are read from the public mirror maintained by Hasadna
// (knesset-data-pipelines), which republishes the Knesset OData service as
// CSV. Values are copied unchanged; this script only selects rows.
//
// Usage: node scripts/import-knesset.mjs [--refresh]
//   Raw CSVs are cached in .cache/knesset/ (git-ignored). --refresh
//   downloads them again. Downloads use curl so the system proxy applies.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = resolve(ROOT, ".cache/knesset");
const OUT = resolve(ROOT, "seed/knesset/snapshot.json");
const cfg = JSON.parse(readFileSync(resolve(ROOT, "config/knesset_import.json"), "utf8"));
const refresh = process.argv.includes("--refresh");

mkdirSync(CACHE, { recursive: true });
const files = {};
const tables = {};
for (const [name, path] of Object.entries(cfg.tables)) {
  const url = `${cfg.mirror_base}/${path}`;
  const local = resolve(CACHE, name + ".csv");
  if (refresh || !existsSync(local)) {
    console.log(`download ${url}`);
    execFileSync("curl", ["-sSfL", "--retry", "3", "-o", local, url]);
  }
  const raw = readFileSync(local);
  tables[name] = parseCsv(raw.toString("utf8").replace(/^﻿/, ""));
  files[name] = { url, sha256: createHash("sha256").update(raw).digest("hex"), rows: tables[name].length };
}

const day = (s) => (s ? s.slice(0, 10) : null);
const ministryMatches = (name) => cfg.ministry_topics.some((m) => m.match.includes((name || "").trim()));

// 1. Executive positions relevant to comparison topics, active since the cutoff.
const positions = tables.positions.filter((r) => {
  const role = cfg.position_roles[r.PositionID];
  if (!role) return false;
  if (r.FinishDate && day(r.FinishDate) < cfg.authority_since) return false;
  return role === "head_of_government" || ministryMatches(r.GovMinistryName);
});

// 2. Faction memberships: everyone in the current Knesset, plus the full
//    membership history of every position holder above (to resolve their
//    party at the time of appointment).
const holders = new Set(positions.map((r) => r.PersonID));
const memberships = tables.positions.filter((r) =>
  cfg.faction_member_positions.includes(r.PositionID) && r.FactionID &&
  (r.KnessetNum === cfg.people_knesset || holders.has(r.PersonID)));

const personIds = new Set([...positions, ...memberships].map((r) => r.PersonID));
const persons = tables.persons.filter((p) => personIds.has(p.PersonID));
const factionIds = new Set(memberships.map((r) => r.FactionID));
const factions = tables.factions.filter((f) => factionIds.has(f.Id));

const pick = (r, keys) => Object.fromEntries(keys.map((k) => [k, r[k] ?? ""]));
const POS_KEYS = ["PersonToPositionID", "PersonID", "PositionID", "KnessetNum", "GovMinistryID", "GovMinistryName", "DutyDesc", "FactionID", "FactionName", "GovernmentNum", "StartDate", "FinishDate", "IsCurrent"];
const byId = (k) => (a, b) => Number(a[k]) - Number(b[k]);

const snapshot = {
  source: "Knesset OData (ParliamentInfo.svc) via the Hasadna knesset-data-pipelines public mirror",
  retrieved_at: new Date().toISOString().slice(0, 10),
  files,
  persons: persons.map((p) => pick(p, ["PersonID", "FirstName", "LastName", "GenderDesc", "IsCurrent"])).sort(byId("PersonID")),
  factions: factions.map((f) => pick(f, ["Id", "Name", "KnessetNum", "StartDate", "FinishDate", "IsCurrent"])).sort(byId("Id")),
  positions: positions.map((r) => pick(r, POS_KEYS)).sort(byId("PersonToPositionID")),
  memberships: memberships.map((r) => pick(r, POS_KEYS)).sort(byId("PersonToPositionID")),
};
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(snapshot, null, 1) + "\n");
console.log(`import-knesset ok -> seed/knesset/snapshot.json`);
console.log(`  positions ${snapshot.positions.length}, memberships ${snapshot.memberships.length}, persons ${snapshot.persons.length}, factions ${snapshot.factions.length}`);

// Minimal RFC 4180 parser (quoted fields, doubled quotes, newlines in quotes).
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
}
