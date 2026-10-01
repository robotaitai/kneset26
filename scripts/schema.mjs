// Shared vocabulary and schema for build and validation.

// Topic taxonomy. `primary` topics are the top-level categories in the UI.
// `group` lets the UI cluster related topics (cost of living + housing).
export const TOPICS = [
  { id: "education", label: "חינוך", primary: true, group: "education" },
  { id: "transport", label: "תחבורה ציבורית", primary: true, group: "transport" },
  { id: "health", label: "בריאות", primary: true, group: "health" },
  { id: "personal_security", label: "ביטחון אישי", primary: true, group: "personal_security" },
  { id: "cost_of_living", label: "יוקר מחיה", primary: true, group: "cost_of_living" },
  { id: "housing", label: "דיור", primary: true, group: "cost_of_living" },
  { id: "governance", label: "משילות", primary: false, group: "governance" },
];

// Normalized action stages, in pipeline order. Raw seed `status` is kept
// verbatim; `stage` is derived from it via the explicit map below.
export const ACTION_STAGES = ["proposed", "target", "approved", "budgeted", "implemented"];
export const ACTION_STAGE_BY_STATUS = {
  proposed: "proposed",
  support_at_preliminary_reading_subject_to_conditions: "proposed",
  target: "target",
  approved: "approved",
  budgeted: "budgeted",
  implemented: "implemented",
};

export const SOURCE_TYPES = ["official_primary", "party_primary", "secondary"];
export const ATTRIBUTION_RELATIONSHIPS = ["direct", "shared", "limited", "correlation_only", "unknown"];
export const LINK_RELATIONSHIPS = ["implements", "partially_implements", "explicitly_references", "contradicts"];

export const DATE_RE = /^\d{4}(-\d{2}(-\d{2})?)?$/;

export function datePrecision(d) {
  if (!d) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return "day";
  if (/^\d{4}-\d{2}$/.test(d)) return "month";
  if (/^\d{4}$/.test(d)) return "year";
  return null;
}

// Parses seed period labels into sortable start/end months (YYYY-MM).
// Supported: "2026-08", "2025", "1999/00", and "<period> to <period>".
export function parsePeriod(label) {
  if (typeof label !== "string") return null;
  const range = label.split(" to ");
  if (range.length === 2) {
    const a = parsePeriod(range[0]);
    const b = parsePeriod(range[1]);
    if (!a || !b || a.type === "range" || b.type === "range") return null;
    return { type: "range", start: a.start, end: b.end };
  }
  let m;
  if ((m = label.match(/^(\d{4})-(\d{2})$/)) && +m[2] >= 1 && +m[2] <= 12) return { type: "month", start: label, end: label };
  if ((m = label.match(/^(\d{4})$/))) return { type: "year", start: `${m[1]}-01`, end: `${m[1]}-12` };
  if ((m = label.match(/^(\d{4})\/(\d{2})$/))) {
    const y = +m[1];
    if ((y + 1) % 100 !== +m[2]) return null;
    return { type: "school_year", start: `${y}-09`, end: `${y + 1}-08` };
  }
  return null;
}

// Collection schemas used by the validator.
// required: must be present and non-empty. optional: may be null/absent.
// refs: field -> collection it must point into (array fields check each item).
export const COLLECTIONS = {
  parties: {
    id: "entity_id",
    required: ["entity_id", "name", "entity_type", "source_id"],
    refs: { source_id: "sources" },
  },
  people: {
    id: "person_id",
    required: ["person_id", "name", "source_id"],
    refs: { source_id: "sources", entity_ids: "parties" },
  },
  commitments: {
    id: "commitment_id",
    required: ["commitment_id", "entity_id", "topic", "commitment", "evidence_type", "source_id", "verified_at"],
    dates: ["verified_at"],
    refs: { entity_id: "parties", source_id: "sources", topic: "topics", person_ids: "people" },
  },
  actions: {
    id: "action_id",
    required: ["action_id", "date", "actor_scope", "topic", "action_type", "status", "stage", "description", "source_id"],
    dates: ["date"],
    numbers: ["amount_nis"],
    enums: { stage: ACTION_STAGES },
    refs: { source_id: "sources", topic: "topics" },
  },
  metric_series: {
    id: "series_id",
    required: ["series_id", "topic", "metric_name", "unit"],
    refs: { topic: "topics", source_ids: "sources" },
  },
  metrics: {
    id: "metric_id",
    required: ["metric_id", "series_id", "period", "value", "source_id", "verified_at"],
    dates: ["verified_at"],
    numbers: ["value"],
    periods: ["period"],
    refs: { series_id: "metric_series", source_id: "sources" },
  },
  sources: {
    id: "source_id",
    required: ["source_id", "publisher", "title", "url", "source_type", "retrieved_at"],
    dates: ["source_date", "retrieved_at"],
    urls: ["url"],
    enums: { source_type: SOURCE_TYPES },
  },
  commitment_action_links: {
    id: "link_id",
    required: ["link_id", "commitment_id", "action_id", "relationship", "explanation", "source_ids"],
    nonEmptyArrays: ["source_ids"],
    enums: { relationship: LINK_RELATIONSHIPS },
    refs: { commitment_id: "commitments", action_id: "actions", source_ids: "sources" },
  },
  attributions: {
    id: "attribution_id",
    required: ["attribution_id", "action_id", "metric_id", "relationship", "explanation", "source_ids"],
    nonEmptyArrays: ["source_ids"],
    enums: { relationship: ATTRIBUTION_RELATIONSHIPS },
    refs: { action_id: "actions", metric_id: "metrics", source_ids: "sources" },
  },
  topics: {
    id: "id",
    required: ["id", "label"],
  },
};
