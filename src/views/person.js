// Politician profile: Knesset faction memberships and executive terms, as
// recorded by the Knesset, plus any commitments attributed to the person.

import { h, ltr, fmtNumber } from "../ui/dom.js";
import { STATE } from "../ui/labels.js";
import { fmtDate } from "../ui/format.js";

export const title = "פרופיל פוליטיקאי";

const range = (s, e) => ltr(`${fmtDate(s)}–${e ? fmtDate(e) : "היום"}`);

export async function mount(root, { repo, params, isCurrent }) {
  const [people, authorities, config] = await Promise.all([repo.getPeople(), repo.getAuthorities(), repo.getCompareConfig()]);
  if (!isCurrent()) return;
  const short = (id) => config.short_names?.[id] || id;
  const person = people.find((p) => p.person_id === params.id);

  if (!person) {
    const current = people.filter((p) => p.in_current_knesset).sort((a, b) => a.name.localeCompare(b.name, "he"));
    const byParty = new Map();
    for (const p of current) {
      const key = p.entity_ids.length ? p.entity_ids.map(short).join(" / ") : (p.memberships.at(-1)?.faction_name || STATE.missing);
      if (!byParty.has(key)) byParty.set(key, []);
      byParty.get(key).push(p);
    }
    const others = people.filter((p) => !p.in_current_knesset).sort((a, b) => a.name.localeCompare(b.name, "he"));
    root.append(
      h("header", { class: "view-head" },
        h("h2", null, "פוליטיקאים"),
        h("p", { class: "view-sub" }, `${fmtNumber(current.length)} חברי הכנסת ה־25 (כולל מי שכיהנו בה ופרשו), ו־${fmtNumber(others.length)} בעלי תפקידים ביצועיים מאז 1999. מקור: מאגר המידע הפתוח של הכנסת.`)),
      h("div", { class: "people-groups" }, [...byParty.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], "he")).map(([party, ps]) =>
        h("section", { class: "pg" },
          h("h3", null, party, h("span", { class: "muted" }, ` · ${fmtNumber(ps.length)}`)),
          h("ul", { class: "pg-list" }, ps.map((p) => h("li", null, h("a", { href: `#/person?id=${encodeURIComponent(p.person_id)}` }, p.name))))))),
      h("details", { class: "pg-more" },
        h("summary", null, `בעלי תפקידים ביצועיים שאינם בכנסת ה־25 (${fmtNumber(others.length)})`),
        h("ul", { class: "pg-list" }, others.map((p) => h("li", null, h("a", { href: `#/person?id=${encodeURIComponent(p.person_id)}` }, p.name))))));
    return;
  }

  const terms = authorities.filter((a) => a.person_id === person.person_id).sort((a, b) => b.start.localeCompare(a.start));
  const commitments = await repo.getCommitments({ personId: person.person_id });
  root.append(
    h("header", { class: "view-head" },
      h("div", { class: "ev-kicker" }, person.in_current_knesset ? "חבר/ת הכנסת ה־25" : "בעל/ת תפקיד ביצועי"),
      h("h2", null, person.name),
      person.entity_ids.length
        ? h("p", { class: "view-sub" }, person.entity_ids.map((id) => h("a", { href: `#/party?id=${encodeURIComponent(id)}` }, short(id))))
        : null),
    h("h3", { class: "sec-title" }, "תפקידים ביצועיים בתחומי ההשוואה"),
    terms.length
      ? h("div", { class: "matrix-wrap static" }, h("table", { class: "plain" },
          h("thead", null, h("tr", null, h("th", null, "תפקיד"), h("th", null, "תחומים"), h("th", null, "סיעה בתחילת הכהונה"), h("th", null, "תקופה"), h("th", null, "מקור"))),
          h("tbody", null, terms.map((a) => h("tr", null,
            h("td", null, a.duty || a.office_label, a.acting && !/ממלא מקום/.test(a.duty || "") ? " (ממלא מקום)" : ""),
            h("td", null, a.topics.length > 3 ? "כל התחומים" : a.topics.join(", ")),
            h("td", null, a.entity_id ? short(a.entity_id) : a.faction_name || h("span", { class: "missing" }, STATE.missing)),
            h("td", { class: "num" }, range(a.start, a.end)),
            h("td", null, h("button", { type: "button", class: "ev-btn", dataset: { evidenceKind: "authority", evidenceId: a.authority_id } }, "מקור")))))))
      : h("p", { class: "missing" }, STATE.missing),
    h("h3", { class: "sec-title" }, "חברות בסיעות"),
    person.memberships.length
      ? h("div", { class: "matrix-wrap static" }, h("table", { class: "plain" },
          h("thead", null, h("tr", null, h("th", null, "סיעה"), h("th", null, "כנסת"), h("th", null, "תקופה"))),
          h("tbody", null, [...person.memberships].reverse().map((m) => h("tr", null,
            h("td", null, m.entity_id ? h("a", { href: `#/party?id=${encodeURIComponent(m.entity_id)}` }, m.faction_name) : m.faction_name),
            h("td", { class: "num" }, m.knesset),
            h("td", { class: "num" }, range(m.start, m.end)))))))
      : h("p", { class: "missing" }, STATE.missing),
    h("h3", { class: "sec-title" }, "התחייבויות אישיות"),
    commitments.total
      ? h("ul", { class: "plain-list" }, commitments.items.map((c) => h("li", null,
          h("button", { type: "button", class: "linkish", dataset: { evidenceKind: "commitment", evidenceId: c.commitment_id } }, c.commitment))))
      : h("p", { class: "missing" }, STATE.missing),
    h("p", { class: "dr-note" }, "מקור: ", h("button", { type: "button", class: "linkish", dataset: { evidenceKind: "source", evidenceId: person.source_id } }, "מאגר המידע הפתוח של הכנסת"),
      ` · מזהה אישי בכנסת: `, ltr(person.knesset_person_id, "mono")),
  );
}
