import { h, fmtNumber } from "./dom.js";

// Topic chips. Primary topics always show; others only when they have data.
export function topicChips(topics, { selected, counts, onChange, allLabel = "כל התחומים" }) {
  const box = h("div", { class: "chips", role: "group", "aria-label": "תחום" });
  const chip = (id, label, n, primary = true) => {
    const b = h("button", {
      type: "button",
      class: "chip",
      dataset: { topic: id, primary: String(primary) },
      "aria-pressed": String((selected || "") === id),
      onclick: () => {
        box.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", String(c === b)));
        onChange(id || undefined);
      },
    }, label, n === undefined ? null : h("span", { class: "cn" }, fmtNumber(n)));
    if (n === 0 && (selected || "") !== id) b.classList.add("zero");
    if (!primary && n === 0 && (selected || "") !== id) b.hidden = true;
    return b;
  };
  box.append(chip("", allLabel, counts ? [...counts.values()].reduce((a, b) => a + b, 0) : undefined));
  for (const t of topics) {
    const n = counts ? counts.get(t.id) || 0 : undefined;
    box.append(chip(t.id, t.label, n, t.primary));
  }
  return box;
}

export function updateChipCounts(box, counts) {
  let total = 0;
  for (const n of counts.values()) total += n;
  box.querySelectorAll(".chip").forEach((c) => {
    const cn = c.querySelector(".cn");
    if (!cn) return;
    const n = c.dataset.topic ? counts.get(c.dataset.topic) || 0 : total;
    cn.textContent = fmtNumber(n);
    const off = n === 0 && c.getAttribute("aria-pressed") !== "true";
    c.classList.toggle("zero", off);
    if (c.dataset.primary === "false") c.hidden = off;
  });
}

export function selectControl({ label, options, value, onChange, disabled }) {
  const sel = h("select", { "aria-label": label, disabled, onchange: () => onChange(sel.value || undefined) });
  for (const o of options) {
    const opt = new Option(o.label, o.value ?? "");
    opt.disabled = !!o.disabled;
    sel.append(opt);
  }
  sel.value = value || "";
  return h("label", { class: "field" }, h("span", { class: "field-label" }, label), sel);
}

export function searchControl({ value, onChange, placeholder = "חיפוש חופשי..." }) {
  let t;
  const input = h("input", {
    type: "search",
    value: value || "",
    placeholder,
    "aria-label": "חיפוש",
    oninput: () => { clearTimeout(t); t = setTimeout(() => onChange(input.value.trim() || undefined), 150); },
  });
  return h("label", { class: "field field-search" }, h("span", { class: "field-label" }, "חיפוש"), input);
}
