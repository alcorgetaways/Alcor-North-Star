# Testing feedback — 13 items

Work in batches, safest first. Nothing is published or emailed. History is never deleted. Each fix gets a regression test.

## Batch 1 — Access (items 1, 6)
1. **alcorgetaways@gmail.com (Mayank) as co-founder**: add the admin and management roles next to his current role. Tonny's and Mohnish's access stays as it is. He lands on the same management dashboard, so he gets an identical view without a duplicate page. His actions are logged in the admin audit.
6. **B2B / Email Marketing**: list everyone who currently has access to it (names and roles), then add Ronak as a member of that pipeline. If more than one account matches Ronak, I'll ask you which one first.

## Batch 2 — Onboarding flow (items 2, 12, 3)
2/12. **Week grouping and Gate A**: the onboarding dashboard will show tasks by step order, not "Week 1, Week 2…". Week numbers stay for the roadmap only, after onboarding. Gate A will need only the Gate A access-and-baseline tasks (the Week 1 group). Later-week tasks will no longer hold it back. The Gate A lock on work after Gate A stays.
3. **Closed clients**: when a client is closed, its onboarding checklist becomes read-only. The database blocks edits, and the page shows a "Client closed" banner. Closed clients appear under the Closed tab, not under All clients.

## Batch 3 — Old clients (items 4, 5, 13)
- First I check each old client's real records: launch status, payment fields, tasks, and KPI months.
- Live old clients will show Live, not "In progress / Payment pending". Missing payment details get a review flag instead of made-up values (project rule).
- Their onboarding checklist is marked "Completed before North Star", with a clear label and no invented dates. Empty KPI history is reported per client. It is not filled with guessed numbers.
- Before applying anything, I share the list of affected hotels with you.

## Batch 4 — GBP workspace (items 7, 8, 11)
7. **New report types** on the new-report page: GMB Audit, NAP Audit, Monthly, 12 Month Growth Plan, and Progress Report.
8. **GMB task screens**: an "Add task" window plus a quick status and progress control on each row, using the existing task permissions and evidence rules.
11. **Anju's dashboard**: GMB SEO Tasks, Photos & Posts, and Reviews & Reputation each get their own section.

## Batch 5 — Action Tracker evidence (item 9)
- Evidence can be an image, a PDF or a link. Files go to private storage, and only people who can see that action can open them.

## Batch 6 — Localo / Metricool accuracy (item 10)
- I compare stored values with the live sources for 2–3 named hotels and months (read-only). Then I fix whatever mapping or calculation difference I find. Stored fetched data is re-fetched, not edited. I'll ask you for 1–2 examples where you saw a mismatch.

## Technical notes
- Roles go into user_roles. Pipeline access goes into pipeline_members, followed by an assignment recalculation.
- Gate A criteria are scoped to template tasks tagged for Gate A, enforced in the gate check. Plus a test.
- A closed-launch guard trigger on client_tasks covers the onboarding phase. The client list filters on the latest launch status.
- Report types are an additive enum or check change. The evidence bucket is private, with RLS through can_view_action.
- After changes: the related SQL suites, unit tests, tsc and build.
