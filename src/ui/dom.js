import { STATE, UNITS, SOURCE_TYPES } from "./labels.js";

// Minimal element builder: h("div", { class: "x", onclick }, child, [children], "text")
export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "dataset") Object.assign(el.dataset, v);
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k in el && typeof v !== "string") el[k] = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(c instanceof Node ? c : String(c));
  }
}

export const isMissing = (v) => v === null || v === undefined || v === "";

// Renders a value, or the explicit "no documented information" state.
export function orMissing(v, render = (x) => x) {
  return isMissing(v) ? h("span", { class: "missing" }, STATE.missing) : render(v);
}

export const ltr = (text, cls) => h("bdi", { dir: "ltr", class: cls }, text);

export function fmtNumber(n) {
  return Number(n).toLocaleString("he-IL", { maximumFractionDigits: 2 });
}

export function fmtAmountNis(n) {
  if (n >= 1e9) return fmtNumber(n / 1e9) + " מיליארד ₪";
  if (n >= 1e6) return fmtNumber(n / 1e6) + " מיליון ₪";
  return fmtNumber(n) + " ₪";
}

// Values are shown exactly as published: "1.5%", "80,010 יחידות דיור".
export function fmtMetric(value, unit) {
  if (unit === "percent") return { num: fmtNumber(value) + "%", unit: "" };
  return { num: fmtNumber(value), unit: UNITS[unit] || unit };
}

export function sourceTag(source) {
  if (!source) return h("span", { class: "tag" }, STATE.missing);
  const official = source.source_type === "official_primary";
  return h("span", { class: "tag " + (official ? "official" : "party") }, SOURCE_TYPES[source.source_type] || source.source_type);
}

export function evidenceButton(kind, id, label = "ראיות") {
  return h("button", { type: "button", class: "ev-btn", dataset: { evidenceKind: kind, evidenceId: id } }, label);
}

export function empty(text) {
  return h("div", { class: "empty" }, text);
}

// Renders `items` in pages of `size` with a "show more" button so large
// result sets are never rendered at once.
export function pagedList(container, fetchPage, renderItem, { size = 20, emptyText } = {}) {
  let offset = 0;
  const more = h("button", { type: "button", class: "more" });
  const list = h("div", { class: "list" });
  container.replaceChildren(list);

  async function next() {
    more.disabled = true;
    const { items, total } = await fetchPage(offset, size);
    const superseded = () => container.firstChild !== list;
    if (superseded()) return total;
    if (total === 0 && offset === 0) {
      container.replaceChildren(empty(emptyText || STATE.missing));
      return 0;
    }
    const nodes = await Promise.all(items.map(renderItem));
    if (superseded()) return total;
    nodes.forEach((n, i) => { n.style.setProperty("--i", i); list.append(n); });
    offset += items.length;
    more.remove();
    if (offset < total) {
      more.textContent = `הצג עוד (${fmtNumber(total - offset)} נוספים)`;
      more.disabled = false;
      container.append(more);
    }
    return total;
  }
  more.addEventListener("click", next);
  return next();
}
