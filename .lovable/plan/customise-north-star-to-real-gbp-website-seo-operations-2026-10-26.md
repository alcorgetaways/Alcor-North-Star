# Customise North Star to real GBP / Website-SEO operations

Owner-approved feedback from Anju (GBP head). No publish, no emails, no changes to terms/commissions/plans. Shared design components; scoped access unchanged except adding Anju/Nisha to GBP clients.

## 1. GBP report types
`gbp_reports.kind` currently allows `nap` / `yearly_growth` (list in `src/lib/gbp.ts`, no DB CHECK found — verify). Add kinds: `gmb_audit` (GMB Audit Report), `monthly` (Monthly Report), `growth_plan_12m` (12 Month Growth Plan Report), `progress` (Progress Report); keep `nap`, rename nothing existing. If `kind` has a CHECK constraint, widen it via migration (drop + re-add, additive values only). Existing rows untouched.

## 2. GBP onboarding checklist (Anju's 21-item list)
- `checklist_templates` rows are keyed by plan + `pipeline_code`/`module_code` with `active` + `superseded_by` columns — use them.
- Migration: mark the existing GBP (`gmb`) onboarding templates `active=false` (not deleted); insert Anju's 21 items in her order, phase onboarding, for each plan that includes the GMB module. New launches generate from the new list via the existing `activate_client_launch` template read. Existing client task history untouched.
- Assumption: items map onto the existing week/offset model with sensible Mon–Sat working-day offsets per Q33 rules; no gates added.

## 3. Bug: Website SEO KPIs under GMB KPI Targets
Find the targets page grouping (`targets.tsx` / KPI target queries) and filter by the KPI's own pipeline instead of inheriting the section pipeline. GBP targets show only `gmb` KPIs; Website SEO targets only `website_seo`.

## 4. Client list for Anju (~28 profiles)
- (a) Ensure every client with an active `gmb` `client_pipeline` — including the five Excel sub-properties whose client status is "inactive" — is visible to the GBP head/team: assign Anju (head) and Nisha (team member) via `client_staff_assignments` / `client_module_assignments`; adjust the GBP client-list query to include active-pipeline clients regardless of client `status`.
- (b) Add nullable `clients.gbp_profile_name` (text); display under the hotel name in GBP views. Fill from the confirmed `kpi_source_mappings.external_name`, overridden by Anju's 18 supplied names where given. "Mama's Rasoi - Pathankot": verify against Localo profiles (read-only); report whether it is a separate Spring Hill profile — do not guess.
- (c) Add three internal clients: `clients.is_internal=true` (new column, default false), status active, GBP pipeline active, Anju + Nisha assigned, no plan/billing. Exclude `is_internal` from hotel MRR, sales and hotel counts (finance_overview / dashboards — same pattern as `is_test`). Map each to its Localo profile (confirmed_by owner admin, same note convention) and backfill GBP history like the other clients — without "before Alcor" labelling.

## 5. Rename
GBP pipeline screens: change the "Launch checklist" / "Launch board" heading to "Onboarding Task List" (label-only).

## 6. Task create/update on GBP pages
Add create-task (title, client, owner, backup, due date, frequency one-off/daily/weekly/monthly) and progress update (not started / in progress / blocked+reason / done+evidence link) on the GBP pipeline page and client GBP section, writing to the existing `client_tasks` / `recurring_tasks` model with existing guards and permissions (Q43 Gate A lock still applies to launch-phase tasks; ad-hoc recurring tasks follow the Q33 model).

## 7. Recurring task templates (per-person, Q33 rules)
Store Anju/Nisha's lists as recurring task definitions (new table `recurring_task_templates`: person, title, pipeline, frequency, day-of-week/date rules, per-profile flag, active) and generate `recurring_tasks` occurrences Mon–Sat minus admin holidays.
- Frequencies: Daily (Anju: review replies, group checks, appeal follow-ups; Nisha none daily), Weekly (Saturday due where stated), Monthly, plus "Ongoing" = one always-open task per person per item, no due date, shows age since opened, staff log updates against it.
- Per-profile tasks (citations, posts, pictures, offers): decision — generate ONE task per person per period with a numeric count target in the title/notes (simpler than one task per client), e.g. "4 citations per GMB profile (target 4 × N profiles)". State this in the report.
- "Create on BD request" (detailed GMB audit for prospects): template exists but generates nothing; BD request creates the task.

## 8. KPIs pages
- (a) Website SEO KPI set: add new `kpi_definitions` for blogs published (target 8/mo), keyword rankings top-10 count, GSC clicks, GSC impressions, technical issues fixed, backlinks built (100/wk), SEMrush site health; mark old website_seo KPI definitions inactive (not deleted). Existing entries untouched.
- (b) Help panel component (shared) at top of Website SEO KPIs and Monthly KPIs pages: what the page is / who fills it / when / how progress is tracked.
- (c) Action Tracker upgrade (`actions.tsx` + `action_items`): add fields via nullable columns — client, pipeline, owner, due date, priority, linked KPI/red month, status (open/in_progress/done+evidence/dropped+reason), overdue highlight, filters by owner/client; same help panel with the supplied wording.

## 9. Tests & checks
- New SQL suite (rollback-only): GBP template replacement (old inactive, 21 new in order), recurring generation incl. ongoing tasks and Saturday/20th/30th rules, task create/update permissions, internal-client exclusion from MRR/counts, report kinds accepted.
- Then run ALL 25 SQL suites, unit tests, tsc, build.

## Deliverables in the report
- Mappings/backfill counts for the three internal clients; Mama's Rasoi finding; per-suite pass counts; unit/tsc/build status; the 5-line plain-English explanation of Action Tracker, Website SEO KPIs and Monthly KPIs for Anju.
