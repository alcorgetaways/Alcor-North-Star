/** Password rule for the forced first-login change (Prompt 5 Part A). */
export function validateForcedNewPassword(
  current: string,
  next: string,
  confirm: string,
): string | null {
  if (next.length < 10) return "Your new password needs at least 10 characters";
  if (next === current) return "The new password must be different from the one you were given";
  if (next !== confirm) return "The two new passwords don't match";
  return null;
}
