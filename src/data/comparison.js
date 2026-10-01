// Builds the comparison matrix from already-loaded collections.
// Pure functions only, so the same logic runs in the browser and in tests.
//
// Each cell keeps its evidence layers separate:
//   current   - commitments published for the current campaign
//   past      - commitments published for an earlier campaign
//   actions   - actions explicitly linked to those commitments (via links)
//   outcome   - KPI observations (row level, never per party)
//   attribution - documented action->metric relationships (row level)
// Nothing is linked by topic proximity: a party's cell never shows an action
// unless a commitment_action_link record connects them.

export const MODES = ["now", "track", "outcomes"];

// Evidence statuses. These describe how far the documented evidence goes;
// they are not scores and carry no good/bad meaning.
export const STAGE_RANK = { proposed: 1, target: 2, approved: 3, budgeted: 4, implemented: 5 };

export function highestStage(actions) {
  let best = null;
  for (const a of actions) if (a?.stage && (!best || STAGE_RANK[a.stage] > STAGE_RANK[best])) best = a.stage;
  return best;
}

// Status of a "promised vs did" cell.
export function trackStatus({ past, links }) {
  if (!past.length && !links.length) return null;
  const stage = highestStage(links.map((l) => l.action));
  if (stage) return stage;
  return "not_verified";
}

const overlaps = (aStart, aEnd, bStart, bEnd) =>
  (!bEnd || !aStart || String(aStart) <= String(bEnd)) && (!aEnd || !bStart || String(bStart) <= String(aEnd));

// Normalizes YYYY / YYYY-MM / YYYY-MM-DD to comparable YYYY-MM bounds.
const monthStart = (d) => (d ? (d.length === 4 ? d + "-01" : d.slice(0, 7)) : null);
const monthEnd = (d) => (d ? (d.length === 4 ? d + "-12" : d.slice(0, 7)) : null);

export function authoritiesFor(authorities, topic, start, end) {
  return authorities
    .filter((a) => (a.topics || []).includes(topic) && overlaps(monthStart(a.start), monthEnd(a.end), start, end))
    .sort((a, b) => String(b.start).localeCompare(String(a.start)) || (a.role === "head_of_government") - (b.role === "head_of_government"));
}

export function buildComparison(d, { mode = "now", partyIds = [], topicIds = [] } = {}) {
  const currentCampaign = d.meta?.current_campaign;
  const partyById = new Map(d.parties.map((p) => [p.entity_id, p]));
  const shortNames = d.compare?.short_names || {};
  const parties = partyIds.filter((id) => partyById.has(id)).map((id) => {
    const p = partyById.get(id);
    const all = d.commitments.filter((c) => c.entity_id === id);
    return {
      ...p,
      short_name: shortNames[id] || p.name,
      current_count: all.filter((c) => c.campaign === currentCampaign).length,
      past_count: all.filter((c) => c.campaign !== currentCampaign).length,
    };
  });

  const actionById = new Map(d.actions.map((a) => [a.action_id, a]));
  const linksByCommitment = new Map();
  for (const l of d.links) {
    if (!linksByCommitment.has(l.commitment_id)) linksByCommitment.set(l.commitment_id, []);
    linksByCommitment.get(l.commitment_id).push({ ...l, action: actionById.get(l.action_id) || null });
  }
  const seriesById = new Map(d.series.map((s) => [s.series_id, s]));
  const obsBySeries = new Map();
  for (const o of d.metrics) {
    if (!obsBySeries.has(o.series_id)) obsBySeries.set(o.series_id, []);
    obsBySeries.get(o.series_id).push(o);
  }
  for (const list of obsBySeries.values()) {
    list.sort((a, b) => String(a.period_end).localeCompare(String(b.period_end)) || String(a.geography).localeCompare(String(b.geography)));
  }
  const attribByMetric = new Map();
  for (const a of d.attributions) {
    if (!attribByMetric.has(a.metric_id)) attribByMetric.set(a.metric_id, []);
    attribByMetric.get(a.metric_id).push(a);
  }

  const selectedTopics = topicIds.length ? new Set(topicIds) : null;
  const topics = d.topics
    .filter((t) => (selectedTopics ? selectedTopics.has(t.id) : true))
    .map((t) => {
      const rows = d.subtopics
        .filter((s) => s.topic === t.id)
        .sort((a, b) => a.order - b.order)
        .map((s) => buildRow(s, t));
      return { topic: t, rows };
    });

  function buildRow(subtopic, topic) {
    const id = subtopic.subtopic_id;
    const inRow = (r) => (r.subtopic_ids || []).includes(id);
    const rowCommitments = d.commitments.filter(inRow);
    const cells = {};
    for (const p of parties) {
      const mine = rowCommitments.filter((c) => c.entity_id === p.entity_id);
      const current = mine.filter((c) => c.campaign === currentCampaign);
      const past = mine.filter((c) => c.campaign !== currentCampaign);
      const links = past.flatMap((c) => linksByCommitment.get(c.commitment_id) || []);
      const currentLinks = current.flatMap((c) => linksByCommitment.get(c.commitment_id) || []);
      cells[p.entity_id] = {
        party_id: p.entity_id,
        subtopic_id: id,
        current,
        past,
        links,
        current_links: currentLinks,
        track_status: trackStatus({ past, links }),
      };
    }
    const kpis = d.kpis
      .filter((k) => k.subtopic === id)
      .map((k) => kpiBlock(k, topic));
    return {
      subtopic,
      cells,
      // Actions documented in this row. Shown at row level because the seed
      // does not attribute them to any party.
      actions: d.actions.filter(inRow).sort((a, b) => String(b.date).localeCompare(String(a.date))),
      kpis,
      // Which selected parties have a current commitment in this row. Context
      // only: it says nothing about the metric.
      promisers: parties.filter((p) => cells[p.entity_id].current.length).map((p) => p.entity_id),
      has_data: {
        now: parties.some((p) => cells[p.entity_id].current.length),
        track: parties.some((p) => cells[p.entity_id].past.length || cells[p.entity_id].links.length) || d.actions.some(inRow),
        outcomes: kpis.length > 0,
      },
    };
  }

  function kpiBlock(k, topic) {
    const series = k.series_ids.map((sid) => ({ series: seriesById.get(sid), observations: obsBySeries.get(sid) || [] }));
    const obs = series.flatMap((s) => s.observations);
    const start = obs.map((o) => o.period_start).filter(Boolean).sort()[0] || null;
    const end = obs.map((o) => o.period_end).filter(Boolean).sort().at(-1) || null;
    return {
      kpi: k,
      series,
      observations: obs,
      period: { start, end },
      authorities: authoritiesFor(d.authorities, topic.id, start, end),
      attributions: obs.flatMap((o) => attribByMetric.get(o.metric_id) || []),
    };
  }

  return { mode, parties, topics };
}
