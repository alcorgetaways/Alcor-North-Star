# Q48 plan-specific exit checklists, followed by Q50–57

## Q48 — current priority
- Store the exact supplied items by plan: GMB SEO **9**, Diamond Start/Grow **10**, Diamond Scale **11**. Keep the existing 58 templates inactive and leave generated tasks and history untouched.
- Custom plans inherit the signed base plan's checklist; provide admin checklist editing without changing existing generated tasks.
- Generate a new checklist only when a closing/exit is newly recorded, including stages, owner side and exit-relative due dates. Never generate retrospectively for closed clients.
- Use the client's launch notice snapshot before plan defaults (GMB 90 days, Diamond 60); preserve early-notice warning without extending exit to the minimum-term date.
- Interpret “before exit” as **exit −1 calendar day**. Notice acknowledgement items with no stated offset are due on the notice date. The 15-working-day refund excludes Sundays and admin holidays, consistent with the existing Monday–Saturday calendar.
- Finance can see financial items; hotel owners see and act only on Hotel/Both items. Staff keep their existing authorized access.
- Require every exit item to be **Done** before full offboarding; only Admin can override with a reason recorded in the audit log. An override does not mark unfinished items Done.
- Test exact plan counts/Scale extra item, custom inheritance, 30-day client override, calendar offsets and 15-working-day refund, permissions and completion override. Run all SQL suites/unit tests and verify automatic TypeScript/build.
- Send no emails; preserve terms, commissions, plans and history. Signed-in checks must respect the mandatory private-password choice.

## Remaining KPI/report batch
The previously requested Q50–57 work remains queued below; the Q48 source now replaces the earlier missing-Annex-B limitation.

## What will change
1. **Approved baselines:** Add a first-reference month and KPI values for each contracted pipeline. Pipeline Managers enter and submit; Management/Admin approve. Approved edits require Management/Admin and an audit record. MY GROWTH shows actual, target and approved baseline together.
2. **Back-entry progress:** Preserve past-month entry through existing pipeline permissions and approval. Add a management view of required versus entered months per client and pipeline, percentage complete and **5 November 2026** deadline. Missing onboarding dates remain blank and flagged, not inferred.
3. **One owner report:** Preserve Management/Admin-only approval. AM review/comments remain optional and never block submission. Owners see one approved monthly report containing pipeline sections; its PDF contains the same approved information and excludes internal notes.
4. **Scorecards and dashboard:** Existing weights are confirmed as **50/20/20/10** and will remain unchanged. Confirm Green ≥90, Amber 70–89 and Red <70, with admin configuration. Add top three hotels and hotels with two consecutive red months alongside bottom three; missing months do not count as red.
5. **Owner home:** Add agreements/invoices under My documents and names-only Account Manager/pipeline heads under My team at Alcor, scoped to the owner's hotel.
6. **Automatic source data:** Add an admin Data sync page with Metricool/Localo profile lists, suggested name matches requiring explicit confirmation, sync history and errors. Retain fetched values/source/time separately from head corrections/editor and Management approval. Add fetched values to Social and GBP entry screens.

## Source verification and review
- Discover Localo tools with initialize and tools/list; allow only documented read-only performance, reviews and rankings tools. Confirm Metricool monthly endpoints from its API documentation before using them.
- Attempt one live read-only monthly fetch from each source. If no mapping is confirmed, report the result without writing client data; do not silently confirm a mapping.
- Backfill from known onboarding dates only as far as the service supports. Preserve missing/unsupported metrics rather than invent zero.
- Heads review the previous month on days 1–3, IST. After that window, confirmed data becomes available to Management for approval. Unconfirmed or unapproved data stays hidden from owners.
- Keep all credentials server-side and all emails switched off. Client terms, plans and commissions stay unchanged.

## Technical approach
- Extend existing database approval triggers, scoped RPCs and shared design components; preserve centralized page access and mandatory password-change checks.
- Use additive migrations with explicit grants and row-level security. Store source mappings, immutable fetch provenance, corrections and review/approval history separately from contractual data.
- Use protected server functions for admin/head actions and a secret-protected scheduled handler for monthly reads, with source-specific read-only adapters and sanitized error logging.
- Build combined owner report data through an owner-scoped RPC and use it for the screen and PDF.

## Validation and limitations
- Add rollback SQL tests for baseline lock/audit, report approval roles, combined owner scope, consecutive-red risk and fetched → corrected → approved visibility.
- Run every SQL suite and unit test, and verify automatic TypeScript/build results. Test source adapters and date/coverage rules with concrete assertions.
- Exercise signed-in flows when permitted. Existing accounts still requiring their private password choice will not be bypassed; any remaining verification limitation will be reported.
- No real historic KPI values will be entered by the agent unless fetched from a confirmed source mapping; team back-entry remains a staff responsibility.