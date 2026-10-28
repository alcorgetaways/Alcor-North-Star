-- Q78: Batch 6 Metricool correction — Pinterest added, counts deduped/in-period, provenance preserved.
DO $$
DECLARE
  v_cherilyn_cp uuid := '78186f6e-5bd8-4c0e-a501-e6746a5af2a7';
  v_aug record;
  v_zero_posts int;
  v_corrected_missing_prev int;
  v_logs int;
  v_pin_extras int;
  v_marker int;
BEGIN
  -- 1. Cherilyn Monta Aug 2026 now carries the 3 Pinterest pins the PDF documents.
  SELECT * INTO v_aug FROM kpi_fetched_values
  WHERE client_pipeline_id = v_cherilyn_cp AND month = '2026-08-01' AND source = 'metricool';
  ASSERT v_aug.id IS NOT NULL, 'Cherilyn Aug 2026 row missing';
  ASSERT (v_aug.fetched_values->>'pinterest.posts')::int = 3, 'Cherilyn Aug 2026 pinterest.posts must be 3';
  ASSERT (v_aug.fetched_values->>'instagram.posts')::int = 9, 'Cherilyn Aug 2026 instagram.posts must stay 9';
  ASSERT (v_aug.fetched_values->>'facebook.posts')::int = 15, 'Cherilyn Aug 2026 facebook.posts must stay 15';

  -- 2. Missing is never stored as zero: no metricool platform post count of 0 remains.
  SELECT count(*) INTO v_zero_posts FROM kpi_fetched_values f
  WHERE f.source = 'metricool'
    AND EXISTS (SELECT 1 FROM jsonb_each_text(f.fetched_values) e
                WHERE e.key ~ '^(instagram|facebook|youtube|linkedin|pinterest)\.posts$' AND e.value = '0');
  ASSERT v_zero_posts = 0, 'zero post counts must be removed, not stored';

  -- 3. Every corrected row preserves the previous values under raw_data.previous_fetch.
  SELECT count(*) INTO v_corrected_missing_prev FROM kpi_fetched_values
  WHERE source = 'metricool' AND raw_data ? 'correction_batch6'
    AND NOT (raw_data->'previous_fetch' ? 'values');
  ASSERT v_corrected_missing_prev = 0, 'corrected rows must keep previous_fetch values';

  -- 4. Every correction is logged in kpi_sync_runs with the Batch 6 reason.
  SELECT count(*) INTO v_logs FROM kpi_sync_runs WHERE detail LIKE 'Batch 6 correction:%';
  ASSERT v_logs >= 79, 'expected at least 79 Batch 6 correction log entries';

  -- 5. Pinterest extras merged additively for Cherilyn Aug 2026.
  SELECT count(*) INTO v_pin_extras FROM kpi_fetched_extras x
  JOIN kpi_fetched_values f ON f.id = x.fetched_value_id
  WHERE f.client_pipeline_id = v_cherilyn_cp AND f.month = '2026-08-01'
    AND (x.extra_values->>'pinterest.posts')::int = 3;
  ASSERT v_pin_extras = 1, 'Cherilyn Aug 2026 pinterest extras missing';

  -- 6. Correction marker makes the pass rerunnable without double-applying.
  SELECT count(*) INTO v_marker FROM kpi_fetched_values
  WHERE source = 'metricool' AND raw_data ? 'correction_batch6';
  ASSERT v_marker >= 79, 'corrected rows must carry the correction_batch6 marker';

  RAISE EXCEPTION 'PASS metricool_correction_q78 (9 assertions)';
END $$;
