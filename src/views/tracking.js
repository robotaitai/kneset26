import { h, ltr, sourceTag, evidenceButton, pagedList, fmtNumber, fmtAmountNis, isMissing } from "../ui/dom.js";
import { topicChips, updateChipCounts, selectControl } from "../ui/filters.js";
import { STATE, STATUS, ACTION_TYPES, OUTCOME_LINK, RELATIONSHIP } from "../ui/labels.js";

export const title = "פעולות וקשרים";

const STAGE_ORDER = ["proposed", "target", "approved", "budgeted", "implemented"];

export async function mount(root, { repo, params, setParams, isCurrent }) {
  const [topics, parties, allCommitments, allActions, linkCount, attributionCount] = await Promise.all([
    repo.getTopics(), repo.getParties(), repo.getCommitments({ limit: 0 }), repo.getActions({ limit: 0 }),
    repo.getLinkCount(), repo.getAttributionCount(),
  ]);
  if (!isCurrent()) return;
  const topicLabel = new Map(topics.map((t) => [t.id, t.label]));
  const partyName = new Map(parties.map((p) => [p.entity_id, p.name]));
  const f = { by: params.by === "action" ? "action" : "commitment", topic: params.topic, entityId: params.entity, stage: params.stage };
  const ctx = { repo, topicLabel, partyName };

  const modeTabs = h("div", { class: "seg", role: "tablist" },
    seg("commitment", `לפי התחייבות (${fmtNumber(allCommitments.total)})`),
    seg("action", `לפי פעולה (${fmtNumber(allActions.total)})`));
  const chips = topicChips(topics, { selected: f.topic, counts: new Map(), onChange: (v) => update({ topic: v }) });
  const entity = selectControl({
    label: "מפלגה / גוף",
    value: f.entityId,
    options: [{ value: "", label: "כל הגופים" }, ...parties.map((p) => ({ value: p.entity_id, label: p.name }))],
    onChange: (v) => update({ entityId: v }),
  });
  const stage = selectControl({
    label: "שלב מתועד",
    value: f.stage,
    options: [{ value: "", label: "כל השלבים" }, ...STAGE_ORDER.map((s) => ({ value: s, label: STATUS[s].label }))],
    onChange: (v) => update({ stage: v }),
  });
  const results = h("div", { class: "results" });

  root.append(
    h("header", { class: "view-head" },
      h("h2", null, title),
      h("p", { class: "view-sub" }, "התחייבות, פעולה ומדד מחוברים כאן רק כאשר קיים קשר מפורש ומתועד במקור. אין צימוד אוטומטי לפי תחום משותף.")),
    h("div", { class: "tally" },
      tally(allCommitments.total, "התחייבויות מתועדות"),
      tally(allActions.total, "פעולות מתועדות"),
      tally(linkCount, "קשרים מתועדים בין התחייבות לפעולה"),
      tally(attributionCount, "ייחוסים מתועדים בין פעולה למדד")),
    legend(),
    h("div", { class: "filters" }, modeTabs, chips, h("div", { class: "filter-row" }, entity, stage)),
    results,
  );

  function seg(id, label) {
    return h("button", {
      type: "button", role: "tab", class: "seg-btn", "aria-selected": String(f.by === id),
      onclick: (e) => {
        modeTabs.querySelectorAll(".seg-btn").forEach((b) => b.setAttribute("aria-selected", String(b === e.currentTarget)));
        update({ by: id });
      },
    }, label);
  }

  function update(patch) {
    Object.assign(f, patch);
    setParams({ by: f.by === "action" ? "action" : undefined, topic: f.topic, entity: f.entityId, stage: f.stage });
    refresh();
  }

  async function refresh() {
    entity.hidden = f.by !== "commitment";
    stage.hidden = f.by !== "action";
    if (f.by === "commitment") {
      updateChipCounts(chips, (await repo.getCommitmentFacets({ entityId: f.entityId })).byTopic);
      await pagedList(results,
        (offset, limit) => repo.getCommitments({ topic: f.topic, entityId: f.entityId, offset, limit }),
        (c) => chain(c, ctx),
        { size: 15, emptyText: `${STATE.missing} עבור הסינון הנוכחי.` });
    } else {
      const { items } = await repo.getActions({ stage: f.stage });
      const counts = new Map();
      for (const a of items) counts.set(a.topic, (counts.get(a.topic) || 0) + 1);
      updateChipCounts(chips, counts);
      await pagedList(results,
        (offset, limit) => repo.getActions({ topic: f.topic, stage: f.stage, offset, limit }),
        (a) => actionCard(a, ctx),
        { size: 15, emptyText: `${STATE.missing}: אין פעולות מתועדות בסינון זה בגרסה הנוכחית.` });
    }
  }

  await refresh();
}

// Commitment -> action -> outcome. Stages are joined by a connector only
// when an explicit, sourced link exists; otherwise they stand apart.
async function chain(c, { repo, topicLabel, partyName }) {
  const links = await repo.getLinksForCommitment(c.commitment_id);
  const actions = (await Promise.all(links.map((l) => repo.getAction(l.action_id)))).filter(Boolean);
  const attributions = (await Promise.all(actions.map((a) => repo.getAttributionsForAction(a.action_id)))).flat();
  const linked = actions.length > 0;
  const attributed = attributions.length > 0;
  const source = await repo.getSource(c.source_id);

  return h("article", { class: "chain" + (linked ? " linked" : "") },
    h("div", { class: "chain-who" },
      h("span", { class: "rec-who" }, partyName.get(c.entity_id) || c.entity_name),
      h("span", { class: "rec-topic" }, topicLabel.get(c.topic) || c.topic)),
    h("div", { class: "chain-stages" },
      stageBox("התחייבות", [
        h("p", { class: "rec-text" }, c.commitment),
        h("div", { class: "badges" }, statusBadge("documented_commitment"), evidenceButton("commitment", c.commitment_id)),
      ]),
      connector(linked),
      linked
        ? stageBox("פעולה מתועדת", actions.map((a) => h("div", { class: "linked-item" },
            h("p", null, a.description),
            h("div", { class: "badges" }, statusBadge(a.stage), verifyBadge(a), evidenceButton("action", a.action_id)),
            links.filter((l) => l.action_id === a.action_id).map((l) => h("div", { class: "rel" }, RELATIONSHIP[l.relationship] || l.relationship, ": ", l.explanation)))))
        : stageBox("פעולה מתועדת", h("p", { class: "missing" }, STATE.noLink + " בין ההתחייבות לפעולת ממשלה"), true),
      connector(attributed),
      attributed
        ? stageBox("מדד / תוצאה", attributions.map((at) => h("div", { class: "linked-item" },
            h("div", { class: "rel" }, RELATIONSHIP[at.relationship] || at.relationship),
            h("p", null, at.explanation),
            evidenceButton("metric", at.metric_id, "מדד"))))
        : stageBox("מדד / תוצאה", h("p", { class: "missing" }, STATE.causalUnknown), true),
    ),
    h("footer", { class: "chain-foot" },
      h("span", null, h("b", null, "ייחוס: "), attributed ? `${attributions.length} ייחוסים מתועדים` : STATE.causalUnknownLong),
      h("span", { class: "chain-src" }, h("b", null, "מקור: "), source ? [sourceTag(source), " ", source.publisher] : STATE.missing,
        source?.source_date ? [" · ", ltr(source.source_date)] : null)),
  );
}

async function actionCard(a, { repo, topicLabel }) {
  const [links, attributions, source] = await Promise.all([
    repo.getLinksForAction(a.action_id), repo.getAttributionsForAction(a.action_id), repo.getSource(a.source_id),
  ]);
  const commitments = (await Promise.all(links.map((l) => repo.getCommitment(l.commitment_id)))).filter(Boolean);
  return h("article", { class: "rec rec-action" },
    h("header", { class: "rec-head" },
      h("span", { class: "rec-who" }, ACTION_TYPES[a.action_type] || a.action_type),
      h("span", { class: "rec-topic" }, topicLabel.get(a.topic) || a.topic, " · ", ltr(a.date, "mono"))),
    h("div", { class: "rec-actor" }, a.actor_scope),
    isMissing(a.amount_nis) ? null : h("div", { class: "rec-amount" }, fmtAmountNis(a.amount_nis)),
    h("p", { class: "rec-text rec-text-ltr", dir: "ltr" }, a.description),
    stageTrack(a.stage),
    h("dl", { class: "rec-facts" },
      h("div", { class: "fact-row" }, h("dt", null, "סטטוס במקור"), h("dd", null, ltr(a.status.replace(/_/g, " "), "mono"))),
      h("div", { class: "fact-row" }, h("dt", null, "ביצוע"), h("dd", null, a.implementation_verified ? "אומת" : h("span", { class: "missing" }, STATE.implUnknown))),
      h("div", { class: "fact-row" }, h("dt", null, "תוצאה"), h("dd", null,
        attributions.length ? `${attributions.length} ייחוסים מתועדים` : h("span", { class: "missing" }, STATE.causalUnknown),
        OUTCOME_LINK[a.outcome_link] ? h("div", { class: "dim" }, OUTCOME_LINK[a.outcome_link]) : null)),
      h("div", { class: "fact-row" }, h("dt", null, "קשר להתחייבות"), h("dd", null,
        commitments.length ? commitments.map((c) => h("div", null, c.commitment)) : h("span", { class: "missing" }, STATE.noLink))),
      h("div", { class: "fact-row" }, h("dt", null, "מקור"), h("dd", null, source
        ? h("button", { type: "button", class: "src-link", dataset: { evidenceKind: "source", evidenceId: a.source_id } }, sourceTag(source), " ", source.publisher, " · ", source.title)
        : h("span", { class: "missing" }, STATE.missing)))),
    h("footer", { class: "rec-foot" }, evidenceButton("action", a.action_id)),
  );
}

// Shows which single stage the source documents. Other stages are not
// claimed as passed or failed.
function stageTrack(stage) {
  return h("ol", { class: "stage-track", "aria-label": "שלב מתועד" },
    STAGE_ORDER.map((s) => h("li", { class: s === stage ? "on" : "", "aria-current": s === stage ? "step" : null, title: STATUS[s].hint }, STATUS[s].label)),
    h("li", { class: "outcome", title: STATUS.outcome_unverified.hint }, STATUS.outcome_unverified.label));
}

function statusBadge(key) {
  const s = STATUS[key] || { label: key };
  return h("span", { class: "status status-" + key, title: s.hint }, s.label);
}

function verifyBadge(a) {
  return a.implementation_verified ? null : h("span", { class: "status status-unknown" }, STATE.implUnknown);
}

function stageBox(label, content, missing = false) {
  return h("section", { class: "stage" + (missing ? " stage-missing" : "") }, h("h4", null, label), content);
}

function connector(on) {
  return on
    ? h("div", { class: "conn on", "aria-label": "קשר מתועד" }, h("span", null, "↓"))
    : h("div", { class: "conn off", "aria-hidden": "true" });
}

function tally(n, label) {
  return h("div", { class: "tally-item" + (n === 0 ? " zero" : "") }, h("b", null, fmtNumber(n)), h("span", null, label));
}

function legend() {
  const keys = ["documented_commitment", ...STAGE_ORDER, "outcome_unverified"];
  return h("details", { class: "legend" },
    h("summary", null, "מקרא סטטוסים"),
    h("dl", null, keys.map((k) => h("div", null, h("dt", null, statusBadge(k)), h("dd", null, STATUS[k].hint)))));
}
