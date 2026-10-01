import { h, orMissing, ltr, sourceTag } from "./dom.js";
import { STATE, FIELD_LABELS, OUTCOME_LINK, ATTRIBUTION_STRENGTH, SOURCE_TYPES } from "./labels.js";

const KIND_LABELS = {
  commitment: "התחייבות",
  action: "פעולה",
  metric: "תצפית מדד",
  series: "סדרת מדד",
  party: "גוף",
  source: "מקור",
};

// Evidence panel: one <dialog> shared by every view. Any element with
// data-evidence-kind / data-evidence-id opens it.
export function setupEvidencePanel(repo) {
  const dialog = h("dialog", { class: "evidence", "aria-labelledby": "ev-title" });
  const body = h("div", { class: "ev-body" });
  const close = h("button", { type: "button", class: "ev-close", "aria-label": "סגירה", onclick: () => dialog.close() }, "×");
  dialog.append(close, body);
  dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); });
  document.body.append(dialog);

  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-evidence-kind]");
    if (!btn) return;
    e.preventDefault();
    open(btn.dataset.evidenceKind, btn.dataset.evidenceId);
  });

  async function open(kind, id) {
    const record = await repo.getRecord(kind, id);
    body.replaceChildren(h("p", { class: "muted" }, "טוען..."));
    if (!dialog.open) dialog.showModal();
    if (!record) {
      body.replaceChildren(h("h2", { id: "ev-title" }, STATE.missing), h("p", { class: "mono" }, `${kind}/${id}`));
      return;
    }
    const series = kind === "metric" ? await repo.getSeries(record.series_id) : null;
    const sourceIds = kind === "source" ? [id] : [].concat(record.source_id || record.source_ids || []);
    const sources = await Promise.all(sourceIds.map((s) => repo.getSource(s).then((src) => src || { source_id: s })));

    body.replaceChildren(h("div", null,
      h("div", { class: "ev-kicker" }, KIND_LABELS[kind] || kind, " · ", ltr(id, "mono")),
      h("h2", { id: "ev-title", dir: "auto" }, title(kind, record, series)),
      caveats(kind, record),
      h("h3", null, sources.length > 1 ? "מקורות" : "מקור"),
      sources.length ? sources.map((s) => sourceBlock(s, record)) : h("p", { class: "missing" }, STATE.missing),
      kind === "source" ? citations(repo, id) : null,
      h("details", { class: "ev-raw" },
        h("summary", null, "כל השדות ברשומה"),
        fieldTable(record)),
    ));
    close.focus();
  }

  return { open };
}

function title(kind, r, series) {
  switch (kind) {
    case "commitment": return r.commitment;
    case "action": return r.description;
    case "metric": return `${series?.metric_name ?? r.series_id} · ${r.period} · ${r.value} ${series?.unit ?? ""}`.trim();
    case "series": return r.metric_name;
    case "party": return r.name;
    case "source": return r.title;
    default: return r[Object.keys(r)[0]];
  }
}

function caveats(kind, r) {
  const notes = [];
  if (r.attribution_note) notes.push(r.attribution_note);
  if (r.note) notes.push(r.note);
  if (kind === "action") {
    if (OUTCOME_LINK[r.outcome_link]) notes.push(OUTCOME_LINK[r.outcome_link]);
    if (ATTRIBUTION_STRENGTH[r.attribution_strength]) notes.push(ATTRIBUTION_STRENGTH[r.attribution_strength]);
    if (!r.implementation_verified) notes.push(STATE.implUnknown);
  }
  if (kind === "metric" || kind === "series") notes.push(STATE.causalUnknownLong);
  if (kind === "commitment") notes.push(STATE.implUnknown);
  if (!notes.length) return null;
  return h("ul", { class: "ev-caveats" }, notes.map((n) => h("li", { dir: "auto" }, n)));
}

function sourceBlock(s, record) {
  const rows = [
    ["מפרסם", orMissing(s.publisher)],
    ["כותרת", orMissing(s.title)],
    ["סוג מקור", s.source_type ? h("span", null, sourceTag(s), " ", ltr(s.source_type, "mono dim")) : orMissing(null)],
    ["תאריך המקור", orMissing(s.source_date, (d) => ltr(d))],
    ["נשלף בתאריך", orMissing(s.retrieved_at, (d) => ltr(d))],
    ["אומת בתאריך", orMissing(record.verified_at, (d) => ltr(d))],
    ["הערות", orMissing(s.notes, (n) => h("span", { dir: "auto" }, n))],
    ["כתובת", orMissing(s.url, (u) => h("a", { href: u, target: "_blank", rel: "noopener noreferrer", class: "ev-url", dir: "ltr" }, safeDecode(u)))],
  ];
  return h("section", { class: "ev-source" },
    h("dl", null, rows.map(([k, v]) => [h("dt", null, k), h("dd", null, v)])),
    s.url ? h("a", { class: "ev-open", href: s.url, target: "_blank", rel: "noopener noreferrer" }, "פתיחת המקור המקורי ↗") : null,
  );
}

function citations(repo, id) {
  const box = h("p", { class: "muted" });
  repo.countCitations(id).then((n) => {
    box.textContent = `מצוטט ב־${n.commitments} התחייבויות, ${n.actions} פעולות, ${n.metrics} תצפיות מדד, ${n.parties} גופים.`;
  });
  return box;
}

function fieldTable(r) {
  return h("table", { class: "ev-fields" },
    h("tbody", null, Object.entries(r).map(([k, v]) =>
      h("tr", null,
        h("th", null, FIELD_LABELS[k] || k, h("div", { class: "mono dim" }, k)),
        h("td", { dir: "auto" }, fmtField(k, v))))));
}

function fmtField(k, v) {
  if (v === null || v === undefined || v === "" || (Array.isArray(v) && !v.length)) return h("span", { class: "missing" }, STATE.missing);
  if (typeof v === "boolean") return v ? "כן" : "לא";
  if (Array.isArray(v)) return v.join(", ");
  if (k === "source_type") return SOURCE_TYPES[v] || v;
  return String(v);
}

function safeDecode(u) {
  try { return decodeURI(u); } catch { return u; }
}
