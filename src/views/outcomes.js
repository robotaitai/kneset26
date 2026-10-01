import { h, ltr, orMissing, sourceTag, evidenceButton, pagedList, fmtNumber, fmtMetric, empty } from "../ui/dom.js";
import { topicChips, updateChipCounts, searchControl } from "../ui/filters.js";
import { STATE, PERIOD_TYPES, RELATIONSHIP, UNITS } from "../ui/labels.js";
import { barChart } from "../ui/chart.js";

export const title = "מה קרה בפועל";

export async function mount(root, { repo, params, setParams, isCurrent }) {
  const [topics, allSeries] = await Promise.all([repo.getTopics(), repo.getMetricSeries()]);
  if (!isCurrent()) return;
  const topicLabel = new Map(topics.map((t) => [t.id, t.label]));
  const f = { topic: params.topic, q: params.q, series: params.series };

  const counts = new Map();
  for (const s of allSeries.items) counts.set(s.topic, (counts.get(s.topic) || 0) + 1);
  const chips = topicChips(topics, { selected: f.topic, counts, onChange: (v) => update({ topic: v, series: undefined }) });
  const search = searchControl({ value: f.q, placeholder: "חיפוש מדד...", onChange: (v) => update({ q: v }) });
  const list = h("div", { class: "series-list" });
  const detail = h("section", { class: "series-detail", "aria-live": "polite" });

  root.append(
    h("header", { class: "view-head" },
      h("h2", null, title),
      h("p", { class: "view-sub" }, "מדדים ציבוריים רשמיים, בנפרד מהבטחות פוליטיות. לכל מדד מוצגים תקופת המדידה והמקור. "),
      h("p", { class: "principle-line" }, "שינוי במדד ציבורי בתקופת כהונתו של פוליטיקאי אינו, כשלעצמו, ראיה לכך שהפוליטיקאי גרם לשינוי.")),
    h("div", { class: "filters" }, chips, h("div", { class: "filter-row" }, search)),
    h("div", { class: "outcomes" }, h("aside", { class: "series-aside" }, list), detail),
  );

  function update(patch) {
    Object.assign(f, patch);
    setParams({ topic: f.topic, q: f.q, series: f.series });
    if ("topic" in patch || "q" in patch) refreshList();
    if ("series" in patch) refreshDetail();
  }

  async function refreshList() {
    const { items } = await repo.getMetricSeries({ q: f.q });
    const c = new Map();
    for (const s of items) c.set(s.topic, (c.get(s.topic) || 0) + 1);
    updateChipCounts(chips, c);
    const total = await pagedList(list,
      (offset, limit) => repo.getMetricSeries({ topic: f.topic, q: f.q, offset, limit }),
      (s) => seriesItem(s),
      { size: 40, emptyText: `${STATE.missing} עבור הסינון הנוכחי.` });
    if (!f.series || !(await repo.getSeries(f.series)) || (f.topic && (await repo.getSeries(f.series)).topic !== f.topic)) {
      const first = (await repo.getMetricSeries({ topic: f.topic, q: f.q, limit: 1 })).items[0];
      f.series = first?.series_id;
      setParams({ topic: f.topic, q: f.q, series: f.series });
    }
    markSelected();
    if (total) await refreshDetail();
    else detail.replaceChildren();
  }

  async function seriesItem(s) {
    const obs = await repo.getObservations(s.series_id);
    const last = obs[obs.length - 1];
    const v = fmtMetric(last.value, s.unit);
    return h("button", {
      type: "button", class: "series-item", dataset: { series: s.series_id },
      onclick: () => { update({ series: s.series_id }); markSelected(); if (matchMedia("(max-width: 900px)").matches) detail.scrollIntoView({ behavior: "smooth" }); },
    },
    h("span", { class: "si-name", dir: "ltr" }, s.metric_name),
    h("span", { class: "si-meta" },
      s.geographies.length > 1
        ? h("span", { class: "si-val" }, `${s.geographies.length} גאוגרפיות`)
        : h("span", { class: "si-val" }, ltr(v.num), v.unit ? " " + v.unit : ""),
      " · ", ltr(last.period, "mono"),
      obs.length > 1 ? h("span", { class: "si-n" }, `${obs.length} תצפיות`) : null));
  }

  function markSelected() {
    list.querySelectorAll(".series-item").forEach((b) => b.setAttribute("aria-current", String(b.dataset.series === f.series)));
  }

  async function refreshDetail() {
    if (!f.series) return detail.replaceChildren(empty(STATE.missing));
    const s = await repo.getSeries(f.series);
    if (!s) return detail.replaceChildren(empty(STATE.missing));
    const [obs, attributions, sources] = await Promise.all([
      repo.getObservations(s.series_id),
      repo.getAttributionsForSeries(s.series_id),
      Promise.all(s.source_ids.map((id) => repo.getSource(id))),
    ]);
    if (!isCurrent()) return;
    detail.replaceChildren(seriesDetail(s, obs, attributions, sources.filter(Boolean), topicLabel));
  }

  await refreshList();
}

function seriesDetail(s, obs, attributions, sources, topicLabel) {
  const last = obs[obs.length - 1];
  const v = fmtMetric(last.value, s.unit);
  const geos = new Set(obs.map((o) => o.geography));
  const periods = new Set(obs.map((o) => o.period));
  const multiGeo = geos.size > 1 && periods.size === 1;

  let chart = null;
  if (obs.length > 1) {
    chart = h("figure", { class: "chart" },
      barChart(obs.map((o) => ({
        label: multiGeo ? o.geography : o.period,
        value: o.value,
        display: fmtMetric(o.value, s.unit).num,
      })), { horizontal: multiGeo }),
      h("figcaption", null, multiGeo ? `לפי גאוגרפיה · ${last.period}` : `${obs[0].period} עד ${last.period} · ${obs.length} תצפיות`,
        " · ", UNITS[s.unit] || s.unit));
  }

  return h("div", null,
    h("div", { class: "sd-kicker" }, topicLabel.get(s.topic) || s.topic, " · ", ltr(s.series_id, "mono dim")),
    h("h3", { class: "sd-title", dir: "ltr" }, s.metric_name),
    h("div", { class: "sd-headline" },
      multiGeo
        ? h("div", { class: "sd-value sd-value-multi" }, `${geos.size} גאוגרפיות`, h("span", { class: "sd-unit" }, "ראו פירוט"))
        : h("div", { class: "sd-value" }, ltr(v.num), v.unit ? h("span", { class: "sd-unit" }, v.unit) : null),
      h("dl", { class: "sd-period" },
        h("dt", null, "תקופת מדידה"), h("dd", null, ltr(last.period, "mono"), h("span", { class: "dim" }, " · ", PERIOD_TYPES[last.period_type] || last.period_type)),
        h("dt", null, "גאוגרפיה"), h("dd", null, multiGeo ? [...geos].join(", ") : orMissing(last.geography)),
        h("dt", null, "אוכלוסייה"), h("dd", null, orMissing(s.population)))),
    sources.map((src) => h("div", { class: "sd-source" },
      sourceTag(src),
      h("div", null,
        h("a", { href: src.url, target: "_blank", rel: "noopener noreferrer" }, src.title, " ↗"),
        h("div", { class: "dim" }, src.publisher, " · תאריך מקור: ", orMissing(src.source_date, (d) => ltr(d)), " · נשלף: ", ltr(src.retrieved_at))),
      evidenceButton("source", src.source_id, "פרטי מקור"))),
    last.note ? h("p", { class: "sd-note", dir: "ltr" }, last.note) : null,
    chart,
    h("table", { class: "obs" },
      h("thead", null, h("tr", null, ["תקופה", "גאוגרפיה", "אוכלוסייה", "ערך", "אומת", ""].map((t) => h("th", null, t)))),
      h("tbody", null, [...obs].reverse().map((o) => h("tr", null,
        h("td", null, ltr(o.period, "mono")),
        h("td", { dir: "auto" }, orMissing(o.geography)),
        h("td", { dir: "auto" }, orMissing(o.population)),
        h("td", { class: "num" }, ltr(fmtMetric(o.value, s.unit).num)),
        h("td", null, ltr(o.verified_at, "mono dim")),
        h("td", null, evidenceButton("metric", o.metric_id)))))),
    h("section", { class: "causal" + (attributions.length ? "" : " none") },
      h("h4", null, "ייחוס / קשר סיבתי"),
      attributions.length
        ? attributions.map((a) => h("div", { class: "linked-item" },
            h("b", null, RELATIONSHIP[a.relationship] || a.relationship), " · ", a.explanation, " ", evidenceButton("action", a.action_id, "פעולה")))
        : h("p", null, STATE.causalUnknownLong + ". לא תועד קשר בין פעולה ממשלתית כלשהי לבין מדד זה.")),
  );
}
