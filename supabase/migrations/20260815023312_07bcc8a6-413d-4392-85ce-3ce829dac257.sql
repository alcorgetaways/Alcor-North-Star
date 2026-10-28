ALTER TABLE public.weekly_kpi_entries
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'google';

ALTER TABLE public.weekly_kpi_entries
  DROP CONSTRAINT IF EXISTS weekly_kpi_entries_channel_check;
ALTER TABLE public.weekly_kpi_entries
  ADD CONSTRAINT weekly_kpi_entries_channel_check CHECK (channel IN ('google','meta'));

ALTER TABLE public.weekly_kpi_entries
  DROP CONSTRAINT IF EXISTS weekly_kpi_entries_client_pipeline_id_week_start_key;
ALTER TABLE public.weekly_kpi_entries
  ADD CONSTRAINT weekly_kpi_entries_pipeline_week_channel_key UNIQUE (client_pipeline_id, week_start, channel);