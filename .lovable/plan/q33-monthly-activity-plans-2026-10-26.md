# Q33 — Monthly Activity Plans

## Confirmed launch calculation
Launch deadlines already use **Day 0 + 7 × week number**, which counts calendar days. Leave this unchanged and add a regression test.

## Monthly planning and approval
- Add a monthly plan for each client’s included, client-facing pipeline.
- Pipeline heads enter activity type (admin-maintained pipeline list or free text), quantity, and a fixed date for each occurrence.
- Show owner, backup, daily/weekly/monthly planned quantities, and approval status.
- The hotel owner approves or requests changes with a comment. Management can monitor status but cannot substitute for owner approval.
- Generate no tasks before owner approval. Editing an approved plan creates a new version for approval; completed work remains in history.

## Generated work and deadlines
- Generate preparation, approval, and publish/do tasks for each occurrence.
- Keep publish/do dates exactly as approved, including Sundays and holidays.
- Calculate preparation 5 working days before and approval 2 working days before; working days are Monday–Saturday excluding the admin holiday list.
- Default owner and backup from that client’s pipeline assignments. Require two assigned people before submission; show missing assignments rather than inventing them. Heads can choose different assigned people.
- Treat the generated approval task as the internal pre-publication approval step; hotel-owner approval of the monthly plan is separate.
- Preserve on-hold restrictions. Superseded unfinished work remains in history and is excluded from current-plan targets; completed tasks are never deleted or generated twice.

## Screens and tracking
- Use shared components for monthly plans on the client record and pipeline pages, and owner approval in the owner portal.
- Include generated work in My Tasks and person scorecards; show published/done versus planned quantities and on-time percentage without counting preparation and approval as published deliverables.
- Include recurring task deadlines in relevant existing tasks-on-time scorecard calculations.
- Add admin maintenance for holidays (date and name) and per-pipeline activity types.
- Flag unfinished tasks at month end as **Missed — review**. Heads can reschedule or close them with a reason; never automatically carry work into another month.

## Technical approach and safeguards
- Add separate versioned activity-plan, occurrence, recurring-task, holiday and activity-type records; leave existing launch tasks, client records, commercial plans and commissions unchanged.
- Enforce owner-only approval, assignment-based staff access, required owner/backup, version transitions and idempotent generation in protected database operations and scoped policies.
- Calculate dates and completion totals centrally; use the existing central page-access map for new maintenance screens.
- Do not send or queue emails for this work.

## Verification
- Add Q33 SQL tests for calendar-day launch dates, working-day offsets across a Sunday and holiday, fixed weekend publish dates, owner/assignment isolation, no pre-approval generation, owner and backup, version/history preservation, completion totals, and reasoned missed-task review.
- Run all SQL suites through the staged rollback method, unit tests and automatic typecheck/build checks.
- Exercise approval → task generation → completion → displayed totals in the preview when an eligible signed-in account has completed its required private-password change. Do not bypass that requirement or change another private password to test.