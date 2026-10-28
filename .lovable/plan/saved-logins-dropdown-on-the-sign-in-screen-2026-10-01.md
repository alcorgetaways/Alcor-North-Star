# Saved logins dropdown on the sign-in screen

## Important limit
North Star cannot show or export anyone's password — passwords are stored scrambled one-way and nobody (including the app) can read them back. So a "list of all passwords" file isn't possible.

What does work: your browser's own password manager (Chrome, Safari, Edge). Once each login is saved there, clicking the email box shows a dropdown of every saved account and fills the password automatically.

## What I'll change
1. Make the sign-in form fully "password-manager friendly" so the browser reliably offers "Save password?" after every successful login (Team and Client both).
2. Clicking the email box then shows the browser's dropdown of all saved accounts on that device.
3. Add a small "Recent accounts" list under the email box (emails only, remembered on this device) — one tap fills the email; the browser fills the password. A small x removes an entry.

## How you get everyone saved
- Sign in once with each account on your computer and click "Save" when the browser asks.
- For accounts whose password you don't know, use "Forgot password?" or I can add an admin "Set temporary password" button in Team management (ask if you want it).

## Technical details
- Email input: `name="email"`, `autoComplete="username"`; password: `name="password"`, `autoComplete="current-password"`; form `method="post"` with `action` so Chrome/Safari detect a login form.
- After successful sign-in, push email into `localStorage` key `ns_recent_logins` (max 10, emails only, never passwords), read in `useEffect`.
- No database changes.
