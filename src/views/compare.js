// The comparison table: parties side by side, topic rows from the taxonomy
// config, three evidence modes. Cells stay compact; the drawer holds detail.

import { h, ltr, fmtNumber } from "../ui/dom.js";
import { STATE, MODES } from "../ui/labels.js";
import { fmtPeriod, fmtMoney, statusTag, actionTypeLabel, entityKind, yearOf, fmtDate, geoLabel, obsSpan, valueNode } from "../ui/format.js";

export const title = "השוואה";

const CELL_ITEMS = 2;

export async function mount(root, { repo, params, setParams, isCurrent }) {
  const [config, parties, topics, meta] = await Promise.all([
    repo.getCompareConfig(), repo.getParties(), repo.getTopics(), repo.getMeta(),
  ]);
  if (!isCurrent()) return;
  const partyIds = new Set(parties.map((p) => p.entity_id));
  const topicIds = new Set(topics.map((t) => t.id));
  const short = (id) => config.short_names?.[id] || parties.find((p) => p.entity_id === id)?.name || id;
  const list = (v) => (v ? String(v).split(",").filter(Boolean) : null);

  const state = {
    mode: MODES[params.mode] ? params.mode : "now",
    parties: (list(params.p) || config.default_parties).filter((id) => partyIds.has(id)),
    topics: (list(params.t) || []).filter((id) => topicIds.has(id)),
    dense: params.only === "1",
    collapsed: new Set(),
  };
  // Commitment counts per party, for the picker only (coverage, not a score).
  const coverage = new Map();
  for (const c of (await repo.getCommitments()).items) coverage.set(c.entity_id, (coverage.get(c.entity_id) || 0) + 1);

  const modeBar = h("div", { class: "modes", role: "tablist", "aria-label": "מצב השוואה" });
  const partyBar = h("div", { class: "picks", role: "group", "aria-label": "מפלגות להשוואה" });
  const topicBar = h("div", { class: "picks", role: "group", "aria-label": "תחומים" });
  const denseToggle = h("input", { type: "checkbox", checked: state.dense, onchange: () => update({ dense: denseToggle.checked }) });
  const note = h("p", { class: "mode-note" });
  const summary = h("p", { class: "cmp-summary", "aria-live": "polite" });
  const tableWrap = h("div", { class: "matrix-wrap", tabindex: "0", "aria-label": "טבלת השוואה" });

  // On narrow screens the pickers fold into one summary line so the table
  // gets the screen; on wide screens they start open.
  const filterSummary = h("span", { class: "fs-text" });
  const filters = h("details", { class: "cmp-filters", open: !matchMedia("(max-width: 720px)").matches },
    h("summary", null, h("span", { class: "fs-label" }, "בחירת מפלגות ותחומים"), filterSummary),
    h("div", { class: "ctl" }, h("span", { class: "ctl-label" }, "מפלגות"), partyBar),
    h("div", { class: "ctl" }, h("span", { class: "ctl-label" }, "תחומים"), topicBar));

  root.append(
    h("section", { class: "cmp-controls" },
      modeBar,
      filters,
      h("div", { class: "ctl ctl-foot" },
        note,
        h("label", { class: "toggle" }, denseToggle, " רק שורות עם מידע מתועד"))),
    summary,
    tableWrap,
  );

  function update(patch) {
    Object.assign(state, patch);
    setParams({
      mode: state.mode === "now" ? undefined : state.mode,
      p: state.parties.join(","),
      t: state.topics.join(",") || undefined,
      only: state.dense ? "1" : undefined,
    });
    render();
  }

  // ---- controls ---------------------------------------------------------

  function renderModes() {
    modeBar.replaceChildren(...Object.entries(MODES).map(([id, m], i) =>
      h("button", {
        type: "button", role: "tab", class: "mode", "aria-selected": String(state.mode === id),
        onclick: () => update({ mode: id }),
      }, h("span", { class: "mode-n mono" }, `0${i + 1}`), h("span", { class: "mode-l" }, m.label), h("span", { class: "mode-s" }, m.short))));
    note.textContent = MODES[state.mode].note;
  }

  function renderParties() {
    const move = (i, d) => {
      const next = [...state.parties];
      [next[i], next[i + d]] = [next[i + d], next[i]];
      update({ parties: next });
    };
    const chips = state.parties.map((id, i) => {
      const chip = h("span", { class: "pick on", draggable: "true", dataset: { id } },
        h("button", { type: "button", class: "pick-mv", "aria-label": `הזזת ${short(id)} ימינה`, disabled: i === 0, onclick: () => move(i, -1) }, "›"),
        h("span", { class: "pick-name" }, short(id)),
        h("button", { type: "button", class: "pick-mv", "aria-label": `הזזת ${short(id)} שמאלה`, disabled: i === state.parties.length - 1, onclick: () => move(i, 1) }, "‹"),
        h("button", { type: "button", class: "pick-x", "aria-label": `הסרת ${short(id)}`, onclick: () => update({ parties: state.parties.filter((x) => x !== id) }) }, "×"));
      chip.addEventListener("dragstart", (e) => { e.dataTransfer.setData("text/plain", id); chip.classList.add("dragging"); });
      chip.addEventListener("dragend", () => chip.classList.remove("dragging"));
      chip.addEventListener("dragover", (e) => e.preventDefault());
      chip.addEventListener("drop", (e) => {
        e.preventDefault();
        const from = e.dataTransfer.getData("text/plain");
        if (!from || from === id) return;
        const next = state.parties.filter((x) => x !== from);
        next.splice(next.indexOf(id), 0, from);
        update({ parties: next });
      });
      return chip;
    });
    const remaining = parties.filter((p) => !state.parties.includes(p.entity_id));
    const full = state.parties.length >= (config.max_parties || 8);
    const add = h("select", {
      class: "pick-add", "aria-label": "הוספת מפלגה", disabled: full || !remaining.length,
      onchange: () => { if (add.value) update({ parties: [...state.parties, add.value] }); },
    },
      h("option", { value: "" }, full ? `עד ${config.max_parties} מפלגות` : "+ הוספת מפלגה"),
      remaining.map((p) => h("option", { value: p.entity_id },
        `${short(p.entity_id)}${coverage.get(p.entity_id) ? "" : " (אין התחייבויות במאגר)"}`)));
    const reset = h("button", { type: "button", class: "pick-reset", onclick: () => update({ parties: [...config.default_parties] }) }, "ברירת מחדל");
    partyBar.replaceChildren(...chips, add, reset);
  }

  function renderTopics() {
    const all = !state.topics.length;
    const topicNames = all ? "כל התחומים" : state.topics.map((id) => topics.find((t) => t.id === id).label).join(", ");
    filterSummary.textContent = `${state.parties.map(short).join(", ") || "לא נבחרו מפלגות"} · ${topicNames}`;
    const toggle = (id) => {
      // From "all", picking a topic narrows to it; afterwards picks add/remove.
      if (all) return update({ topics: [id] });
      const next = state.topics.includes(id) ? state.topics.filter((x) => x !== id) : [...state.topics, id];
      update({ topics: next });
    };
    topicBar.replaceChildren(
      h("button", { type: "button", class: "pick" + (all ? " on" : ""), "aria-pressed": String(all), onclick: () => update({ topics: [] }) }, "כל התחומים"),
      ...topics.map((t) => {
        const on = state.topics.includes(t.id);
        return h("button", { type: "button", class: "pick" + (on ? " on" : ""), "aria-pressed": String(on), onclick: () => toggle(t.id) }, t.label);
      }));
  }

  // ---- table ------------------------------------------------------------

  let renderToken = 0;
  async function render() {
    renderModes();
    renderParties();
    renderTopics();
    const token = ++renderToken;
    const cmp = await repo.getComparison({ mode: state.mode, partyIds: state.parties, topicIds: state.topics });
    if (token !== renderToken || !isCurrent()) return;
    const scroll = [tableWrap.scrollLeft, tableWrap.scrollTop];
    tableWrap.replaceChildren(state.mode === "outcomes" ? outcomesTable(cmp) : partyTable(cmp));
    [tableWrap.scrollLeft, tableWrap.scrollTop] = scroll;
  }

  const visibleRows = (rows) => (state.dense ? rows.filter((r) => r.has_data[state.mode]) : rows);

  function topicHeader(t, rows, colspan) {
    const open = !state.collapsed.has(t.id);
    const withData = rows.filter((r) => r.has_data[state.mode]).length;
    return h("tr", { class: "topic-row" },
      h("th", { colspan, scope: "rowgroup" },
        h("button", {
          type: "button", class: "topic-btn", "aria-expanded": String(open),
          onclick: () => { open ? state.collapsed.add(t.id) : state.collapsed.delete(t.id); render(); },
        },
          h("span", { class: "caret", "aria-hidden": "true" }, open ? "▾" : "◂"),
          h("span", { class: "topic-name" }, t.label),
          h("span", { class: "topic-meta" }, `${withData} מתוך ${rows.length} שורות עם מידע מתועד`))));
  }

  function partyTable(cmp) {
    const track = state.mode === "track";
    const cols = cmp.parties.length + 1 + (track ? 1 : 0);
    let filled = 0, total = 0;
    const body = [];
    for (const { topic, rows } of cmp.topics) {
      const shown = visibleRows(rows).filter((r) => r.subtopic.core || r.has_data[state.mode]);
      if (!shown.length && state.dense) continue;
      body.push(h("tbody", { class: "topic-group" },
        topicHeader(topic, shown, cols),
        state.collapsed.has(topic.id) ? null : shown.map((r) => {
          const cells = cmp.parties.map((p) => {
            const c = r.cells[p.entity_id];
            const has = track ? c.past.length || c.links.length : c.current.length;
            total++;
            if (has) filled++;
            return h("td", { class: "cell-td" }, track ? trackCell(c, r) : nowCell(c));
          });
          return h("tr", null,
            h("th", { scope: "row", class: "row-label" },
              h("span", { class: "rl-main" }, r.subtopic.label),
              r.subtopic.core ? null : h("span", { class: "rl-ext", title: "שורה שנוספה כדי להציג רשומות מהמאגר שאינן מתאימות לשורות הליבה" }, "נוסף")),
            track ? h("td", { class: "cell-td gov-td" }, govCell(r)) : null,
            cells);
        })));
    }
    summary.replaceChildren(
      `${fmtNumber(cmp.parties.length)} מפלגות · ${fmtNumber(filled)} מתוך ${fmtNumber(total)} תאים עם מידע מתועד`,
      ...(track ? [h("span", { class: "muted" }, ` · התחייבויות ממערכות בחירות קודמות במאגר עבור המפלגות שנבחרו: ${fmtNumber(cmp.parties.reduce((n, p) => n + p.past_count, 0))}`)] : []));

    if (!cmp.parties.length) return h("div", { class: "empty" }, "בחרו לפחות מפלגה אחת להשוואה.");
    return h("table", { class: "matrix mode-" + state.mode, style: { "--cols": cmp.parties.length } },
      h("thead", null, h("tr", null,
        h("th", { class: "corner", scope: "col" }, "נושא"),
        track ? h("th", { scope: "col", class: "col-gov" },
          h("span", { class: "ph-name" }, "פעולות ממשלה מתועדות"),
          h("span", { class: "ph-sub" }, STATE.notPartyAttributed)) : null,
        cmp.parties.map((p) => h("th", { scope: "col", class: "col-party" },
          h("a", { class: "ph-name", href: `#/party?id=${encodeURIComponent(p.entity_id)}` }, p.short_name),
          h("span", { class: "ph-sub" }, entityKind(p)),
          (track ? p.past_count : p.current_count) ? null
            : h("span", { class: "ph-gap" }, track ? "אין במאגר התחייבויות קודמות" : "אין במאגר עמדות מתועדות"))))),
      body);
  }

  function nowCell(c) {
    if (!c.current.length) return missingCell();
    const items = c.current.slice(0, CELL_ITEMS);
    const srcIds = [...new Set(c.current.map((x) => x.source_id))];
    return h("button", {
      type: "button", class: "cell",
      dataset: { evidenceKind: "cell", evidenceId: `now|${c.party_id}|${c.subtopic_id}` },
    },
      items.map((x) => h("div", { class: "ci" },
        h("p", { class: "stmt" }, x.commitment),
        x.target || x.timeframe ? h("div", { class: "facts" },
          x.target ? h("span", null, h("b", null, "יעד: "), x.target) : null,
          x.timeframe ? h("span", null, h("b", null, "טווח: "), x.timeframe) : null) : null)),
      h("div", { class: "cell-foot" },
        h("span", { class: "src" }, srcIds.length > 1 ? `${srcIds.length} מקורות` : "מקור"),
        c.current.length > CELL_ITEMS ? h("span", { class: "cf-more" }, `+${c.current.length - CELL_ITEMS} נוספות`) : null));
  }

  function trackCell(c, r) {
    if (!c.past.length && !c.links.length) {
      return missingCell(c.current.length ? "יש עמדה נוכחית בלבד" : null);
    }
    const action = c.links.find((l) => l.action)?.action;
    return h("button", {
      type: "button", class: "cell cell-layers",
      dataset: { evidenceKind: "cell", evidenceId: `track|${c.party_id}|${c.subtopic_id}` },
    },
      layer("הבטיחו", c.past[0] ? h("p", { class: "stmt" }, c.past[0].commitment) : missingText()),
      layer("עשו בפועל", action
        ? h("p", { class: "stmt" }, `${actionTypeLabel(action.action_type)}${action.amount_nis ? " · " + fmtMoney(action.amount_nis) : ""} · ${yearOf(action.date)}`)
        : missingText()),
      layer("סטטוס", statusTag(c.track_status)),
      h("div", { class: "cell-foot" }, h("span", { class: "src" }, "מקור")));
  }

  function govCell(r) {
    if (!r.actions.length) return missingCell();
    return h("button", { type: "button", class: "cell", dataset: { evidenceKind: "row-actions", evidenceId: r.subtopic.subtopic_id } },
      r.actions.slice(0, CELL_ITEMS).map((a) => h("div", { class: "ci" },
        h("div", { class: "act-head" }, actionTypeLabel(a.action_type)),
        a.amount_nis ? h("div", { class: "act-amt" }, fmtMoney(a.amount_nis)) : null,
        h("div", { class: "act-meta" }, ltr(a.date.length > 4 ? fmtDate(a.date) : a.date), " ", statusTag(a.stage)))),
      h("div", { class: "cell-foot" },
        h("span", { class: "src" }, "מקור"),
        r.actions.length > CELL_ITEMS ? h("span", { class: "cf-more" }, `+${r.actions.length - CELL_ITEMS} נוספות`) : null));
  }

  function outcomesTable(cmp) {
    const body = [];
    let kpiCount = 0;
    for (const { topic, rows } of cmp.topics) {
      const shown = visibleRows(rows).filter((r) => r.subtopic.core || r.kpis.length);
      if (!shown.length && state.dense) continue;
      const trs = [];
      for (const r of shown) {
        if (!r.kpis.length) {
          trs.push(h("tr", { class: "kpi-empty" },
            h("th", { scope: "row", class: "row-label" }, h("span", { class: "rl-main" }, r.subtopic.label)),
            h("td", { colspan: 4 }, missingText(STATE.noKpi)),
            h("td", null, promisersCell(r, cmp))));
          continue;
        }
        r.kpis.forEach((k, i) => {
          kpiCount++;
          trs.push(h("tr", { class: i ? "kpi-cont" : "" },
            h("th", { scope: "row", class: "row-label" },
              i === 0 ? h("span", { class: "rl-group" }, r.subtopic.label) : null,
              h("button", { type: "button", class: "rl-kpi", dataset: { evidenceKind: "kpi", evidenceId: k.kpi.kpi_id } }, k.kpi.label)),
            h("td", { class: "cell-td td-values" }, valuesCell(k)),
            h("td", { class: "cell-td" }, h("div", { class: "period" }, ltr(obsSpan(k.observations)))),
            h("td", { class: "cell-td" }, authorityCell(k)),
            h("td", { class: "cell-td" }, k.attributions.length
              ? h("span", { class: "etag" }, `${k.attributions.length} ייחוסים מתועדים`)
              : h("span", { class: "attr-none" }, STATE.noCausal)),
            i === 0 ? h("td", { class: "cell-td", rowspan: r.kpis.length }, promisersCell(r, cmp)) : null));
        });
      }
      body.push(h("tbody", { class: "topic-group" }, topicHeader(topic, shown, 6), state.collapsed.has(topic.id) ? null : trs));
    }
    summary.replaceChildren(`${fmtNumber(kpiCount)} מדדים · אותה הגדרת מדד לכל השחקנים · `,
      h("span", { class: "muted" }, "אין כאן ציון או דירוג של מפלגות"));
    return h("table", { class: "matrix mode-outcomes" },
      h("thead", null, h("tr", null,
        h("th", { class: "corner", scope: "col" }, "מדד"),
        h("th", { scope: "col", class: "th-values" }, h("span", { class: "ph-name" }, "ערכים מתועדים")),
        h("th", { scope: "col" }, h("span", { class: "ph-name" }, "תקופה")),
        h("th", { scope: "col" }, h("span", { class: "ph-name" }, "בעלי סמכות בתקופה")),
        h("th", { scope: "col" }, h("span", { class: "ph-name" }, "ייחוס")),
        h("th", { scope: "col" }, h("span", { class: "ph-name" }, "מי מבטיח בנושא"), h("span", { class: "ph-sub" }, "מהמפלגות שנבחרו · הקשר בלבד")))),
      body);
  }

  function valuesCell(k) {
    const obs = k.observations;
    const geos = new Set(obs.map((o) => o.geography));
    const shown = obs.length > 3 && geos.size === 1 ? [obs[0], obs.at(-2), obs.at(-1)] : obs.slice(-3);
    return h("button", { type: "button", class: "cell cell-values", dataset: { evidenceKind: "kpi", evidenceId: k.kpi.kpi_id } },
      obs.length > 3 && geos.size === 1 ? spark(obs) : null,
      h("table", { class: "vals" }, h("tbody", null, shown.map((o, i) => [
        i === 1 && obs.length > 3 && geos.size === 1 ? h("tr", { class: "gap" }, h("td", { colspan: 2 }, "⋯")) : null,
        h("tr", null,
          h("td", { class: "vp" }, geos.size > 1 && o.geography ? geoLabel(o.geography) : ltr(fmtPeriod(o.period))),
          h("td", { class: "vv" }, valueNode(o.value, k.kpi.unit))),
      ]))),
      h("div", { class: "cell-foot" }, h("span", { class: "src" }, k.kpi.source),
        obs.length > shown.length ? h("span", { class: "cf-more" }, `${obs.length} תצפיות`) : null));
  }

  // Newest holders first. Party is the holder's Knesset faction on the first
  // day of the term, as recorded by the Knesset.
  function authorityCell(k) {
    if (!k.authorities.length) return missingCell(null, STATE.missing);
    const shown = k.authorities.slice(0, 3);
    return h("button", { type: "button", class: "cell cell-auth", dataset: { evidenceKind: "kpi", evidenceId: k.kpi.kpi_id } },
      h("ul", { class: "auth" }, shown.map((a) => h("li", null,
        h("span", { class: "auth-name" }, a.holder_name, a.acting ? h("span", { class: "muted" }, " (מ״מ)") : null),
        h("span", { class: "auth-meta" }, `${a.role === "head_of_government" ? "ראש הממשלה" : shortOffice(a.office_label)} · `,
          a.entity_id ? short(a.entity_id) : a.faction_name || "—", " · ", ltr(`${yearOf(a.start)}–${a.end ? yearOf(a.end) : ""}`))))),
      k.authorities.length > shown.length ? h("div", { class: "cell-foot" }, h("span", { class: "cf-more" }, `+${k.authorities.length - shown.length} בתקופה`)) : null);
  }

  function promisersCell(r, cmp) {
    if (!r.promisers.length) return missingText();
    return h("div", { class: "promisers" }, r.promisers.map((pid) =>
      h("button", { type: "button", class: "chip-btn", dataset: { evidenceKind: "cell", evidenceId: `now|${pid}|${r.subtopic.subtopic_id}` } },
        cmp.parties.find((p) => p.entity_id === pid).short_name)));
  }

  render();
}

// Tiny inline bar sparkline with a zero baseline.
function spark(obs) {
  const NS = "http://www.w3.org/2000/svg";
  const W = 120, H = 28;
  const vals = obs.map((o) => o.value);
  const max = Math.max(0, ...vals), min = Math.min(0, ...vals);
  const span = max - min || 1;
  const y = (v) => ((max - v) / span) * H;
  const bw = W / vals.length;
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("class", "spark");
  svg.setAttribute("aria-hidden", "true");
  vals.forEach((v, i) => {
    const r = document.createElementNS(NS, "rect");
    r.setAttribute("x", i * bw + 1);
    r.setAttribute("width", Math.max(1, bw - 2));
    r.setAttribute("y", Math.min(y(0), y(v)));
    r.setAttribute("height", Math.max(1, Math.abs(y(v) - y(0))));
    svg.append(r);
  });
  const base = document.createElementNS(NS, "line");
  base.setAttribute("x1", 0); base.setAttribute("x2", W);
  base.setAttribute("y1", y(0)); base.setAttribute("y2", y(0));
  svg.append(base);
  return svg;
}

const shortOffice = (o) => String(o || "").replace(/^(המשרד ל|משרד ה?)/, "").trim() || o;
const missingText = (text = STATE.missing) => h("span", { class: "missing" }, text);
const missingCell = (hint, text = STATE.missing) => h("div", { class: "cell-missing" }, text, hint ? h("span", { class: "cm-hint" }, hint) : null);
const layer = (k, v) => h("div", { class: "layer" }, h("span", { class: "layer-k" }, k), v);
