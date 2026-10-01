(function () {
  "use strict";

  const TOPICS = {
    all: "הכול",
    cost_of_living: "יוקר המחיה",
    housing: "דיור",
    education: "חינוך",
    health: "בריאות",
    transport: "תחבורה",
    personal_security: "ביטחון אישי",
    governance: "משילות",
  };
  const ENTITY_TYPES = {
    parliamentary_faction: "סיעה בכנסת ה־25",
    election_campaign_entity: "גוף מתמודד לכנסת ה־26",
  };
  const ACTION_TYPES = {
    government_decision: "החלטת ממשלה",
    government_support_for_bill: "תמיכת ממשלה בהצעת חוק",
    work_plan_target: "יעד בתוכנית עבודה",
    budget: "תקציב",
  };
  const OUTCOME = {
    not_inferred: "לא הוסקה השפעה",
    legislative_completion_not_verified_here: "השלמת החקיקה לא אומתה",
    actual_achievement_not_verified_here: "ביצוע בפועל לא אומת",
  };
  const UNITS = {
    percent: "%",
    units: "יח׳ דיור",
    months: "חודשים",
    "NIS billions": "מיליארד ₪",
    "NIS/month": "₪ לחודש",
    people: "בני אדם",
    events: "אירועים",
    vehicles: "כלי רכב",
    buses: "אוטובוסים",
    "students per teacher": "תלמידים למורה",
    "vehicles per 1,000 residents": "לאלף תושבים",
  };

  const state = { topic: "all", party: "all", q: "" };
  let D, SRC;

  const $ = (s) => document.querySelector(s);
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  const fmt = (n) => Number(n).toLocaleString("he-IL", { maximumFractionDigits: 1 });

  function srcLink(id) {
    const s = SRC[id];
    const a = el("a", "src");
    a.target = "_blank";
    a.rel = "noopener";
    if (!s) { a.textContent = id; return a; }
    a.href = s.url;
    const official = s.source_type === "official_primary";
    a.append(el("span", "tag " + (official ? "official" : "party"), official ? "רשמי" : "מפלגתי"));
    a.append(el("span", null, s.publisher + " · " + s.title));
    return a;
  }

  function fact(label, value) {
    const f = el("span", "fact");
    f.append(label + " ", el("b", null, value));
    return f;
  }

  function matchTopic(t) { return state.topic === "all" || t === state.topic; }

  function renderCounts() {
    const c = $("#counts");
    [["גופים", D.parties.length], ["התחייבויות", D.commitments.length], ["פעולות", D.actions.length], ["מדדים", D.metrics.length], ["מקורות", D.sources.length]]
      .forEach(([k, v]) => {
        const d = el("div");
        d.append(el("dt", null, k), el("dd", null, v));
        c.append(d);
      });
    document.querySelectorAll("[data-meta]").forEach((n) => {
      const v = D.metadata[n.dataset.meta];
      if (v) n.textContent = v;
    });
  }

  function renderTopics() {
    const box = $("#topics");
    const count = (t) =>
      [D.commitments, D.actions, D.metrics].reduce((s, arr) => s + arr.filter((x) => t === "all" || x.topic === t).length, 0);
    Object.keys(TOPICS).forEach((t) => {
      const n = count(t);
      if (!n) return;
      const b = el("button", "chip", TOPICS[t]);
      b.type = "button";
      b.setAttribute("role", "tab");
      b.dataset.topic = t;
      b.append(el("span", "cn", n));
      b.addEventListener("click", () => setTopic(t));
      box.append(b);
    });
  }

  function setTopic(t) {
    state.topic = t;
    document.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-selected", String(c.dataset.topic === t)));
    renderLedger();
  }

  function renderPartySelect() {
    const sel = $("#party");
    sel.append(new Option("כל הגופים", "all"));
    D.parties.forEach((p) => {
      const n = D.commitments.filter((c) => c.entity_id === p.entity_id).length;
      const o = new Option(p.name + (n ? "" : " (אין נתונים)"), p.entity_id);
      o.disabled = !n;
      sel.append(o);
    });
    sel.addEventListener("change", () => { state.party = sel.value; renderLedger(); });
    $("#q").addEventListener("input", (e) => { state.q = e.target.value.trim(); renderLedger(); });
  }

  function empty(msg) { return el("div", "empty", msg); }

  function renderCommitments() {
    const list = $("#list-commitments");
    list.replaceChildren();
    const q = state.q.toLowerCase();
    const rows = D.commitments.filter((c) =>
      matchTopic(c.topic) &&
      (state.party === "all" || c.entity_id === state.party) &&
      (!q || (c.commitment + " " + c.entity_name).toLowerCase().includes(q)));
    $("#n-commitments").textContent = rows.length;
    if (!rows.length) return list.append(empty("אין התחייבויות מתועדות לסינון זה בגרסה הנוכחית."));
    rows.forEach((c, i) => {
      const card = el("article", "card c");
      card.style.setProperty("--i", Math.min(i, 20));
      const top = el("div", "card-top");
      top.append(el("span", "who", c.entity_name), el("span", "topic-tag", TOPICS[c.topic] || c.topic));
      const facts = el("div", "facts");
      if (c.target) facts.append(fact("יעד:", c.target));
      if (c.timeframe) facts.append(fact("לוח זמנים:", c.timeframe));
      card.append(top, el("p", "body", c.commitment), facts, srcLink(c.source_id));
      list.append(card);
    });
  }

  function renderActions() {
    const list = $("#list-actions");
    list.replaceChildren();
    const rows = D.actions.filter((a) => matchTopic(a.topic)).sort((a, b) => String(b.date).localeCompare(String(a.date)));
    $("#n-actions").textContent = rows.length;
    if (!rows.length) return list.append(empty("אין פעולות מתועדות בנושא זה בגרסה הנוכחית."));
    rows.forEach((a, i) => {
      const card = el("article", "card a");
      card.style.setProperty("--i", Math.min(i, 20));
      const top = el("div", "card-top");
      top.append(el("span", "who", ACTION_TYPES[a.action_type] || a.action_type), el("span", "date", a.date));
      card.append(top, el("div", "actor", a.actor_scope));
      if (a.amount_nis) {
        const v = a.amount_nis >= 1e9 ? fmt(a.amount_nis / 1e9) + " מיליארד ₪" : fmt(a.amount_nis / 1e6) + " מיליון ₪";
        const am = el("div", "amount", v);
        am.style.direction = "rtl";
        card.append(am);
      }
      const body = el("p", "body", a.description);
      body.dir = "ltr";
      const facts = el("div", "facts");
      facts.append(fact("סטטוס:", a.status.replace(/_/g, " ")));
      if (OUTCOME[a.outcome_link]) facts.append(fact("", OUTCOME[a.outcome_link]));
      card.append(body, facts, srcLink(a.source_id));
      list.append(card);
    });
  }

  function metricValue(m) {
    const v = el("div", "val" + (m.value < 0 ? " neg" : ""));
    const pct = m.unit === "percent";
    v.textContent = (m.value > 0 && /change/i.test(m.metric_name) ? "+" : "") + fmt(m.value) + (pct ? "%" : "");
    if (!pct) v.append(el("span", "unit", UNITS[m.unit] || m.unit));
    return v;
  }

  function seriesCard(name, items) {
    const card = el("article", "card m series");
    const top = el("div", "card-top");
    top.append(el("span", "who", "סדרה · " + items.length + " תקופות"), el("span", "topic-tag", TOPICS[items[0].topic]));
    const max = Math.max(...items.map((m) => Math.abs(m.value)));
    const bars = el("div", "bars");
    items.forEach((m) => {
      const b = el("div", "bar" + (m.value < 0 ? " neg" : ""));
      b.dataset.tip = m.period + "  " + (m.value > 0 ? "+" : "") + m.value + "%";
      const i = el("i");
      i.style.height = (Math.abs(m.value) / max) * 50 + "%";
      b.append(i);
      bars.append(b);
    });
    const axis = el("div", "axis");
    axis.append(el("span", null, items[0].period), el("span", null, items[items.length - 1].period));
    const last = items[items.length - 1];
    card.append(top, metricValue(last), el("div", "name", name), bars, axis);
    if (last.note) card.append(el("div", "note", last.note));
    card.append(srcLink(last.source_id));
    return card;
  }

  function renderMetrics() {
    const list = $("#list-metrics");
    list.replaceChildren();
    const rows = D.metrics.filter((m) => matchTopic(m.topic));
    $("#n-metrics").textContent = rows.length;
    if (!rows.length) return list.append(empty("אין מדדים בנושא זה בגרסה הנוכחית."));
    const groups = new Map();
    rows.forEach((m) => {
      const k = m.metric_name + "|" + m.geography + "|" + m.unit;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(m);
    });
    let i = 0;
    groups.forEach((items) => {
      if (items.length >= 4 && items.every((m) => /^\d{4}-\d{2}$/.test(m.period))) {
        const c = seriesCard(items[0].metric_name, items.sort((a, b) => a.period.localeCompare(b.period)));
        c.style.setProperty("--i", Math.min(i++, 20));
        list.append(c);
        return;
      }
      items.forEach((m) => {
        const card = el("article", "card m");
        card.style.setProperty("--i", Math.min(i++, 20));
        const top = el("div", "card-top");
        top.append(el("span", "who period", m.period), el("span", "topic-tag", TOPICS[m.topic] || m.topic));
        const meta = [m.geography, m.population].filter(Boolean).join(" · ");
        card.append(top, metricValue(m), el("div", "name", m.metric_name));
        if (meta && meta !== "Israel") card.append(el("div", "meta", meta));
        if (m.note) card.append(el("div", "note", m.note));
        card.append(srcLink(m.source_id));
        list.append(card);
      });
    });
  }

  function renderLedger() {
    renderCommitments();
    renderActions();
    renderMetrics();
  }

  function renderCoverage() {
    const box = $("#coverage");
    const counts = D.parties.map((p) => [p, D.commitments.filter((c) => c.entity_id === p.entity_id).length]);
    const max = Math.max(1, ...counts.map((x) => x[1]));
    counts.forEach(([p, n]) => {
      const b = el("button", "cov");
      b.type = "button";
      b.disabled = !n;
      b.append(el("span", "cov-name", p.name), el("span", "cov-n" + (n ? "" : " zero"), n ? n : "אין נתונים"), el("span", "cov-type", ENTITY_TYPES[p.entity_type] || p.entity_type));
      const tr = el("span", "cov-track");
      const i = el("i");
      i.style.width = (n / max) * 100 + "%";
      tr.append(i);
      b.append(tr);
      b.addEventListener("click", () => {
        state.party = p.entity_id;
        $("#party").value = p.entity_id;
        setTopic("all");
        $("#ledger").scrollIntoView({ behavior: "smooth" });
      });
      box.append(b);
    });
  }

  function renderSources() {
    const box = $("#sources");
    D.sources.forEach((s) => {
      const r = el("div", "srcrow");
      const official = s.source_type === "official_primary";
      const a = el("a", null, s.title);
      a.href = s.url;
      a.target = "_blank";
      a.rel = "noopener";
      const sm = el("div", "sm");
      sm.append(s.publisher + (s.source_date ? " · " + s.source_date : "") + " · ", el("span", "sid", s.source_id));
      r.append(el("span", "tag " + (official ? "official" : "party"), official ? "רשמי" : "מפלגתי"), a, sm);
      box.append(r);
    });
  }

  fetch("election_audit_seed.json")
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((data) => {
      D = data;
      SRC = Object.fromEntries(D.sources.map((s) => [s.source_id, s]));
      renderCounts();
      renderTopics();
      renderPartySelect();
      setTopic("all");
      renderCoverage();
      renderSources();
    })
    .catch((e) => {
      $("#ledger").replaceChildren(el("div", "empty", "טעינת הנתונים נכשלה (" + e.message + ")."));
    });
})();
