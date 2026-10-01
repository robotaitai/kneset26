// Politician profile. people.json is curated; until it is filled this page
// states that plainly instead of showing placeholders.

import { h } from "../ui/dom.js";
import { STATE } from "../ui/labels.js";

export const title = "פרופיל פוליטיקאי";

export async function mount(root, { repo, params, isCurrent }) {
  const [people, parties, commitments] = await Promise.all([repo.getPeople(), repo.getParties(), repo.getCommitments({ personId: params.id })]);
  if (!isCurrent()) return;
  const person = people.find((p) => p.person_id === params.id);
  if (!person) {
    root.append(
      h("header", { class: "view-head" }, h("h2", null, "פוליטיקאים")),
      people.length
        ? h("ul", { class: "plain-list" }, people.map((p) => h("li", null, h("a", { href: `#/person?id=${encodeURIComponent(p.person_id)}` }, p.name))))
        : h("div", { class: "empty" }, `${STATE.missing}: רשימות המועמדים ותפקידי חברי הכנסת עדיין לא נאספו למאגר (data/people.json).`));
    return;
  }
  const partyNames = (person.entity_ids || []).map((id) => parties.find((p) => p.entity_id === id)?.name || id);
  root.append(
    h("header", { class: "view-head" }, h("h2", null, person.name), h("p", { class: "view-sub" }, partyNames.join(" · ") || STATE.missing)),
    commitments.total
      ? h("ul", { class: "plain-list" }, commitments.items.map((c) => h("li", null,
          h("button", { type: "button", class: "linkish", dataset: { evidenceKind: "commitment", evidenceId: c.commitment_id } }, c.commitment))))
      : h("p", { class: "missing" }, STATE.missing),
    h("button", { type: "button", class: "ev-btn", dataset: { evidenceKind: "source", evidenceId: person.source_id } }, "מקור"));
}
