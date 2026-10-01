// UI vocabulary. Product states for missing/unknown data are first-class
// values, not error messages.

export const STATE = {
  missing: "לא נמצא מידע מתועד",
  implUnknown: "סטטוס ביצוע לא אומת",
  causalUnknown: "לא ניתן לקבוע קשר סיבתי",
  causalUnknownLong: "לא ניתן לקבוע קשר סיבתי על בסיס הנתונים הקיימים",
  noLink: "לא נמצא קשר מתועד",
  outcomeUnverified: "תוצאה לא אומתה",
  noCausal: "לא ניתן לקבוע קשר סיבתי מהנתון לבדו",
  noExcerpt: "לא נשמר במאגר ציטוט מתוך המקור",
  noKpi: "לא נמצא מדד מתועד",
  noAuthority: "לא נמצא מידע מתועד על בעלי הסמכות בתקופה",
  noLinkedAction: "לא נמצאה פעולה מתועדת שמקושרת להתחייבות",
  notPartyAttributed: "המקור אינו משייך פעולה זו למפלגה",
};

export const STATUS = {
  documented_commitment: { label: "התחייבות מתועדת", hint: "המפלגה פרסמה שבכוונתה לעשות זאת. אין בכך ראיה לביצוע." },
  proposed: { label: "הוצע", hint: "הצעה או תמיכה בהצעה (למשל הצעת חוק בקריאה טרומית). טרם אושרה סופית." },
  target: { label: "יעד בתוכנית עבודה", hint: "יעד שמשרד ממשלתי הציב לעצמו. העמידה ביעד לא אומתה." },
  approved: { label: "אושר", hint: "החלטה רשמית התקבלה. אין בכך ראיה לביצוע בשטח." },
  budgeted: { label: "תוקצב", hint: "הוקצה תקציב בספר התקציב. אין בכך ראיה להוצאה בפועל." },
  implemented: { label: "בוצע", hint: "קיימת ראיה מתועדת לביצוע." },
  outcome_unverified: { label: STATE.outcomeUnverified, hint: "לא נבדק אם לפעולה הייתה השפעה על מדד כלשהו." },
};

export const ACTION_TYPES = {
  government_decision: "החלטת ממשלה",
  government_support_for_bill: "עמדת ממשלה להצעת חוק",
  work_plan_target: "יעד בתוכנית עבודה",
  budget: "תקציב",
};

export const OUTCOME_LINK = {
  not_inferred: "לא הוסקה השפעה על מדדים",
  legislative_completion_not_verified_here: "השלמת החקיקה לא אומתה",
  actual_achievement_not_verified_here: "העמידה ביעד לא אומתה",
};

export const ATTRIBUTION_STRENGTH = {
  direct_to_budget_decision: "המקור מתעד ישירות את החלטת התקציב",
  direct_to_planning_decision: "המקור מתעד ישירות את החלטת התכנון",
  direct_to_government_position: "המקור מתעד ישירות את עמדת הממשלה",
  direct_to_ministry_plan: "המקור מתעד ישירות את תוכנית המשרד",
  direct_to_budget: "המקור מתעד ישירות את סעיף התקציב",
};

export const RELATIONSHIP = {
  direct: "קשר ישיר מתועד",
  shared: "אחריות משותפת",
  limited: "השפעה מוגבלת",
  correlation_only: "מתאם בלבד, ללא סיבתיות",
  unknown: STATE.causalUnknown,
  implements: "מיישמת את ההתחייבות",
  partially_implements: "מיישמת חלקית",
  explicitly_references: "מפנה במפורש להתחייבות",
  contradicts: "סותרת את ההתחייבות",
};

export const ENTITY_TYPES = {
  parliamentary_faction: "סיעה בכנסת ה־25",
  election_campaign_entity: "רשימה מתמודדת לכנסת ה־26",
};

export const SOURCE_TYPES = {
  official_primary: "מקור רשמי ראשוני",
  party_primary: "מקור מפלגתי ראשוני",
  secondary: "מקור משני",
};

export const UNITS = {
  percent: "%",
  units: "יחידות דיור",
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

export const PERIOD_TYPES = {
  month: "חודש",
  year: "שנה",
  school_year: "שנת לימודים",
  range: "טווח",
};

export const FIELD_LABELS = {
  commitment_id: "מזהה",
  action_id: "מזהה",
  metric_id: "מזהה",
  series_id: "מזהה סדרה",
  entity_id: "מזהה גוף",
  entity_name: "שם הגוף במקור",
  topic: "תחום",
  commitment: "התחייבות",
  target: "יעד כמותי",
  timeframe: "לוח זמנים",
  evidence_type: "סוג ראיה",
  source_id: "מזהה מקור",
  verified_at: "תאריך אימות",
  attribution_note: "הערת ייחוס",
  person_ids: "אנשים",
  date: "תאריך",
  date_precision: "דיוק תאריך",
  actor_scope: "גורם",
  action_type: "סוג פעולה",
  status: "סטטוס במקור",
  stage: "שלב מנורמל",
  description: "תיאור",
  amount_nis: "סכום (₪)",
  attribution_strength: "חוזק הייחוס למקור",
  outcome_link: "קשר לתוצאה",
  implementation_verified: "ביצוע אומת",
  outcome_verified: "תוצאה אומתה",
  metric_name: "מדד",
  unit: "יחידה",
  period: "תקופה",
  period_type: "סוג תקופה",
  period_start: "תחילת תקופה",
  period_end: "סוף תקופה",
  value: "ערך",
  geography: "גאוגרפיה",
  population: "אוכלוסייה",
  note: "הערה",
  observation_count: "מספר תצפיות",
  geographies: "גאוגרפיות",
  source_ids: "מקורות",
  latest_period_end: "תקופה אחרונה",
  name: "שם",
  entity_type: "סוג גוף",
  knesset: "כנסת",
};

// Comparison modes.
export const MODES = {
  now: {
    label: "מה מבטיחים עכשיו",
    short: "עמדות נוכחיות",
    note: "עמדות שהמפלגות פרסמו לקראת הבחירות לכנסת ה־26, זו לצד זו. התחייבות היא הצהרת כוונה בלבד, לא ראיה לביצוע.",
  },
  track: {
    label: "הבטיחו מול ביצעו",
    short: "התחייבות קודמת ופעולה",
    note: "התחייבות קודמת מוצגת לצד פעולה רק כשקיים במקור קשר מתועד ביניהן. פעולות ממשלה שהמקור אינו משייך למפלגה מוצגות בעמודה נפרדת ולא בתא של מפלגה.",
  },
  outcomes: {
    label: "מה קרה בפועל",
    short: "מדדים אובייקטיביים",
    note: "מדדי מערכת בהגדרה אחידה, זהה לכל שחקן פוליטי. זו אינה טבלת ציונים: הצגת מי החזיק בסמכות בתקופה אינה קביעה שהוא גרם לשינוי.",
  },
};

// Evidence statuses: how far the documented evidence goes. Not scores.
export const EVIDENCE_STATUS = {
  promise_documented: { label: "התחייבות מתועדת", hint: "המפלגה פרסמה כוונה. אין בכך ראיה לביצוע." },
  proposed: { label: "הוצע", hint: STATUS.proposed.hint },
  target: { label: "יעד בתוכנית", hint: STATUS.target.hint },
  approved: { label: "אושר", hint: STATUS.approved.hint },
  budgeted: { label: "תוקצב", hint: STATUS.budgeted.hint },
  implemented: { label: "בוצע", hint: STATUS.implemented.hint },
  outcome_measured: { label: "מדד נמדד", hint: "קיימת תצפית מדד רשמית. אין בכך ייחוס לגורם כלשהו." },
  not_verified: { label: "ביצוע לא אומת", hint: "קיימת התחייבות, אך לא נמצאה פעולה מתועדת שמקושרת אליה." },
  insufficient: { label: "אין די ראיות", hint: "המידע במאגר אינו מספיק כדי לקבוע את מצב הביצוע." },
};

export const AUTHORITY_ROLES = {
  head_of_government: "ראש הממשלה",
  minister: "שר/ה",
  deputy_minister: "סגן/ית שר",
  committee_chair: "יו״ר ועדה",
};

// Seed geographies are stored in English; display names only.
export const GEOGRAPHY = {
  Israel: "ישראל",
  "Haifa District": "מחוז חיפה",
  "Northern District": "מחוז הצפון",
  "Tel Aviv District": "מחוז תל אביב",
  "Jerusalem District": "מחוז ירושלים",
  "Central District": "מחוז המרכז",
  "Southern District": "מחוז הדרום",
};
