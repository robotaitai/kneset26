// Derives authorities, people and their sources from seed/knesset/snapshot.json.
// Pure function, used by build-data.mjs.
//
// Authorities: one record per continuous term of one person in one office.
// The Knesset splits a term into several rows at Knesset/government
// transitions; rows are merged only when one ends on the day the next starts.
// Party affiliation is the person's faction membership on the first day of
// the term, as recorded by the Knesset. Nothing here says the holder caused
// any outcome.

const SRC = {
  positions: "SRC_KNESSET_ODATA_POSITIONS",
  persons: "SRC_KNESSET_ODATA_PERSONS",
  factions: "SRC_KNESSET_ODATA_FACTIONS",
};
const ODATA = "https://knesset.gov.il/Odata/ParliamentInfo.svc/";
const TABLE = { positions: "KNS_PersonToPosition", persons: "KNS_Person", factions: "KNS_Faction" };
const TITLE = {
  positions: "תפקידי חברי כנסת ושרים (KNS_PersonToPosition)",
  persons: "רשימת אישים (KNS_Person)",
  factions: "סיעות הכנסת (KNS_Faction)",
};

const day = (s) => (s ? s.slice(0, 10) : null);
const clean = (s) => (s || "").replace(/\s+/g, " ").trim();

export function deriveKnesset(snap, cfg) {
  const name = new Map(snap.persons.map((p) => [p.PersonID, clean(`${p.FirstName} ${p.LastName}`)]));
  const factionName = new Map(snap.factions.map((f) => [f.Id, clean(f.Name)]));
  const factionK = new Map(snap.factions.map((f) => [f.Id, f.KnessetNum]));
  const entityFor = (factionId) => cfg.factions_k25[factionId] || null;

  const membershipsOf = new Map();
  for (const m of snap.memberships) {
    if (!membershipsOf.has(m.PersonID)) membershipsOf.set(m.PersonID, []);
    membershipsOf.get(m.PersonID).push(m);
  }
  const factionAt = (personId, date) => {
    const ms = membershipsOf.get(personId) || [];
    return ms.find((m) => day(m.StartDate) <= date && (!m.FinishDate || day(m.FinishDate) >= date)) || null;
  };

  const topicsFor = (r) => {
    if (cfg.position_roles[r.PositionID] === "head_of_government") return cfg.head_of_government_topics;
    const m = cfg.ministry_topics.find((x) => x.match.includes(clean(r.GovMinistryName)));
    return m ? m.topics : [];
  };

  // Merge contiguous rows of the same person, office and role.
  const keyOf = (r) => [r.PersonID, clean(r.GovMinistryName), cfg.position_roles[r.PositionID], /ממלא מקום/.test(r.DutyDesc)].join("|");
  const rows = [...snap.positions].sort((a, b) => keyOf(a).localeCompare(keyOf(b)) || a.StartDate.localeCompare(b.StartDate));
  const terms = [];
  for (const r of rows) {
    const last = terms.at(-1);
    if (last && last.key === keyOf(r) && last.end && day(last.end) === day(r.StartDate)) {
      last.end = r.FinishDate || null;
      last.rows.push(r);
      continue;
    }
    terms.push({ key: keyOf(r), start: r.StartDate, end: r.FinishDate || null, rows: [r] });
  }

  const authorities = terms.map((t) => {
    const first = t.rows[0];
    const last = t.rows.at(-1);
    const role = cfg.position_roles[first.PositionID];
    const start = day(t.start);
    const fm = factionAt(first.PersonID, start);
    const govs = [...new Set(t.rows.map((r) => r.GovernmentNum).filter(Boolean))];
    return {
      authority_id: `AU_KNS_${first.PersonToPositionID}`,
      role,
      acting: /ממלא מקום/.test(first.DutyDesc),
      office: role === "head_of_government" ? "prime_minister" : clean(first.GovMinistryName),
      office_label: role === "head_of_government" ? "ראש הממשלה" : clean(first.GovMinistryName),
      duty: clean(last.DutyDesc) || null,
      topics: topicsFor(first),
      holder_name: name.get(first.PersonID) || first.PersonID,
      person_id: `P_KNS_${first.PersonID}`,
      entity_id: fm ? entityFor(fm.FactionID) : null,
      faction_name: fm ? factionName.get(fm.FactionID) || clean(fm.FactionName) : null,
      government: govs.length ? `ממשלה ${govs.join("–")}` : null,
      start,
      end: day(t.end),
      source_id: SRC.positions,
      source_record_ids: t.rows.map((r) => r.PersonToPositionID),
    };
  }).filter((a) => a.topics.length)
    .sort((a, b) => a.start.localeCompare(b.start) || a.authority_id.localeCompare(b.authority_id));

  // People: everyone in the current Knesset, plus every authority holder.
  const ids = new Set([
    ...snap.memberships.filter((m) => m.KnessetNum === cfg.people_knesset).map((m) => m.PersonID),
    ...authorities.map((a) => a.person_id.replace("P_KNS_", "")),
  ]);
  const genders = new Map(snap.persons.map((p) => [p.PersonID, p.GenderDesc]));
  const people = [...ids].sort((a, b) => Number(a) - Number(b)).map((pid) => {
    const ms = (membershipsOf.get(pid) || [])
      .sort((a, b) => a.StartDate.localeCompare(b.StartDate))
      .map((m) => ({
        faction_name: factionName.get(m.FactionID) || clean(m.FactionName),
        knesset: factionK.get(m.FactionID) || m.KnessetNum,
        entity_id: entityFor(m.FactionID),
        start: day(m.StartDate),
        end: day(m.FinishDate),
      }));
    const current = ms.filter((m) => m.knesset === cfg.people_knesset);
    return {
      person_id: `P_KNS_${pid}`,
      name: name.get(pid) || pid,
      gender: genders.get(pid) || null,
      knesset_person_id: pid,
      in_current_knesset: current.length > 0,
      entity_ids: [...new Set(current.map((m) => m.entity_id).filter(Boolean))],
      memberships: ms,
      source_id: SRC.persons,
      source_ids: [SRC.persons, SRC.positions, SRC.factions],
    };
  });

  const sources = Object.entries(SRC).map(([k, id]) => ({
    source_id: id,
    publisher: "הכנסת – מאגר המידע הפתוח (OData)",
    title: TITLE[k],
    url: ODATA + TABLE[k],
    source_type: "official_primary",
    topic: "entities",
    source_date: snap.retrieved_at,
    retrieved_at: snap.retrieved_at,
    notes: `נשלף מהמראה הציבורית של הסדנא לידע ציבורי (knesset-data-pipelines): ${snap.files[k].url} · sha256 ${snap.files[k].sha256.slice(0, 12)} · ${snap.files[k].rows} שורות בטבלה המלאה. הערכים הועתקו ללא שינוי.`,
  }));

  return { authorities, people, sources };
}
