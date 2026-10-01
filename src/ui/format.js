import { h, fmtNumber, fmtAmountNis, fmtMetric, ltr } from "./dom.js";
import { EVIDENCE_STATUS, ACTION_TYPES, ENTITY_TYPES, GEOGRAPHY } from "./labels.js";

// "2025-08 to 2026-08" -> "08/2025–08/2026"; "1999/00" stays as is.
export function fmtPeriod(label) {
  if (!label) return "";
  return String(label)
    .split(" to ")
    .map((p) => (/^\d{4}-\d{2}$/.test(p) ? `${p.slice(5)}/${p.slice(0, 4)}` : p))
    .join("–");
}

export function fmtDate(d) {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  return [day, m, y].filter(Boolean).join("/");
}

export const yearOf = (d) => (d ? String(d).slice(0, 4) : "");

export function fmtValue(value, unit) {
  const { num, unit: u } = fmtMetric(value, unit);
  return u ? `${num} ${u}` : num;
}

// Number kept left-to-right, unit in the surrounding (RTL) text.
export function valueNode(value, unit) {
  const { num, unit: u } = fmtMetric(value, unit);
  return h("span", { class: "val" }, ltr(num), u ? " " + u : "");
}

// Compact money: "₪2.45 מיליארד" style without decimals noise.
export const fmtMoney = (n) => (n == null ? "" : fmtAmountNis(n));

export function statusTag(status) {
  const s = EVIDENCE_STATUS[status];
  if (!s) return null;
  return h("span", { class: "etag", title: s.hint, dataset: { status } }, s.label);
}

export const actionTypeLabel = (t) => ACTION_TYPES[t] || t;

export function entityKind(p) {
  if (p.entity_type === "parliamentary_faction") return `סיעה · כנסת ${p.knesset ?? ""}`.trim();
  if (p.entity_type === "election_campaign_entity") return `רשימה · כנסת ${p.knesset ?? ""}`.trim();
  return ENTITY_TYPES[p.entity_type] || p.entity_type;
}

export const num = fmtNumber;
export { ltr };

export const geoLabel = (g) => (g ? GEOGRAPHY[g] || g : "");

// Span covered by a list of observations, using their own period labels.
export function obsSpan(obs) {
  if (!obs.length) return "";
  const first = obs.reduce((a, b) => (String(b.period_start) < String(a.period_start) ? b : a));
  const last = obs.reduce((a, b) => (String(b.period_end) > String(a.period_end) ? b : a));
  return first.period === last.period ? fmtPeriod(first.period) : `${fmtPeriod(first.period)}–${fmtPeriod(last.period)}`;
}
