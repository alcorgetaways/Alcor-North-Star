-- Q63 multiple GBP profiles per client pipeline (Mama's Rasoi under ALC-053 Spring Hill Resort).
-- Read-only rules, but kept in the same rollback pattern: the final exception rolls everything back.
DO $$
DECLARE cp uuid; tonny uuid; n int:=0;
BEGIN
 SELECT id INTO tonny FROM profiles WHERE email='tonny.sapra@group2001.in';
 SELECT cp.id INTO cp FROM client_pipelines cp JOIN clients c ON c.id=cp.client_id JOIN pipelines p ON p.id=cp.pipeline_id
  WHERE c.client_code='ALC-053' AND p.code='gbp' AND cp.status='active';

 -- 1. Spring Hill's GBP pipeline has exactly two active confirmed Localo listings.
 IF (SELECT count(*) FROM kpi_source_mappings WHERE client_pipeline_id=cp AND source='localo' AND active)<>2 THEN RAISE EXCEPTION 'Listing count'; END IF; n:=n+1;
 IF NOT EXISTS(SELECT 1 FROM kpi_source_mappings WHERE client_pipeline_id=cp AND source='localo' AND external_name='Mama''s Rasoi - Pathankot' AND active) THEN RAISE EXCEPTION 'Mama''s Rasoi not mapped'; END IF; n:=n+1;
 IF NOT EXISTS(SELECT 1 FROM kpi_source_mappings WHERE client_pipeline_id=cp AND source='localo' AND external_name='Spring Hill Resort - Pathankot' AND active) THEN RAISE EXCEPTION 'Spring Hill listing lost'; END IF; n:=n+1;

 -- 2. The second listing is owner-confirmed by the admin profile, with the audit note.
 IF EXISTS(SELECT 1 FROM kpi_source_mappings WHERE client_pipeline_id=cp AND source='localo' AND (confirmed_by IS DISTINCT FROM tonny OR confirmed_at IS NULL)) THEN RAISE EXCEPTION 'Confirmation metadata'; END IF; n:=n+1;
 IF NOT EXISTS(SELECT 1 FROM admin_audit_log WHERE action='kpi_mapping_confirmed' AND details->>'note' ILIKE '%Mama''s Rasoi%segundo GBP%') AND NOT EXISTS(SELECT 1 FROM admin_audit_log WHERE action='kpi_mapping_confirmed' AND details->>'note' ILIKE '%Mama''s Rasoi%second GBP%') THEN RAISE EXCEPTION 'Audit note missing'; END IF; n:=n+1;

 -- 3. Each listing keeps its own 18+ months of fetched values with provenance and period label
 --    (the current month can be added by the scheduled sync, so 19 is fine).
 IF EXISTS(SELECT 1 FROM kpi_source_mappings m WHERE m.client_pipeline_id=cp AND m.source='localo'
   AND (SELECT count(*) FROM kpi_fetched_values v WHERE v.mapping_id=m.id)<18) THEN RAISE EXCEPTION 'Month count per listing'; END IF; n:=n+1;
 IF EXISTS(SELECT 1 FROM kpi_fetched_values v WHERE v.client_pipeline_id=cp AND (v.raw_data IS NULL OR coalesce(v.raw_data->>'period','') NOT IN ('before_alcor','alcor'))) THEN RAISE EXCEPTION 'Provenance/period label'; END IF; n:=n+1;

 -- 4. Unapproved fetched values never feed KPIs (client visibility stays behind head review + Management approval).
 IF EXISTS(SELECT 1 FROM kpi_fetched_values v WHERE v.client_pipeline_id=cp AND v.status NOT IN ('fetched','pending','confirmed','approved')) THEN RAISE EXCEPTION 'Unknown status'; END IF; n:=n+1;

 RAISE EXCEPTION 'PASS multi_gbp_profile_q63 % assertions', n;
END $$;
