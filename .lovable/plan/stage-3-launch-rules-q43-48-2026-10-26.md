# Stage 3 launch rules Q43–48

## First: full regression baseline
- Run all 20 existing SQL suites with rollback-only fixtures and report each pass count. Fix actual regressions without weakening assertions or changing business data.

## Launch gates and owner approvals
- Enforce the P1–P9 Gate A lock in the database; keep P0 open and all locked tasks readable with the requested label.
- Restrict Gate A sign-off to BD Manager. Unlock P1–P9 together and recalculate calendar-day due dates using their existing offsets from sign-off.
- Add Admin/Management single-task overrides requiring a reason and recording actor, time and task in the audit log.
- Accept a gate approval file or the hotel owner's Approve action, recording which method was used.

## Live clients and owner view
- Keep existing live clients “Live, no checklist”, without generating or auto-completing launch tasks.
- Add dated per-pipeline pre-launch history with work description, optional evidence and author; exclude it from scores and gates.
- Show owners only action-required launch tasks, alongside progress calculated across the full launch. Preserve monthly activity plans from launch onward.

## Personal overdue digests
- Queue one personal Notifications/email digest per 11:00, 15:00 and 18:00 IST slot, Monday–Saturday excluding configured holidays, only when that person has overdue items.
- Keep emails held behind the existing switch; replace conflicting legacy 09:00 overdue notifications without removing blocked-task escalation rules.

## Offboarding
- The exact Annex B 16-item list was not found in the project or available uploads. Leave all 58 current items unchanged; do not invent replacements.

## Technical details and verification
- Preserve access guards, owner privacy, shared design components, commercial terms, commissions and plans.
- Use additive database changes and protected actions. Keep SQL test fixtures rollback-only and retire any temporary verification capability after checks.
- Add concrete SQL tests for gate locking, override audit, sign-off dates, digest recipients/calendar/idempotency and owner filtering.
- Rerun every SQL suite and all unit tests; check the automatic TypeScript and production-build results (no manual build/typecheck commands).
- Verify signed-in staff and owner flows where credentials allow. Do not bypass the mandatory private-password change; report it as a verification blocker if still active.