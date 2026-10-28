## Final pre-publish staff QA (26 Oct)
- [ ] Other 10 staff preview sessions — blocked: specific-user session approval unavailable; eight require first-login password change; never bypass
- [x] Mohnish: 40 sidebar pages render, no console/4xx/5xx, zero writes; 21/21 active-launch hotels; GBP/Social single-property search + URL persistence + trend verified; admin has no forbidden staff URLs
- [x] Unit 198/198 (35 files), standalone tsgo clean, 38 staged SQL suites pass; automatic build OK
- [x] Fixed Social verified-key mismatch and Main/All source display with three regressions; existing access/scoring/source records unchanged
- [x] IST 27 Oct 11:00 digest read-only preview: Anju/Nisha each 4 overdue + 4 today + 8 upcoming; Nisha backup labels; wrong-assignee count 0; other requested staff empty; email switches false
- [x] Staging cleared and temporary runner retired; no publishing, sending, owner sessions, password/account changes

## Verification turn (26 Oct) — all done
- [x] Blank-screenshot investigation: no crash; /gbp and /actions render with zero console/page errors (earlier blanks were a timing artifact)
- [x] All 11 remaining SQL suites passed (counts in chat report); launch_phases expectations updated for Anju's 21 GBP templates (523→544 total) and re-passed 27/27
- [x] Re-ran suites touched by today's changes: source_backfill_q57b 8/8, multi_gbp_profile_q63 8/8
- [x] Unit tests 69/69, tsgo clean, build OK
- [x] Localo retry: Medicare implant-centre month 2026-06-01 already stored (18/18 months) — no retry needed

## Done — Mama's Rasoi second GBP profile (26 Oct)
- [x] Localo retry confirmed: last Medicare implant month (2026-06-01) stored
- [x] Mama's Rasoi – Pathankot mapped as 2nd Localo profile under ALC-053 Spring Hill (owner instruction 26 Oct, audit-logged)
- [x] 18 months backfilled with period labels; provenance fixed via delete+re-insert (guard blocks UPDATE)
- [x] UI shows all GBP listing names per client: /gbp, client GBP tab, FetchedKpiReview headings (verified live: "Spring Hill Resort — Spring Hill Resort - Pathankot · Mama's Rasoi - Pathankot")
- [x] New suite multi_gbp_profile_q63.sql 8/8; q57b mapping counts updated (47/28/19)
- [x] Q64: Fetched-from-Localo/Metricool 18-month panels on /gbp and /social, pre-filled entry form, per-month Mark reviewed (back months any time), staff charts show unapproved months; portfolio duties labelled "All GMB profiles"; test hotels hidden from GBP/Social lists (fetched_review_q64 9/9)
- [x] GBP & Social performance dashboards (portfolio + client, keyword rankings, Alcor impact); Q65 RLS suite 7/7
- [x] Marketing performance on management/BD dashboard, role landings, client Performance tab; Q66 per-role RLS 10/10

## Done — dashboard speed + visibility recheck (26 Oct)
- [x] Server-side monthly totals for GBP/Social portfolio + management blocks (same access rules), index, 5-min caching
- [x] Per-person visibility suite marketing_visibility_q67.sql 37/37 (raw reads and new summary match)
- [x] All 30 SQL suites, unit 84/84, TypeScript, build

## Design pass 1 of 3 (26 Oct) — presentational only
- [x] Motion tokens + reduced-motion, format module, MetricCard / ProgressRing / ConfirmButton / SegmentedPill / AlertStack / skeletons (+ /styleguide)
- [x] /my-growth, /home, /my-launch redesigned; placeholder cards removed; activity plans/baselines moved below main content
- [ ] Owner-account screenshots — declined; only Manu may approve owner-account sign-in

## Design pass 2 of 3 (26 Oct) — staff decision pages, presentational only
- [x] /dashboard, /clients/$id, /sales, /my-performance, /reports/$id, /gbp funnel, /review, shared SegmentedPill swaps
- [x] tsc, build, unit 121/121, q67 49/49, access_pages_rls 21/21, staff_scopes 8/8, admin screenshots desktop+390px

## QA fix batch Q70 (26 Oct) — calculations & data integrity
- [x] L1–L14, L16, L18 fixed; qa_calc_q70.sql 31/31; all 33 SQL suites pass; unit 140/140; tsc/build clean
- [ ] L4 apply missed revisions (Dental centre, Yogu's Woodside) — waits on Manu (sheet Q68)
- [ ] L6 inactive clients with active pipelines — statuses wait on Manu (sheet Q70)
- [ ] L11 already-submitted Yogu's Woodside Oct report — waits on Manu (sheet Q69)
- [ ] L17 lists only (launches without tasks/Day 0, clients without BD owner) — owner to assign

## QA flows & forms batch (26 Oct) — not published
- [x] Nov dry-run 112 vs 122 explained (suite fixtures) and fixed; P0 QA-01; P1 QA-02/03; P2 QA-04–19; P3 25,26,27,29,30,34, lint ota dep, 4xx no-retry, constants
- [x] Remaining P3 code fixes implemented in pass 3; launch memo lint has no dependency warning

## Design pass 3 and remaining P3 fixes (26 Oct) — implemented, not published
- [x] Shared URL property filter: GBP, Social and dashboard; selected-hotel chart/keywords and clarified funnel; refresh verified as admin
- [x] Requested staff-page updates: rings, confirmation controls, notifications grouping, report pagination, MRR hero, overdue summaries, OTA chart, pipeline sparklines
- [ ] Sync batch n/26 progress — current single-request flow has no per-profile progress signal; show honest busy state, not invented progress
- [ ] Optional map skipped as permitted (city ambiguity/lookup effort)
- [x] QA-21–24, 31–33, 35–37, 39 code fixes; new form tests, fetch-all regression and atomic follow-up SQL suite
- [ ] Dedicated regression tests for QA-22, QA-23 and QA-36 remain
- [x] Unit 171/171, all 36 staged SQL suites passed; automated typecheck/build OK; temporary runner retired and staging emptied
- [x] Admin desktop/390px screenshots on ten pages, no console errors; property URL refresh verified on GBP/Social/dashboard; no owner login, publishing or email enabling

## Current turn (26 Oct) — leftovers + Main KPIs (Manu)
- [x] /data-sync batch sync counts: shared historyPlan() drives runner + live n/N pill (4 unit tests)
- [x] Regression tests QA-22 (shared isGateLocked, fail-closed), QA-23 (GateSheet internal reset), QA-36 (QueryErrorAlert) — 5 tests pass
- [x] Reservation Desk 390px: per-associate cards on mobile, table on sm+; verified in browser
- [x] A. kpi_definitions: is_main + main_position, add missing definitions (no deletes, scoring unchanged)
- [x] B. Main/All scoped display added across pipeline/client/owner/report/PDF; management portfolio additive totals and Corporate Comms hotel counts. Admin desktop/390px and PDF download verified; no owner login.
- [x] C. Localo sync: BUSINESS_CONVERSATIONS→chat_clicks, BUSINESS_BOOKINGS→booking_clicks; 18-month backfill, new keys only, no overwrites, skip running month
- [x] D. Official offset-aware Metricool subscriber/view/interaction timelines and additive backfill: 280 complete months across 19 brands; channel definitions added unscored. Unsupported channel metrics remain blank.
- [x] E. Unit 195/195; all 38 staged SQL suites passed, Q74 11 and Q75 7 assertions; automatic build OK. Admin desktop/390px dashboard/Corp/Social/client/report, no console errors or overflow; PDF Main-before-All verified. Temporary runner retired and staging emptied. Standalone tsc not run (harness-managed).
- [x] No publishing; both email switches remain false.

### KPI Center verified results / remaining work
- Localo: 486 complete mapping-month rows across 27 profiles received chat/booking keys (972 keys); totals 0 chat and 0 booking clicks. Cabana not_verified blocks its Localo history.
- Metricool: 266 existing months across all 19 mapped brands received verified format-list extras. No failed writes; originals win on key collisions.
- [x] Official Metricool timelines verified: Instagram account views 2,935 and interactions 130 on Sep 30; follower Sep29→30 delta +3. LinkedIn publication impressions 933 and YouTube published-in-range views 25 differ from supplied account figures; do not relabel them as account-wide values.
- [x] Localo chat/booking precedence tested: source 0 wins over manual 99; manual fallback only when source absent. Other GBP precedence unchanged.
- [x] Metricool additions: 2,069 keys across two additive passes; 14 missing months inserted, 62 absent months had no numeric nonzero evidence and were left missing. 1,593 channel timeline keys retained in extras, plus source keys in the 14 new rows. Full per-brand coverage in final report.
- [ ] Cabana Affair Localo not_verified — Manu must re-verify. Metricool Cabana subscriber/interaction/publication timelines unavailable; values left blank.
- [ ] Exact supplied Facebook 786 / LinkedIn 62 / YouTube 30 daily account metrics remain unmatched by official publication timelines; no fabricated equivalence.
- Admin owner-page sign-in remains declined; isolated SQL owner tests passed, no real owner login.

## Testing feedback batch 2 (27 Oct) — not published
- [x] Gate A needs only P0 tasks due by its week (gate_a_scope_q76 2/2); open Gate A statuses refreshed
- [x] Launch board columns shown as Steps; closed-client banner; All clients hides fully closed hotels (database already blocks edits on closed launches)
- [ ] Remaining later batches: Batch 4 (minus GMB task screens), Batch 5 evidence, Batch 6 Localo/Metricool (needs 1–2 mismatch examples)

## Batch 3 historical clients (27 Oct)
- [x] Corrected historical live-client/payment labels and flagged missing evidence; 20 hotels (prior 21 included Demo Hotel, untouched)
- [x] 2,319 plan/custom-service-scoped historical Done snapshots (Option A); operational tasks, gates, dates and scores untouched
- [x] 199 unit tests, Q77 10/10 SQL checks, automatic build OK; admin preview board 100% and read-only task dialog verified; no publishing/email sending

## Batches 4–6 (27 Oct) — in progress
- [x] Batch 4: report types already present; /gbp entry form grouped into Photos & posts / Reviews & reputation / Actions & reach; duty tasks renamed GMB SEO tasks
- [x] Batch 5: Action Tracker evidence — image/PDF upload to client-files or link; signed-URL open; shared src/lib/evidence.ts + tests
- [x] Batch 6: Metricool audit — Pinterest was dropped from counts (fixed: posts/pinterest list + brand-summary); counts now deduped by id and restricted to in-period rows; stored zeros removed (missing ≠ zero). Correction pass: 291 months audited across 19 brands, 79 corrected, 0 failed, rerunnable (0 changes on re-run), previous values preserved in raw_data.previous_fetch, every change logged in kpi_sync_runs. Cherilyn Aug 2026: pinterest.posts 3 restored (total now 35 incl Pinterest); YouTube 2 vs PDF 1 = refresh difference (both videos dated in Aug, no cross-month leak), not a defect. Dashboard breakdown now shows Pinterest pins / YouTube videos / LinkedIn posts. metricool_correction_q78 9/9; unit 206/206; build OK; verified as admin. No publish, no client notifications.
