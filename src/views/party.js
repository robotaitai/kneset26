// Party profile: everything documented for one party, grouped by the same
// rows as the comparison table.

import { h, ltr, fmtNumber } from "../ui/dom.js";
import { STATE } from "../ui/labels.js";
import { entityKind, fmtDate } from "../ui/format.js";

export const title = "פרופיל מפלגה";

export async function mount(root, { repo, params, isCurrent }) {
  const [parties, config, topics, subtopics, meta, people, authorities] = await Promise.all([
    repo.getParties(), repo.getCompareConfig(), repo.getTopics(), repo.getSubtopics(), repo.getMeta(), repo.getPeople(), repo.getAuthorities(),
  ]);
  if (!isCurrent()) return;
  const party = parties.find((p) => p.entity_id === params.id);
  const short = (id) => config.short_names?.[id] || id;

  if (!party) {
    root.append(
      h("header", { class: "view-head" }, h("h2", null, "מפלגות ורשימות")),
      h("table", { class: "plain" },
        h("thead", null, h("tr", null, h("th", null, "שם"), h("th", null, "סוג"), h("th", null, "התחייבויות במאגר"))),
        h("tbody", null, await Promise.all(parties.map(async (p) => {
          const { total } = await repo.getCommitments({ entityId: p.entity_id, limit: 0 });
          return h("tr", null,
            h("td", null, h("a", { href: `#/party?id=${encodeURIComponent(p.entity_id)}` }, p.name)),
            h("td", null, entityKind(p)),
            h("td", { class: "num" }, total ? fmtNumber(total) : h("span", { class: "missing" }, STATE.missing)));
        })))));
    return;
  }

  const { items } = await repo.getCommitments({ entityId: party.entity_id });
  const source = await repo.getSource(party.source_id);
  const members = people.filter((p) => (p.entity_ids || []).includes(party.entity_id)).sort((a, b) => a.name.localeCompare(b.name, "he"));
  const terms = authorities.filter((a) => a.entity_id === party.entity_id).sort((a, b) => b.start.localeCompare(a.start));
  const topicLabel = new Map(topics.map((t) => [t.id, t.label]));
  const compareHref = `#/compare?p=${encodeURIComponent([party.entity_id, ...config.default_parties.filter((x) => x !== party.entity_id)].slice(0, 5).join(","))}`;

  const rows = [];
  for (const t of topics) {
    for (const st of subtopics.filter((s) => s.topic === t.id)) {
      const cs = items.filter((c) => c.subtopic_ids.includes(st.subtopic_id));
      if (!cs.length) continue;
      cs.forEach((c, i) => rows.push(h("tr", null,
        i === 0 ? h("th", { scope: "row", rowspan: cs.length, class: "row-label" },
          h("span", { class: "rl-group" }, t.label), h("span", { class: "rl-main" }, st.label)) : null,
        h("td", null, h("button", { type: "button", class: "linkish stmt-btn", dataset: { evidenceKind: "commitment", evidenceId: c.commitment_id } }, c.commitment)),
        h("td", null, c.target || h("span", { class: "missing" }, "—")),
        h("td", null, c.timeframe || h("span", { class: "missing" }, "—")),
        h("td", null, meta.campaigns?.[c.campaign]?.label || c.campaign))));
    }
  }

  root.append(
    h("header", { class: "view-head" },
      h("div", { class: "ev-kicker" }, entityKind(party)),
      h("h2", null, party.name),
      h("p", { class: "view-sub" },
        h("a", { href: compareHref }, `השוואת ${short(party.entity_id)} למפלגות אחרות ←`))),
    h("dl", { class: "kv" },
      h("dt", null, "מקור הרישום"), h("dd", null, source ? h("button", { type: "button", class: "linkish", dataset: { evidenceKind: "source", evidenceId: source.source_id } }, `${source.publisher} · ${source.title}`) : STATE.missing),
      h("dt", null, "התחייבויות מתועדות"), h("dd", null, items.length ? fmtNumber(items.length) : h("span", { class: "missing" }, STATE.missing)),
      h("dt", null, `חברי הסיעה בכנסת ה־25 (${members.length})`), h("dd", null, members.length
        ? h("span", { class: "inline-list" }, members.map((m) => h("a", { href: `#/person?id=${encodeURIComponent(m.person_id)}` }, m.name)))
        : h("span", { class: "missing" }, STATE.missing)),
      h("dt", null, "פעולות משויכות"), h("dd", null, h("span", { class: "missing" }, "המאגר אינו משייך פעולות ממשלה למפלגה ללא מקור מפורש"))),
    h("h3", { class: "sec-title" }, "תפקידים ביצועיים בתחומי ההשוואה (חברי הסיעה, מאז 1999)"),
    terms.length
      ? h("div", { class: "matrix-wrap static" }, h("table", { class: "plain" },
          h("thead", null, h("tr", null, h("th", null, "בעל התפקיד"), h("th", null, "תפקיד"), h("th", null, "תחומים"), h("th", null, "תקופה"))),
          h("tbody", null, terms.map((a) => h("tr", null,
            h("td", null, h("a", { href: `#/person?id=${encodeURIComponent(a.person_id)}` }, a.holder_name)),
            h("td", null, a.duty || a.office_label),
            h("td", null, a.topics.length > 3 ? "כל התחומים" : a.topics.map((t) => topicLabel.get(t) || t).join(", ")),
            h("td", { class: "num" }, ltr(`${fmtDate(a.start)}–${a.end ? fmtDate(a.end) : "היום"}`)))))))
      : h("p", { class: "missing" }, STATE.missing),
    h("p", { class: "dr-note" }, "שיוך לפי הסיעה של בעל התפקיד ביום תחילת הכהונה, כפי שתועד בכנסת. אין בכך ייחוס של תוצאות למפלגה."),
    h("h3", { class: "sec-title" }, "התחייבויות מתועדות"),
    rows.length
      ? h("div", { class: "matrix-wrap static" }, h("table", { class: "plain profile" },
          h("thead", null, h("tr", null, h("th", null, "נושא"), h("th", null, "התחייבות"), h("th", null, "יעד"), h("th", null, "טווח"), h("th", null, "מערכת בחירות"))),
          h("tbody", null, rows)))
      : h("div", { class: "empty" }, `${STATE.missing}: לא נאספו התחייבויות עבור ${party.name} בגרסה זו של המאגר.`),
  );
}
