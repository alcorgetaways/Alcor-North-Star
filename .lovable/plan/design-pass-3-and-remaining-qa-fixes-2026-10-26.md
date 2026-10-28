# Design pass 3 and remaining QA fixes

## Boundaries
- Preserve existing visibility, calculations, stored values, task rows and history. Design work stays in presentation code; QA fixes change only the affected flows.
- Do not publish, change existing passwords, or enable either email switch.
- Verify using the requesting admin’s account only; do not sign in as any hotel owner.

## 1. Property filter first
- Add a shared searchable **Properties** multi-select next to the period control on GBP, Social and the dashboard marketing block. Default to all visible properties, with an **Include internal profiles** toggle.
- Store selection in validated URL search parameters, preserving other parameters and browser back/refresh behavior. Options come from existing scoped reads, never from a broader hotel query.
- Filter the input to every existing marketing section before its existing calculations run: cards, funnel, freshness, comparison coverage, table, rankings and charts.
- With one property selected, show its trend and keyword panel inline and link to its full dashboard.
- Clarify the GBP funnel: views → interactions, conversion percentage, calls/website/directions as the interaction breakdown, and bookings explicitly not tracked.
- Add regression tests for selected-property funnel sums and URL round-trip, including internal profiles and unknown IDs.

## 2. Complete the staff-page design pass
- **KPI progress / Launch overview / Launch detail:** completion and week rings, existing deadline countdown, worst-first progress ordering, confirmed gate signing, accurate lock tooltip, primary actions plus More.
- **Data sync:** visible live fetch progress from available progress signals, status badges, mapping/fetch confirmations and independent busy states. Do not invent a fixed profile total when the visible total differs.
- **Weekly / OTA / Social entry / Pipeline KPIs:** confirmed Save/Approve, OTA bookings-and-revenue chart, available KPI-history sparklines and achievement rings; remove empty BD hints.
- **Actions / Activation requests:** overdue totals, confirmed evidence-backed completion/follow-up, collapsible help and nonduplicated status.
- **Notifications / Reports:** date grouping and counts; report summary chips and pagination without dropping rows.
- **Reservation desk / Finance / New client:** shared period control, overdue alerts and answer-rate bars, prominent MRR with no-history tooltip, confirmed Day 0 and activation.
- Reuse the shared design components and formatting; preserve the pages explicitly marked “leave as is” and keep ledgers/exports motion-free.
- Skip the optional portfolio map: a reliable city lookup and missing-location handling are outside this focused pass.

## 3. Finish the remaining QA fixes
First check which fixes already landed with the task-reminders work, then fix and test any remaining gaps:
- **QA-21–24:** handled dialog errors, required override reason, database-aligned lock labels, gate-state reset, blocker-only reason and friendly missing-date error.
- **QA-31–33:** explicit upload errors/size check/input reset, “All OTAs” row selection, valid evidence URLs and staff-only action assignees.
- **QA-35–37:** complete sales reads or an explicit truncation warning, real performance error state, access-consistent default pipeline.
- **QA-39:** transactional follow-up/contact creation using the existing scoped permission checks; no widening of access.
- Fix the launch page’s memo dependencies. Add one meaningful regression test per remaining fix.

## Technical approach
- Keep marketing filtering shared and separate from the existing analytics mathematics; use validated TanStack search state rather than direct browser-history manipulation.
- Keep form rules in the existing shared rules module and tests beside it. Add component tests for state-reset/error behavior where pure-rule tests would not prove the flow.
- For any required QA database change, use an additive migration with explicit grants and retained caller checks; review the relevant SQL-test instructions before modifying suites.
- Record structural rules in AGENTS.md and maintain the task roadmap.

## Verification and report
- Run unit tests and every SQL suite using the staged, rollback-only method; retire the temporary runner and empty staging afterward.
- Inspect the automated type/build results; do not manually run project builds or typechecks.
- Capture ten changed pages as admin at desktop and 390px: GBP Performance, Social Performance, Dashboard, KPI progress, Launch overview, one Launch detail, Data sync, OTA, Actions and Reservation desk. Exercise property selection, refresh/back and one non-destructive central flow.
- Check console/page errors and horizontal overflow; do not perform irreversible production actions merely for screenshots.
- Give a short per-item completion report with test evidence and any genuinely blocked verification. Nothing publishes or sends email.