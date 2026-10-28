-- Main KPIs (Manu, KPI Center PDF): ordered "main" flag on kpi_definitions.
-- Additive only: no definition deleted or renamed; scoring untouched because new
-- definitions carry counts_toward_score = false and _refresh_report_kpis skips them.
alter table public.kpi_definitions
  add column is_main boolean not null default false,
  add column main_position integer,
  add column main_group text,
  add column counts_toward_score boolean not null default true;

create unique index kpi_definitions_main_pos_uq
  on public.kpi_definitions (pipeline_id, main_position) where is_main;

-- Flag existing definitions as main (positions follow Manu's KPI Center order).
update public.kpi_definitions d set is_main = true, main_position = 1 from public.pipelines p where p.id = d.pipeline_id and p.code = 'performance_marketing' and d.source_key = 'weekly.max.campaigns_live';
update public.kpi_definitions d set is_main = true, main_position = 2 from public.pipelines p where p.id = d.pipeline_id and p.code = 'performance_marketing' and d.source_key = 'weekly.sum.ad_spend';
update public.kpi_definitions d set is_main = true, main_position = 3 from public.pipelines p where p.id = d.pipeline_id and p.code = 'performance_marketing' and d.source_key = 'weekly.sum.leads';
update public.kpi_definitions d set is_main = true, main_position = 4 from public.pipelines p where p.id = d.pipeline_id and p.code = 'performance_marketing' and d.source_key = 'weekly.cpl';

update public.kpi_definitions d set is_main = true, main_position = 1, main_group = 'publications' from public.pipelines p where p.id = d.pipeline_id and p.code = 'social_media' and d.source_key = 'social.sum.posts';
update public.kpi_definitions d set is_main = true, main_position = 11, main_group = 'views' from public.pipelines p where p.id = d.pipeline_id and p.code = 'social_media' and d.source_key = 'social.sum.content_views';
update public.kpi_definitions d set is_main = true, main_position = 16 from public.pipelines p where p.id = d.pipeline_id and p.code = 'social_media' and d.source_key = 'social.sum.new_followers';
update public.kpi_definitions d set is_main = true, main_position = 17 from public.pipelines p where p.id = d.pipeline_id and p.code = 'social_media' and d.source_key = 'social.sum.engagement';

update public.kpi_definitions d set is_main = true, main_position = 1 from public.pipelines p where p.id = d.pipeline_id and p.code = 'ota' and d.source_key = 'ota.max.live_channels';
update public.kpi_definitions d set is_main = true, main_position = 4 from public.pipelines p where p.id = d.pipeline_id and p.code = 'ota' and d.source_key = 'ota.avg.ranking';
update public.kpi_definitions d set is_main = true, main_position = 5 from public.pipelines p where p.id = d.pipeline_id and p.code = 'ota' and d.source_key = 'ota.avg.content_score';
update public.kpi_definitions d set is_main = true, main_position = 6 from public.pipelines p where p.id = d.pipeline_id and p.code = 'ota' and d.source_key = 'ota.avg.conversion_rate';
update public.kpi_definitions d set is_main = true, main_position = 7 from public.pipelines p where p.id = d.pipeline_id and p.code = 'ota' and d.source_key = 'ota.avg.reputation_score';

update public.kpi_definitions d set is_main = true, main_position = 1 from public.pipelines p where p.id = d.pipeline_id and p.code = 'gbp' and d.source_key = 'gbp.views';
update public.kpi_definitions d set is_main = true, main_position = 2 from public.pipelines p where p.id = d.pipeline_id and p.code = 'gbp' and d.source_key = 'gbp.calls';
update public.kpi_definitions d set is_main = true, main_position = 5 from public.pipelines p where p.id = d.pipeline_id and p.code = 'gbp' and d.source_key = 'gbp.direction_requests';
update public.kpi_definitions d set is_main = true, main_position = 6 from public.pipelines p where p.id = d.pipeline_id and p.code = 'gbp' and d.source_key = 'gbp.website_clicks';

update public.kpi_definitions d set is_main = true, main_position = 1 from public.pipelines p where p.id = d.pipeline_id and p.code = 'whatsapp' and d.source_key = 'pke.campaigns_sent';
update public.kpi_definitions d set is_main = true, main_position = 2 from public.pipelines p where p.id = d.pipeline_id and p.code = 'whatsapp' and d.source_key = 'pke.delivered';
update public.kpi_definitions d set is_main = true, main_position = 3 from public.pipelines p where p.id = d.pipeline_id and p.code = 'whatsapp' and d.source_key = 'pke.read_rate';

update public.kpi_definitions d set is_main = true, main_position = 1 from public.pipelines p where p.id = d.pipeline_id and p.code = 'email_marketing' and d.source_key = 'pke.campaigns_sent';
update public.kpi_definitions d set is_main = true, main_position = 3 from public.pipelines p where p.id = d.pipeline_id and p.code = 'email_marketing' and d.source_key = 'pke.open_rate';
update public.kpi_definitions d set is_main = true, main_position = 4 from public.pipelines p where p.id = d.pipeline_id and p.code = 'email_marketing' and d.source_key = 'pke.click_rate';
update public.kpi_definitions d set is_main = true, main_position = 5 from public.pipelines p where p.id = d.pipeline_id and p.code = 'email_marketing' and d.source_key = 'pke.list_growth';

update public.kpi_definitions d set is_main = true, main_position = 1 from public.pipelines p where p.id = d.pipeline_id and p.code = 'reservations_desk' and d.source_key = 'pke.avg_response_min';
update public.kpi_definitions d set is_main = true, main_position = 2 from public.pipelines p where p.id = d.pipeline_id and p.code = 'reservations_desk' and d.source_key = 'pke.conversion_rate';

-- New definitions (never scored, never create report entries).
insert into public.kpi_definitions (pipeline_id, name, kpi_type, unit, direction, source_key, sort_order, active, is_main, main_position, main_group, counts_toward_score, definition)
select p.id, x.name, x.kpi_type, x.unit, x.direction, x.source_key, x.sort_order, true, true, x.main_position, x.main_group, false, x.definition
from public.pipelines p
join (values
  ('gbp','Chat clicks','number','count','higher_better','gbp.chat_clicks',8,3,'main','Chat (message) clicks from the Google profile; synced from Localo, manual entry only fills months Localo has no data'),
  ('gbp','Booking clicks','number','count','higher_better','gbp.booking_clicks',9,4,'main','Booking-link clicks from the Google profile; synced from Localo, manual entry only fills months Localo has no data'),
  ('ota','New channels','number','count','higher_better','ota.sum.new_channels',8,2,'main','Channels added during the month'),
  ('ota','Active channels','number','count','higher_better','ota.max.active_channels',9,3,'main','Channels live and selling during the month'),
  ('ota','Bookings','number','count','higher_better','ota.sum.bookings',10,8,'main','OTA bookings for the month'),
  ('ota','Revenue','currency','₹','higher_better','ota.sum.revenue',11,9,'main','OTA revenue for the month'),
  ('ota','YoY growth in bookings','percentage','%','higher_better','yoy.ota.bookings',12,10,'main','Bookings vs the same month last year, from approved months; N/A without last-year data'),
  ('ota','YoY growth in revenue','percentage','%','higher_better','yoy.ota.revenue',13,11,'main','Revenue vs the same month last year, from approved months; N/A without last-year data'),
  ('influencer','Influencers visited','number','count','higher_better','pke.influencers_visited',8,1,'main','Influencers who visited the property during the month'),
  ('influencer','Deliverables delivered','number','count','higher_better','pke.deliverables_delivered',9,2,'main','Agreed content pieces delivered during the month'),
  ('whatsapp','Click-through rate','percentage','%','higher_better','pke.ctr',8,4,'main','Share of delivered messages whose link was clicked'),
  ('whatsapp','New subscribers','number','count','higher_better','pke.new_subscribers',9,5,'main','New WhatsApp opt-ins during the month'),
  ('email_marketing','Mails sent','number','count','higher_better','pke.mails_sent',8,2,'main','Individual emails sent during the month (B2B included)'),
  ('corporate_comms','Tasks assigned','number','count','higher_better','auto.cc.assigned',8,1,'main','Corporate Communication tasks due in the month; computed automatically, no manual entry'),
  ('corporate_comms','Tasks completed','number','count','higher_better','auto.cc.completed',9,2,'main','Of those, tasks completed; computed automatically'),
  ('corporate_comms','Tasks pending','number','count','higher_better','auto.cc.pending',10,3,'main','Of those, tasks still open; computed automatically'),
  ('social_media','Instagram feed posts','number','count','higher_better','sync:instagram.posts_feed',20,2,'publications','Synced from Metricool'),
  ('social_media','Instagram reels','number','count','higher_better','sync:instagram.posts_reels',21,3,'publications','Synced from Metricool'),
  ('social_media','Instagram stories','number','count','higher_better','sync:instagram.posts_stories',22,4,'publications','Synced from Metricool; stories included in the publications total'),
  ('social_media','Facebook feed posts','number','count','higher_better','sync:facebook.posts_feed',23,5,'publications','Synced from Metricool'),
  ('social_media','Facebook reels','number','count','higher_better','sync:facebook.posts_reels',24,6,'publications','Synced from Metricool'),
  ('social_media','Facebook stories','number','count','higher_better','sync:facebook.posts_stories',25,7,'publications','Synced from Metricool; stories included in the publications total'),
  ('social_media','LinkedIn posts','number','count','higher_better','sync:linkedin.posts',26,8,'publications','Synced from Metricool'),
  ('social_media','LinkedIn newsletters','number','count','higher_better','sync:linkedin.posts_newsletter',27,9,'publications','Synced from Metricool'),
  ('social_media','YouTube videos (all formats)','number','count','higher_better','sync:youtube.posts',28,10,'publications','Long videos and Shorts combined; synced from Metricool'),
  ('social_media','Facebook views on publications','number','count','higher_better','sync:facebook.content_views',29,12,'views','Page media views; synced from Metricool'),
  ('social_media','Instagram views on publications','number','count','higher_better','sync:instagram.content_views',30,13,'views','Total content views; synced from Metricool'),
  ('social_media','LinkedIn content impressions','number','count','higher_better','sync:linkedin.content_views',31,14,'views','Reported by Metricool as impressions; synced from Metricool'),
  ('social_media','YouTube views on publications','number','count','higher_better','sync:youtube.content_views',32,15,'views','Video views; synced from Metricool')
) as x(pipeline_code, name, kpi_type, unit, direction, source_key, sort_order, main_position, main_group, definition)
  on p.code = x.pipeline_code
where not exists (
  select 1 from public.kpi_definitions d
  where d.pipeline_id = p.id and d.source_key = x.source_key
);

-- Report entries are created only for scoring definitions (existing behaviour unchanged).
create or replace function public._refresh_report_kpis(_report_id uuid)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
DECLARE pid uuid; n int;
BEGIN
  SELECT cp.pipeline_id INTO pid FROM monthly_reports mr JOIN client_pipelines cp ON cp.id=mr.client_pipeline_id WHERE mr.id=_report_id AND mr.status <> 'approved';
  IF pid IS NULL THEN RETURN 0; END IF;
  INSERT INTO kpi_entries (report_id, kpi_definition_id)
    SELECT _report_id, k.id FROM kpi_definitions k WHERE k.pipeline_id=pid AND k.active AND k.counts_toward_score
    ON CONFLICT (report_id, kpi_definition_id) DO NOTHING;
  UPDATE kpi_entries SET updated_at = now() WHERE report_id=_report_id;
  GET DIAGNOSTICS n = ROW_COUNT; RETURN n;
END
$function$;

-- Read-only Main KPI values for one hotel pipeline and month, ordered for display.
-- Callers: staff who can view the pipeline, or the hotel owner (approved data only).
create or replace function public.main_kpi_values(_cp uuid, _month date)
returns table(definition_id uuid, name text, kpi_type text, unit text, direction text, main_position integer, main_group text, value numeric)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  m date := date_trunc('month', _month)::date;
  base date := (date_trunc('month', _month) - interval '1 year')::date;
  _client uuid; _pid uuid; _owner boolean;
  d record; v numeric; b numeric; cur numeric; approved boolean; sk text;
begin
  select cp.client_id, cp.pipeline_id into _client, _pid from public.client_pipelines cp where cp.id = _cp;
  if _pid is null then return; end if;
  _owner := public.my_client_id() = _client and not public.is_staff(auth.uid());
  if not (_owner or public.can_view_pipeline(_cp)) then return; end if;
  for d in
    select k.* from public.kpi_definitions k
    where k.pipeline_id = _pid and k.is_main and k.active
    order by k.main_position
  loop
    v := null;
    if d.source_key like 'auto.cc.%' then
      select count(*) into cur from public.client_tasks t
       where t.client_id = _client and t.pipeline_code = 'corporate_comms'
         and t.due_date >= m and t.due_date < (m + interval '1 month')::date;
      if d.source_key = 'auto.cc.assigned' then
        v := cur;
      else
        select count(*) into b from public.client_tasks t
         where t.client_id = _client and t.pipeline_code = 'corporate_comms'
           and t.due_date >= m and t.due_date < (m + interval '1 month')::date
           and t.status = 'completed';
        v := case when d.source_key = 'auto.cc.completed' then b else cur - b end;
      end if;
    elsif d.source_key in ('yoy.ota.bookings', 'yoy.ota.revenue') then
      -- Manu: YoY comes from approved months only, N/A without last-year data.
      execute format('select sum(%I) from public.ota_records where client_pipeline_id = $1 and month = $2 and status = ''approved''',
        case when d.source_key like '%bookings' then 'bookings' else 'revenue' end)
        into cur using _cp, m;
      execute format('select sum(%I) from public.ota_records where client_pipeline_id = $1 and month = $2 and status = ''approved''',
        case when d.source_key like '%bookings' then 'bookings' else 'revenue' end)
        into b using _cp, base;
      v := case when coalesce(b, 0) > 0 and cur is not null then round((cur - b) / b * 100, 1) end;
    elsif d.source_key like 'sync:%' then
      -- Same rules as kpi_source_value: approved, complete, in-period fetched rows only.
      sk := substr(d.source_key, 6);
      select sum(e.value::numeric) into v
        from public.kpi_fetched_values f, jsonb_each_text(f.fetched_values || coalesce(f.corrected_values, '{}'::jsonb)) e
       where f.client_pipeline_id = _cp and f.month = m and f.status = 'approved' and not f.is_partial
         and coalesce(f.raw_data->>'period', 'alcor') <> 'before_alcor'
         and (e.key = sk or e.key like '%.' || sk)
         and e.value ~ '^-?[0-9]+(\.[0-9]+)?$';
    else
      v := public.kpi_source_value(_cp, m, d.source_key);
      if _owner then
        -- Owners see approved months only: the manual backing table must hold an approved row
        -- (gbp./social. may also resolve from approved fetched rows, which kpi_source_value already gates).
        approved := case
          when d.source_key like 'gbp.%' then exists(select 1 from public.gbp_kpi_entries e where e.client_pipeline_id = _cp and e.month = m and e.status = 'approved')
            or exists(select 1 from public.kpi_fetched_values f where f.client_pipeline_id = _cp and f.month = m and f.status = 'approved' and not f.is_partial)
          when d.source_key like 'social.%' then exists(select 1 from public.social_kpi_entries e where e.client_pipeline_id = _cp and e.month = m and e.status = 'approved')
            or exists(select 1 from public.kpi_fetched_values f where f.client_pipeline_id = _cp and f.month = m and f.status = 'approved' and not f.is_partial)
          when d.source_key like 'ota.%' then exists(select 1 from public.ota_records r where r.client_pipeline_id = _cp and r.month = m and r.status = 'approved')
          when d.source_key like 'pke.%' then exists(select 1 from public.pipeline_kpi_entries e where e.client_pipeline_id = _cp and e.month = m and e.status = 'approved')
          else false -- weekly/dept tables have no approval state: owners see nothing from them
        end;
        if not approved then v := null; end if;
      end if;
    end if;
    definition_id := d.id; name := d.name; kpi_type := d.kpi_type; unit := d.unit;
    direction := d.direction; main_position := d.main_position; main_group := d.main_group;
    value := v;
    return next;
  end loop;
end
$function$;

revoke all on function public.main_kpi_values(uuid, date) from public, anon;
grant execute on function public.main_kpi_values(uuid, date) to authenticated;