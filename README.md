# Knesset26 Election Audit – Seed Data Pack v0.1

Generated: 2026-10-01

This pack is intended as a neutral, evidence-first dataset for the `kneset26` project.

## Files

- `parties.csv` — parliamentary factions plus election-campaign entities represented in the seed.
- `commitments.csv` — documented commitments extracted from party-controlled sources.
- `actions.csv` — official government decisions, budget entries and work-plan targets.
- `metrics.csv` — official public metrics from CBS, police/data.gov.il and Knesset committee reporting.
- `sources.csv` — source registry with URLs and provenance.
- `election_audit_seed.json` — all datasets combined.

## Counts

- parties/entities: 15
- commitments: 49
- actions: 7
- metrics: 70
- sources: 29

## Methodology

1. A **commitment** records what a party says it intends to do.
2. An **action** records a documented government/parliamentary/budget/work-plan act.
3. A **metric** records an observed public outcome or system measure.
4. The pack does **not** infer that an action caused a metric change.
5. Missing platform data should remain missing rather than being inferred.
6. Party-controlled sources are labeled `party_primary`; official state sources are `official_primary`.
7. Some figures refer to different years because official statistical publication lags differ by domain.

## Suggested next ingestion layers

- Central Elections Committee candidate lists for Knesset 26.
- Full Knesset legislation/OData extraction.
- Government-decision task execution tracker.
- Police crime datastore aggregation by offense / locality / per-capita denominator.
- CBS API time series for CPI, housing, health, education, transport.
- Additional official 2026 party platforms and policy papers.

## Important caveats

- This is a **seed**, not a complete election database.
- `actions.csv` contains actions and targets that were easy to verify from primary sources in this pass; implementation/completion should be tracked separately.
- For political claims, always display source and date in the UI.
- Never convert this dataset into a party ranking or recommendation.
