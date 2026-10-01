// Evidence/source explorer: every source, what kind it is and what cites it.

import { h, ltr, sourceTag, fmtNumber } from "../ui/dom.js";
import { STATE } from "../ui/labels.js";
import { fmtDate } from "../ui/format.js";

export const title = "מקורות";

export async function mount(root, { repo, isCurrent }) {
  const sources = await repo.getSources();
  const counts = await Promise.all(sources.map((s) => repo.countCitations(s.source_id)));
  if (!isCurrent()) return;
  const total = (n) => n.commitments + n.actions + n.metrics + n.parties + n.authorities;
  root.append(
    h("header", { class: "view-head" },
      h("h2", null, title),
      h("p", { class: "view-sub" }, "כל מקור שעליו נשען המאגר. לחיצה על מקור מציגה את פרטיו המלאים.")),
    h("div", { class: "matrix-wrap static" }, h("table", { class: "plain" },
      h("thead", null, h("tr", null,
        h("th", null, "מקור"), h("th", null, "מפרסם"), h("th", null, "סוג"), h("th", null, "תאריך"), h("th", null, "מצוטט ב־"))),
      h("tbody", null, sources.map((s, i) => h("tr", null,
        h("td", null, h("button", { type: "button", class: "linkish", dataset: { evidenceKind: "source", evidenceId: s.source_id } }, s.title)),
        h("td", null, s.publisher),
        h("td", null, sourceTag(s)),
        h("td", null, s.source_date ? ltr(fmtDate(s.source_date)) : h("span", { class: "missing" }, STATE.missing)),
        h("td", { class: "num" }, total(counts[i]) ? fmtNumber(total(counts[i])) : h("span", { class: "missing" }, "לא מצוטט"))))))));
}
