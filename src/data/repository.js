// Data-access layer. The UI talks only to this module.
//
// createRepository(load) takes a loader: (collectionName) => Promise<JSON>.
// Today the loader fetches data/<name>.json; it can be swapped for an API or
// database client without touching any view.
//
// Collections are loaded lazily on first use and indexed once. List methods
// return { items, total } and accept offset/limit so views can paginate.

import { buildComparison } from "./comparison.js";

export function fetchLoader(baseUrl = "data/") {
  return async (name) => {
    const res = await fetch(`${baseUrl}${name}.json`);
    if (!res.ok) throw new Error(`${name}.json: HTTP ${res.status}`);
    return res.json();
  };
}

// Lowercase, strip Hebrew niqqud/cantillation and quote marks so that
// "ש״ס", 'ש"ס' and "שס" match each other.
export function normalizeText(s) {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[֑-ׇ]/g, "")
    .replace(/["'׳״‘’“”]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const groupBy = (rows, key) => {
  const m = new Map();
  for (const r of rows) {
    for (const k of [].concat(r[key] ?? [])) {
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(r);
    }
  }
  return m;
};
const byId = (rows, key) => new Map(rows.map((r) => [r[key], r]));
const page = (rows, { offset = 0, limit = Infinity } = {}) => ({
  items: rows.slice(offset, offset + limit),
  total: rows.length,
});
const matchesQuery = (hay, q) => {
  const terms = normalizeText(q).split(" ").filter(Boolean);
  return terms.every((t) => hay.includes(t));
};

export function createRepository(load) {
  const cache = new Map();
  const get = (name) => {
    if (!cache.has(name)) cache.set(name, Promise.resolve(load(name)));
    return cache.get(name);
  };

  // Memoized index builders, each depending only on the collections it needs.
  const memo = new Map();
  const once = (key, fn) => {
    if (!memo.has(key)) memo.set(key, fn());
    return memo.get(key);
  };

  const sourcesIdx = () => once("sources", async () => byId(await get("sources"), "source_id"));
  const partiesIdx = () => once("parties", async () => byId(await get("parties"), "entity_id"));
  const topicsIdx = () => once("topics", async () => byId(await get("topics"), "id"));

  const commitmentsIdx = () =>
    once("commitments", async () => {
      const [rows, parties] = await Promise.all([get("commitments"), partiesIdx()]);
      const search = new Map(
        rows.map((c) => [
          c.commitment_id,
          normalizeText([c.commitment, c.target, c.timeframe, c.entity_name, parties.get(c.entity_id)?.name].join(" ")),
        ]),
      );
      return {
        rows,
        byId: byId(rows, "commitment_id"),
        byTopic: groupBy(rows, "topic"),
        byEntity: groupBy(rows, "entity_id"),
        byPerson: groupBy(rows, "person_ids"),
        search,
      };
    });

  const actionsIdx = () =>
    once("actions", async () => {
      const rows = [...(await get("actions"))].sort((a, b) => String(b.date).localeCompare(String(a.date)));
      const search = new Map(rows.map((a) => [a.action_id, normalizeText([a.description, a.actor_scope, a.action_type].join(" "))]));
      return { rows, byId: byId(rows, "action_id"), byTopic: groupBy(rows, "topic"), search };
    });

  const metricsIdx = () =>
    once("metrics", async () => {
      const [series, obs] = await Promise.all([get("metric_series"), get("metrics")]);
      const sortObs = (a, b) =>
        String(a.period_end).localeCompare(String(b.period_end)) ||
        String(a.period_start).localeCompare(String(b.period_start)) ||
        String(a.geography).localeCompare(String(b.geography));
      const bySeries = groupBy(obs, "series_id");
      for (const list of bySeries.values()) list.sort(sortObs);
      return {
        series,
        seriesById: byId(series, "series_id"),
        seriesByTopic: groupBy(series, "topic"),
        obsById: byId(obs, "metric_id"),
        bySeries,
        search: new Map(series.map((s) => [s.series_id, normalizeText([s.metric_name, s.population, ...(s.geographies || [])].join(" "))])),
      };
    });

  const linksIdx = () =>
    once("links", async () => {
      const rows = await get("commitment_action_links");
      return { byCommitment: groupBy(rows, "commitment_id"), byAction: groupBy(rows, "action_id"), rows };
    });

  const attributionsIdx = () =>
    once("attributions", async () => {
      const [rows, m] = await Promise.all([get("attributions"), metricsIdx()]);
      const withSeries = rows.map((a) => ({ ...a, series_id: m.obsById.get(a.metric_id)?.series_id ?? null }));
      return {
        rows: withSeries,
        byAction: groupBy(withSeries, "action_id"),
        byMetric: groupBy(withSeries, "metric_id"),
        bySeries: groupBy(withSeries, "series_id"),
      };
    });

  // Picks the smallest candidate set from the indexes, then filters the rest.
  const narrow = (rows, filters) => {
    let set = rows;
    for (const [key, map] of filters) {
      if (key === undefined || key === null || key === "") continue;
      const cand = map.get(key) || [];
      if (cand.length < set.length) set = cand;
    }
    return set;
  };

  const comparisonData = () =>
    once("comparison", async () => {
      const names = ["meta", "compare", "parties", "topics", "subtopics", "commitments", "actions", "commitment_action_links",
        "kpis", "metric_series", "metrics", "attributions", "authorities"];
      const v = await Promise.all(names.map(get));
      const d = Object.fromEntries(names.map((n, i) => [n, v[i]]));
      return { ...d, links: d.commitment_action_links, series: d.metric_series };
    });

  return {
    getMeta: () => get("meta"),
    getCompareConfig: () => get("compare"),
    getSubtopics: () => get("subtopics"),
    getKpis: () => get("kpis"),
    getAuthorities: () => get("authorities"),
    getActionsAll: () => get("actions"),

    // The comparison matrix. mode: now | track | outcomes.
    async getComparison(opts) {
      return buildComparison(await comparisonData(), opts);
    },

    getTopics: () => get("topics"),
    getTopic: async (id) => (await topicsIdx()).get(id) || null,
    getParties: () => get("parties"),
    getParty: async (id) => (await partiesIdx()).get(id) || null,
    getPeople: () => get("people"),
    getSources: () => get("sources"),
    getSource: async (id) => (await sourcesIdx()).get(id) || null,

    async getCommitments({ topic, entityId, personId, q, offset, limit } = {}) {
      const idx = await commitmentsIdx();
      const base = narrow(idx.rows, [[topic, idx.byTopic], [entityId, idx.byEntity], [personId, idx.byPerson]]);
      const rows = base.filter(
        (c) =>
          (!topic || c.topic === topic) &&
          (!entityId || c.entity_id === entityId) &&
          (!personId || (c.person_ids || []).includes(personId)) &&
          (!q || matchesQuery(idx.search.get(c.commitment_id), q)),
      );
      return page(rows, { offset, limit });
    },
    getCommitment: async (id) => (await commitmentsIdx()).byId.get(id) || null,

    // Counts per topic and per entity for the current filters, ignoring the
    // facet's own dimension so the user can see where else results exist.
    async getCommitmentFacets(filters = {}) {
      const count = async (f, key) => {
        const { items } = await this.getCommitments(f);
        const m = new Map();
        for (const c of items) m.set(c[key], (m.get(c[key]) || 0) + 1);
        return m;
      };
      const [byTopic, byEntity] = await Promise.all([
        count({ ...filters, topic: undefined }, "topic"),
        count({ ...filters, entityId: undefined }, "entity_id"),
      ]);
      return { byTopic, byEntity };
    },

    async getActions({ topic, stage, q, offset, limit } = {}) {
      const idx = await actionsIdx();
      const base = narrow(idx.rows, [[topic, idx.byTopic]]);
      const rows = base.filter(
        (a) => (!topic || a.topic === topic) && (!stage || a.stage === stage) && (!q || matchesQuery(idx.search.get(a.action_id), q)),
      );
      return page(rows, { offset, limit });
    },
    getAction: async (id) => (await actionsIdx()).byId.get(id) || null,

    async getMetricSeries({ topic, q, offset, limit } = {}) {
      const idx = await metricsIdx();
      const base = topic ? idx.seriesByTopic.get(topic) || [] : idx.series;
      const rows = base.filter((s) => !q || matchesQuery(idx.search.get(s.series_id), q));
      return page(rows, { offset, limit });
    },
    getSeries: async (id) => (await metricsIdx()).seriesById.get(id) || null,
    getObservations: async (seriesId) => (await metricsIdx()).bySeries.get(seriesId) || [],
    getObservation: async (id) => (await metricsIdx()).obsById.get(id) || null,

    getLinksForCommitment: async (id) => (await linksIdx()).byCommitment.get(id) || [],
    getLinksForAction: async (id) => (await linksIdx()).byAction.get(id) || [],
    getLinkCount: async () => (await linksIdx()).rows.length,
    getAttributionCount: async () => (await attributionsIdx()).rows.length,
    getAttributionsForAction: async (id) => (await attributionsIdx()).byAction.get(id) || [],
    getAttributionsForMetric: async (id) => (await attributionsIdx()).byMetric.get(id) || [],
    getAttributionsForSeries: async (id) => (await attributionsIdx()).bySeries.get(id) || [],

    // Generic lookup used by the evidence panel.
    async getRecord(kind, id) {
      switch (kind) {
        case "commitment": return this.getCommitment(id);
        case "action": return this.getAction(id);
        case "metric": return this.getObservation(id);
        case "series": return this.getSeries(id);
        case "party": return this.getParty(id);
        case "source": return this.getSource(id);
        case "kpi": return (await get("kpis")).find((k) => k.kpi_id === id) || null;
        case "authority": return (await get("authorities")).find((a) => a.authority_id === id) || null;
        default: return null;
      }
    },

    async countCitations(sourceId) {
      const [c, a, m, p, au] = await Promise.all([get("commitments"), get("actions"), get("metrics"), get("parties"), get("authorities")]);
      const n = (rows) => rows.filter((r) => r.source_id === sourceId).length;
      return { commitments: n(c), actions: n(a), metrics: n(m), parties: n(p), authorities: n(au) };
    },
  };
}
