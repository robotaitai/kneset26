import { h, ltr, orMissing, sourceTag, evidenceButton, pagedList, fmtNumber } from "../ui/dom.js";
import { topicChips, updateChipCounts, selectControl, searchControl } from "../ui/filters.js";
import { STATE, STATUS } from "../ui/labels.js";

export const title = "מה מבטיחים עכשיו";

export async function mount(root, { repo, params, setParams, isCurrent }) {
  const [topics, parties, people] = await Promise.all([repo.getTopics(), repo.getParties(), repo.getPeople()]);
  if (!isCurrent()) return;
  const topicLabel = new Map(topics.map((t) => [t.id, t.label]));
  const partyName = new Map(parties.map((p) => [p.entity_id, p.name]));
  const f = { topic: params.topic, entityId: params.entity, personId: params.person, q: params.q };

  const chips = topicChips(topics, { selected: f.topic, counts: new Map(), onChange: (v) => update({ topic: v }) });
  const entity = selectControl({
    label: "מפלגה / גוף",
    value: f.entityId,
    options: [{ value: "", label: "כל הגופים" }, ...parties.map((p) => ({ value: p.entity_id, label: p.name }))],
    onChange: (v) => update({ entityId: v }),
  });
  const person = selectControl({
    label: "אדם",
    value: f.personId,
    disabled: people.length === 0,
    options: people.length
      ? [{ value: "", label: "כל האנשים" }, ...people.map((p) => ({ value: p.person_id, label: p.name }))]
      : [{ value: "", label: STATE.missing }],
    onChange: (v) => update({ personId: v }),
  });
  const search = searchControl({ value: f.q, onChange: (v) => update({ q: v }) });
  const summary = h("p", { class: "result-summary", "aria-live": "polite" });
  const results = h("div", { class: "results" });

  root.append(
    h("header", { class: "view-head" },
      h("h2", null, title),
      h("p", { class: "view-sub" }, "התחייבויות מתועדות ממקורות שבשליטת המפלגות. התחייבות היא הצהרת כוונה בלבד: היא אינה ראיה לביצוע או לתוצאה.")),
    h("div", { class: "filters" }, chips, h("div", { class: "filter-row" }, entity, person, search)),
    summary,
    results,
  );

  function update(patch) {
    Object.assign(f, patch);
    setParams({ topic: f.topic, entity: f.entityId, person: f.personId, q: f.q });
    refresh();
  }

  async function refresh() {
    const facets = await repo.getCommitmentFacets(f);
    updateChipCounts(chips, facets.byTopic);
    entity.querySelectorAll("option").forEach((o) => {
      if (!o.value) return;
      const n = facets.byEntity.get(o.value) || 0;
      o.textContent = `${partyName.get(o.value)} (${n ? fmtNumber(n) : "אין"})`;
    });
    const total = await pagedList(
      results,
      (offset, limit) => repo.getCommitments({ ...f, offset, limit }),
      (c) => card(c, repo, topicLabel, partyName),
      { emptyText: emptyText() },
    );
    summary.textContent = total ? `${fmtNumber(total)} התחייבויות מתועדות` : "";
  }

  function emptyText() {
    if (f.entityId && !f.topic && !f.q) return `${STATE.missing}: לא נאספו התחייבויות עבור ${partyName.get(f.entityId)} בגרסה זו של המאגר.`;
    return `${STATE.missing} עבור הסינון הנוכחי.`;
  }

  await refresh();
}

async function card(c, repo, topicLabel, partyName) {
  const source = await repo.getSource(c.source_id);
  return h("article", { class: "rec rec-commitment" },
    h("header", { class: "rec-head" },
      h("span", { class: "rec-who" }, partyName.get(c.entity_id) || c.entity_name || STATE.missing),
      h("span", { class: "rec-topic" }, topicLabel.get(c.topic) || c.topic)),
    h("p", { class: "rec-text" }, c.commitment),
    h("dl", { class: "rec-facts" },
      fact("יעד כמותי", orMissing(c.target)),
      fact("לוח זמנים", orMissing(c.timeframe)),
      fact("מקור", source
        ? h("button", { type: "button", class: "src-link", dataset: { evidenceKind: "source", evidenceId: c.source_id } }, sourceTag(source), " ", source.publisher, " · ", source.title)
        : orMissing(null)),
      fact("תאריך המקור", orMissing(source?.source_date, (d) => ltr(d))),
      fact("תאריך אימות", orMissing(c.verified_at, (d) => ltr(d)))),
    h("footer", { class: "rec-foot" },
      h("span", { class: "status status-commitment", title: STATUS.documented_commitment.hint }, STATUS.documented_commitment.label),
      h("span", { class: "status status-unknown" }, STATE.implUnknown),
      evidenceButton("commitment", c.commitment_id)),
  );
}

function fact(label, value) {
  return h("div", { class: "fact-row" }, h("dt", null, label), h("dd", null, value));
}
