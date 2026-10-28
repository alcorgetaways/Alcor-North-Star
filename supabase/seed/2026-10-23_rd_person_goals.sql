-- Reservation Desk personal goals, calendar year 2026 (from the Personal Performance Tracker sheets). Rerunnable.
INSERT INTO public.rd_person_goals (user_id, year, yearly_goal_inr, starts_on, flag, notes)
SELECT p.id, 2026, v.goal, NULL, v.flag, v.notes
FROM (VALUES
  ('aman@alcorgetaways.com', 20000000::numeric, NULL::text, 'Personal Performance Tracker sheet'),
  ('rahul@alcorgetaways.com', 18000000, NULL, 'Personal Performance Tracker sheet'),
  ('monika@alcorgetaways.com', 10800000, NULL, 'Personal Performance Tracker sheet'),
  ('book@alcorgetaways.com', 10000000, NULL, 'Personal Performance Tracker sheet (Tanuja)'),
  ('param@alcorgetaways.com', 10500000, NULL, 'Personal Performance Tracker sheet'),
  ('ankit@alcorgetaways.com', 6670000, 'Pro-rata goal; start date not recorded', 'Personal Performance Tracker sheet (pro-rata)'),
  ('neha@alcorgetaways.com', NULL, 'Goal to be set', NULL)
) v(email, goal, flag, notes)
JOIN public.profiles p ON p.email = v.email
ON CONFLICT (user_id, year) DO NOTHING;
