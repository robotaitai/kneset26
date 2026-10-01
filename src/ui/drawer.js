// Full evidence for one comparison cell, one row of actions, or one KPI.
// This is where detail lives; the matrix itself stays compact.

import { h, ltr, sourceTag, isMissing } from "./dom.js";
import { STATE, STATUS, EVIDENCE_STATUS, RELATIONSHIP, OUTCOME_LINK, ATTRIBUTION_STRENGTH, AUTHORITY_ROLES, UNITS } from "./labels.js";
import { fmtPeriod, fmtDate, fmtValue, fmtMoney, statusTag, actionTypeLabel, entityKind, geoLabel, obsSpan } from "./format.js";
import { barChart } from "./chart.js";

export const COMPOSITE_KINDS = new Set(["cell", "row-actions", "kpi"]);

export async function renderComposite(repo, kind, id) {
  if (kind === "cell") return cellEvidence(repo, ...id.split("|"));
  if (kind === "row-actions") return rowActionsEvidence(repo, id);
  if (kind === "kpi") return kpiEvidence(repo, id);
  return null;
}

async function context(repo, subtopicId, partyIds, mode) {
  const subtopics = await repo.getSubtopics();
  const subtopic = subtopics.find((s) => s.subtopic_id === subtopicId);
  if (!subtopic) return null;
  const [topic, meta, cmp, sources] = await Promise.all([
    repo.getTopic(subtopic.topic),
    repo.getMeta(),
    repo.getComparison({ mode, partyIds, topicIds: [subtopic.topic] }),
    repo.getSources(),
  ]);
  const row = cmp.topics[0].rows.find((r) => r.subtopic.subtopic_id === subtopicId);
  return { subtopic, topic, meta, cmp, row, sourceById: new Map(sources.map((s) => [s.source_id, s])) };
}

// ---------------------------------------------------------------------------
// One party x one row

async function cellEvidence(repo, mode, partyId, subtopicId) {
  const ctx = await context(repo, subtopicId, [partyId], mode);
  if (!ctx) return null;
  const { subtopic, topic, meta, row, sourceById } = ctx;
  const party = ctx.cmp.parties[0];
  const cell = row.cells[partyId];
  const campaigns = meta.campaigns || {};
  const linkedActions = [...cell.links, ...cell.current_links];
  const budget = linkedActions.reduce((sum, l) => sum + (l.action?.amount_nis || 0), 0);
  const usedSources = new Set();
  const use = (id) => { if (id) usedSources.add(id); return id; };

  const commitmentItem = (c) => {
    use(c.source_id);
    const src = sourceById.get(c.source_id);
    return h("li", { class: "dr-item" },
      h("p", { class: "dr-quote", dir: "auto" }, c.commitment),
      h("dl", { class: "dr-facts" },
        fact("יעד", c.target),
        fact("לוח זמנים", c.timeframe),
        fact("מערכת בחירות", campaigns[c.campaign]?.label || c.campaign),
        fact("גוף", party.name),
        fact("אנשים", c.person_ids?.length ? c.person_ids.join(", ") : null),
        fact("תאריך המקור", src?.source_date ? ltr(fmtDate(src.source_date)) : null),
        fact("אומת בתאריך", c.verified_at ? ltr(fmtDate(c.verified_at)) : null),
        fact("ציטוט מהמקור", c.source_excerpt || STATE.noExcerpt),
        fact("מקור", src ? srcLink(src) : null)),
      h("div", { class: "dr-item-foot" },
        statusTag("promise_documented"),
        h("button", { type: "button", class: "ev-btn", dataset: { evidenceKind: "commitment", evidenceId: c.commitment_id } }, "כל השדות")));
  };

  const actionItem = (l) => {
    const a = l.action;
    if (!a) return h("li", { class: "dr-item missing" }, `${l.action_id}: ${STATE.missing}`);
    use(a.source_id);
    (l.source_ids || []).forEach(use);
    return h("li", { class: "dr-item" },
      h("p", { class: "dr-quote", dir: "auto" }, sourceById.get(a.source_id)?.title || a.description),
      h("dl", { class: "dr-facts" },
        fact("סוג", actionTypeLabel(a.action_type)),
        fact("קשר להתחייבות", RELATIONSHIP[l.relationship] || l.relationship),
        fact("הסבר הקשר", l.explanation),
        fact("תאריך", ltr(fmtDate(a.date))),
        fact("סכום", a.amount_nis != null ? fmtMoney(a.amount_nis) : null),
        fact("שלב", statusTag(a.stage))),
      h("div", { class: "dr-item-foot" },
        h("button", { type: "button", class: "ev-btn", dataset: { evidenceKind: "action", evidenceId: a.action_id } }, "כל השדות")));
  };

  const status = mode === "track" ? cell.track_status : cell.current.length ? "promise_documented" : null;

  return h("div", { class: "drawer" },
    h("div", { class: "ev-kicker" }, `${topic.label} · ${subtopic.label}`),
    h("h2", { id: "ev-title" }, party.name),
    h("p", { class: "dr-sub" }, entityKind(party), " · ",
      h("a", { href: `#/party?id=${encodeURIComponent(partyId)}` }, "פרופיל המפלגה")),

    section("עמדה נוכחית", campaigns[meta.current_campaign]?.label,
      cell.current.length ? h("ul", { class: "dr-list" }, cell.current.map(commitmentItem)) : missing()),

    section("התחייבות קודמת", "ממערכות בחירות קודמות",
      cell.past.length ? h("ul", { class: "dr-list" }, cell.past.map(commitmentItem)) : missing()),

    section("פעולות מתועדות", "רק פעולות שמקושרות להתחייבות ברשומת קשר מתועדת",
      linkedActions.length ? h("ul", { class: "dr-list" }, linkedActions.map(actionItem)) : missing(STATE.noLinkedAction),
      !linkedActions.length && row.actions.length
        ? h("p", { class: "dr-note" },
            `בשורה זו מתועדות ${row.actions.length} פעולות ממשלה שהמקור אינו משייך למפלגה. `,
            h("button", { type: "button", class: "linkish", dataset: { evidenceKind: "row-actions", evidenceId: subtopicId } }, "הצגתן"))
        : null),

    section("תקציב", null, budget ? h("p", null, fmtMoney(budget), h("span", { class: "muted" }, " (סכום הפעולות המקושרות)")) : missing()),

    section("סטטוס ראיות", null,
      status ? h("p", null, statusTag(status), " ", h("span", { class: "muted" }, EVIDENCE_STATUS[status].hint)) : missing()),

    section("מדדים בנושא", "לצורך הקשר בלבד. לא נקבע קשר בין ההתחייבות לבין המדד.",
      row.kpis.length
        ? h("ul", { class: "dr-kpis" }, row.kpis.map((k) => kpiLine(k)))
        : missing(STATE.noKpi)),

    section("בעלי סמכות בתקופה", null, authorityList(row.kpis.flatMap((k) => k.authorities))),

    section("ייחוס", null, h("p", null, STATE.noCausal),
      h("p", { class: "dr-note" }, "המאגר אינו מייחס שינוי במדד להתחייבות או לפעולה ללא מקור שתומך בכך במפורש.")),

    section("מקורות", null, sourceList([...usedSources].map((id) => sourceById.get(id) || { source_id: id }))),
  );
}

// ---------------------------------------------------------------------------
// Documented actions in one row (not attributed to any party)

async function rowActionsEvidence(repo, subtopicId) {
  const ctx = await context(repo, subtopicId, [], "track");
  if (!ctx) return null;
  const { subtopic, topic, row, sourceById } = ctx;
  return h("div", { class: "drawer" },
    h("div", { class: "ev-kicker" }, `${topic.label} · ${subtopic.label}`),
    h("h2", { id: "ev-title" }, "פעולות ממשלה מתועדות"),
    h("p", { class: "dr-sub" }, STATE.notPartyAttributed, ". הפעולות מוצגות כאן כפי שתועדו, בלי לשייך אותן לעמדה של מפלגה כלשהי."),
    row.actions.length
      ? h("ul", { class: "dr-list" }, row.actions.map((a) => {
          const src = sourceById.get(a.source_id);
          return h("li", { class: "dr-item" },
            h("p", { class: "dr-quote", dir: "auto" }, src?.title || a.description),
            h("p", { class: "dr-desc", dir: "auto" }, a.description),
            h("dl", { class: "dr-facts" },
              fact("סוג", actionTypeLabel(a.action_type)),
              fact("גורם", a.actor_scope),
              fact("תאריך", ltr(fmtDate(a.date))),
              fact("סכום", a.amount_nis != null ? fmtMoney(a.amount_nis) : null),
              fact("שלב מתועד", h("span", null, statusTag(a.stage), " ", h("span", { class: "muted" }, STATUS[a.stage]?.hint || ""))),
              fact("ביצוע בשטח", a.implementation_verified ? "אומת" : STATE.implUnknown),
              fact("קשר לתוצאה", OUTCOME_LINK[a.outcome_link] || a.outcome_link),
              fact("חוזק התיעוד", ATTRIBUTION_STRENGTH[a.attribution_strength] || a.attribution_strength),
              fact("מקור", src ? srcLink(src) : null)),
            h("div", { class: "dr-item-foot" },
              h("button", { type: "button", class: "ev-btn", dataset: { evidenceKind: "action", evidenceId: a.action_id } }, "כל השדות")));
        }))
      : missing(),
    section("מקורות", null, sourceList([...new Set(row.actions.map((a) => a.source_id))].map((id) => sourceById.get(id) || { source_id: id }))),
  );
}

// ---------------------------------------------------------------------------
// One KPI

async function kpiEvidence(repo, kpiId) {
  const kpi = await repo.getRecord("kpi", kpiId);
  if (!kpi) return null;
  const parties = await repo.getParties();
  const ctx = await context(repo, kpi.subtopic, parties.map((p) => p.entity_id), "outcomes");
  const { subtopic, topic, row, sourceById, cmp } = ctx;
  const block = row.kpis.find((k) => k.kpi.kpi_id === kpiId);
  const obs = block.observations;
  const geos = new Set(obs.map((o) => o.geography));
  const chartable = obs.length >= 2 && geos.size === 1;
  const unit = UNITS[kpi.unit] || kpi.unit;

  return h("div", { class: "drawer" },
    h("div", { class: "ev-kicker" }, `${topic.label} · ${subtopic.label} · מדד`),
    h("h2", { id: "ev-title" }, kpi.label),
    h("p", { class: "dr-sub", dir: "ltr" }, kpi.label_en),

    section("הגדרת המדד", "אותה הגדרה לכל שחקן פוליטי",
      h("dl", { class: "dr-facts" },
        fact("מזהה", ltr(kpi.kpi_id, "mono")),
        fact("יחידה", unit),
        fact("אוכלוסייה", kpi.population),
        fact("מכנה מועדף", kpi.preferred_denominator),
        fact("מפרסם", kpi.source),
        fact("סדרות נתונים", ltr(kpi.series_ids.join(", "), "mono")))),

    section("תצפיות", null,
      chartable ? barChart(obs.map((o) => ({ label: fmtPeriod(o.period), value: o.value, display: fmtValue(o.value, kpi.unit) }))) : null,
      h("table", { class: "dr-table" },
        h("thead", null, h("tr", null, h("th", null, "תקופה"), h("th", null, "גאוגרפיה"), h("th", null, "ערך"), h("th", null, "מקור"))),
        h("tbody", null, obs.map((o) => h("tr", null,
          h("td", null, ltr(fmtPeriod(o.period))),
          h("td", null, geoLabel(o.geography) || "—"),
          h("td", { class: "num" }, h("button", { type: "button", class: "linkish", dataset: { evidenceKind: "metric", evidenceId: o.metric_id } }, fmtValue(o.value, kpi.unit))),
          h("td", null, sourceById.get(o.source_id)?.publisher || o.source_id)))))),

    section("בעלי סמכות בתקופה", obsSpan(obs) || null,
      authorityList(block.authorities)),

    section("ייחוס", null,
      block.attributions.length
        ? h("ul", { class: "dr-list" }, block.attributions.map((a) => h("li", { class: "dr-item" },
            h("p", null, RELATIONSHIP[a.relationship] || a.relationship),
            h("p", { class: "dr-desc", dir: "auto" }, a.explanation))))
        : h("p", null, STATE.noCausal)),

    section("מי מבטיח בנושא", "התחייבויות נוכחיות בשורה זו. הקשר בלבד, ללא קשר למדד.",
      row.promisers.length
        ? h("ul", { class: "dr-chips" }, row.promisers.map((pid) => {
            const p = cmp.parties.find((x) => x.entity_id === pid);
            return h("li", null, h("button", { type: "button", class: "chip-btn", dataset: { evidenceKind: "cell", evidenceId: `now|${pid}|${kpi.subtopic}` } }, p.short_name));
          }))
        : missing()),

    section("מקורות", null, sourceList([...new Set(obs.map((o) => o.source_id))].map((id) => sourceById.get(id) || { source_id: id }))),
  );
}

// ---------------------------------------------------------------------------

function section(title, sub, ...body) {
  return h("section", { class: "dr-sec" },
    h("h3", null, title, sub ? h("span", { class: "dr-sec-sub" }, sub) : null),
    body);
}

function fact(label, value) {
  if (isMissing(value)) return [h("dt", null, label), h("dd", { class: "missing" }, STATE.missing)];
  return [h("dt", null, label), h("dd", { dir: typeof value === "string" ? "auto" : null }, value)];
}

const missing = (text = STATE.missing) => h("p", { class: "missing" }, text);

function srcLink(src) {
  return h("button", { type: "button", class: "linkish", dataset: { evidenceKind: "source", evidenceId: src.source_id } },
    `${src.publisher} · ${src.title}`);
}

function kpiLine(k) {
  const last = k.observations.at(-1);
  return h("li", null,
    h("button", { type: "button", class: "linkish", dataset: { evidenceKind: "kpi", evidenceId: k.kpi.kpi_id } }, k.kpi.label),
    last ? h("span", { class: "muted" }, ` · ${fmtValue(last.value, k.kpi.unit)} (${fmtPeriod(last.period)})`) : null);
}

export function authorityList(list) {
  const uniq = [...new Map(list.map((a) => [a.authority_id, a])).values()];
  if (!uniq.length) return missing(STATE.noAuthority);
  return h("ul", { class: "dr-list" }, uniq.map((a) => h("li", { class: "dr-item" },
    h("p", null, h("strong", null, a.holder_name), ` · ${AUTHORITY_ROLES[a.role] || a.role}, ${a.office_label || a.office}`),
    h("p", { class: "muted" }, ltr(`${fmtDate(a.start)}–${a.end ? fmtDate(a.end) : "היום"}`), a.government ? ` · ${a.government}` : ""),
    h("button", { type: "button", class: "ev-btn", dataset: { evidenceKind: "authority", evidenceId: a.authority_id } }, "מקור"))));
}

function sourceList(sources) {
  if (!sources.length) return missing();
  return h("ul", { class: "dr-sources" }, sources.map((s) => h("li", null,
    h("div", null, sourceTag(s), " ", h("strong", null, s.publisher || s.source_id)),
    h("div", { dir: "auto" }, s.title || STATE.missing),
    h("div", { class: "muted" },
      s.source_date ? ["תאריך: ", ltr(fmtDate(s.source_date))] : "תאריך המקור: " + STATE.missing,
      " · ", STATE.noExcerpt),
    s.url ? h("a", { href: s.url, target: "_blank", rel: "noopener noreferrer", class: "ev-open" }, "פתיחת המקור ↗") : null)));
}
