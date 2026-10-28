# Regression checks, Who pays and launch safeguards

## First: establish why both tests fail
- Reproduce the exact failing assertions and compare today's Q31/Q33/password changes with the current hotel roster.
- Fix application regressions if found. Update a test only when its fixed historical fixture is no longer valid, retaining all access-denial assertions.
- Report the precise cause before implementing the remaining items.
- Reproduction: Yash residency was created at 06:53 UTC today, without an Account Manager, and has 44 onboarding tasks. None of the Q31/Q33 migrations or password reset creates this hotel. Fix the pre-existing missing default so Shalini is assigned to new real clients, repair Yash under that existing owner rule, and retain the assignment assertion unchanged. Scope the Palm Spring historical-count assertion (182) to Palm Spring, rather than all hotels; keep the global link/phase integrity checks.

## Requested changes
- Add the twelve-item Who pays reference, resolved using the effective plan version. Admins can edit “Includes reservations & sales tools”; default off, Diamond Scale on. Existing custom plans default off pending explicit admin confirmation, never inferred from their base plan.
- Show the reference on Plans, client records and alongside invoices.
- Add an influencer programme contract workflow per eligible launch: assigned head task, upload/link, owner approval, then goals for 3, 6 and 12 months. Display status on client records.
- Map BD templates and existing NULL BD task pipeline codes to Business Development, preserving task history.
- Require Gate D evidence in database enforcement for open tasks; preserve already-completed work and other gates.

## Technical details
- Additive schema and narrowly scoped RPCs; preserve existing permission and password gates.
- Use shared tables/forms/statuses and existing file storage controls.
- Add concrete rollback-safe SQL tests for plan resolution and evidence, run every SQL and unit suite, and inspect automatic typecheck/build results.
- Retire the temporary test runner after verification. No emails, commission edits or client-term changes.

## Verification limitation
Authenticated screen checks will respect the mandatory private-password change; no gate will be bypassed.