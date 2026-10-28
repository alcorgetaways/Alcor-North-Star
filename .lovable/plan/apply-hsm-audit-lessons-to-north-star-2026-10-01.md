# Apply HSM audit lessons to North Star

Most HSM issues (dark mode, funnel copy, CSV imports, call logs) don't exist here. North Star already has no dark mode default and almost no hard-coded colors. These are the items that do apply.

## 1. Confirm before deleting
- Deleting a checklist template in the Onboarding Library happens instantly today. Add an "Are you sure?" dialog.
- Same confirmation when removing a user's role / access in Team management.

## 2. Dashboards silently cut off data
- Management dashboard reads at most 5,000 weekly ad rows; MY GROWTH stops at 1,000 / 500. As data grows, lifetime spend, leads and cost per lead will quietly undercount.
- Fix: page through all rows (batches of 1,000) so totals are always complete.

## 3. Forgot password (missing today)
- Add "Forgot password?" on the sign-in screen and a public reset page.
- The reset page only accepts a new password when opened from a genuine reset email link (recovery session check) — the hole HSM had.

## 4. Server permission checks
- Re-verify every server action (invite user, set role, save/reveal credential) checks the caller's role before doing anything. Already the case today; add the same check to any new admin action (e.g. password reset by admin).

## 5. Colour token sweep
- Replace the few remaining hard-coded colour classes outside the base UI kit with Navy/Gold/success/danger tokens so contrast stays consistent.

## Not applicable
Dark theme bugs, funnel step tracking, fake social proof, CSV opt-in inflation, countdown copy — no equivalent in North Star.

## Technical details
- AlertDialog in `onboarding-library.tsx` and team page role removal.
- Helper `fetchAll(query)` looping `.range()` used in `dashboard.tsx` and `my-growth.tsx`.
- New public route `src/routes/reset-password.tsx`; listens for `PASSWORD_RECOVERY` event before showing the form; `auth.tsx` calls `resetPasswordForEmail` with `redirectTo: origin + /reset-password`.
- No database changes.
