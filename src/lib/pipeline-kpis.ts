export type MetricField = {
  key: string;
  label: string;
  /** lower_better metrics improve when the number falls */
  direction?: "higher_better" | "lower_better";
  suffix?: string | undefined;
};

export type PipelineKpiEntry = {
  id: string;
  month: string;
  channel: string;
  metrics: Record<string, number>;
  notes: string | null;
  status: string;
  client_pipeline_id: string;
  client_id: string;
};

export type OtaRecord = {
  id: string;
  month: string;
  ota_name: string;
  live_channels: number;
  new_channels: number;
  active_channels: number;
  ranking: number | null;
  content_score: number | null;
  conversion_rate: number | null;
  reputation_score: number | null;
  bookings: number | null;
  revenue: number | null;
  notes: string | null;
  status: string;
};

export const OTA_FIELDS: MetricField[] = [
  { key: "live_channels", label: "Live channels" },
  { key: "new_channels", label: "New channels" },
  { key: "active_channels", label: "Active channels" },
  { key: "ranking", label: "Avg ranking", direction: "lower_better" },
  { key: "content_score", label: "Content score" },
  { key: "conversion_rate", label: "Conversion", suffix: "%" },
  { key: "reputation_score", label: "Reputation score" },
  { key: "bookings", label: "Bookings" },
  { key: "revenue", label: "Revenue", suffix: " ₹" },
];

/** Pipelines whose monthly form is built dynamically from kpi_definitions (source_key 'pke.*'). */
export const FORM_PIPELINE_CODES = [
  "influencer",
  "whatsapp",
  "email_marketing",
  "corporate_comms",
  "reservations_desk",
  "website_seo",
  "marketing_funnel",
] as const;

export const FORM_PIPELINE_BLURB: Record<string, string> = {
  influencer: "Monthly influencer outreach, collaborations and content reach.",
  whatsapp: "Monthly WhatsApp campaigns, delivery, read rate, replies and leads.",
  email_marketing: "Monthly email campaigns, travel-agent outreach, open rate, click rate, list growth and leads.",
  corporate_comms: "Monthly corporate outreach, proposals, RFPs and agreements signed.",
  reservations_desk: "Monthly enquiries handled, response time and enquiry-to-booking conversion.",
  website_seo: "Monthly organic sessions, booking-engine conversions, mobile page speed and keywords in Google's top 10.",
  marketing_funnel: "Monthly leads captured, lead-to-booking % and average first-response time (lower is better).",
};

/** Owner-safe labels for the metric keys stored in pipeline_kpi_entries.metrics. */
export const PKE_KEY_LABELS: Record<string, string> = {
  contacted: "Influencers contacted",
  confirmed: "Collaborations confirmed",
  completed: "Collaborations completed",
  influencers_visited: "Influencers visited",
  deliverables_delivered: "Deliverables delivered",
  mails_sent: "Mails sent",
  ctr: "Click-through rate",
  new_subscribers: "New subscribers",
  reach: "Content reach",
  agents_contacted: "Agents contacted",
  agents_onboarded: "Agents onboarded",
  meetings: "Meetings held",
  follow_ups: "Follow-ups done",
  enquiries: "Agent enquiries",
  accounts_contacted: "Accounts contacted",
  proposals_sent: "Proposals sent",
  rfps_submitted: "RFPs submitted",
  accounts_signed: "Accounts signed",
  campaigns_sent: "Campaigns sent",
  delivered: "Messages delivered",
  read_rate: "Read rate",
  responses: "Replies received",
  leads: "Leads generated",
  open_rate: "Open rate",
  click_rate: "Click rate",
  list_growth: "List growth",
  enquiries_handled: "Enquiries handled",
  avg_response_min: "Average response time",
  conversion_rate: "Enquiry conversion",
  missed_calls: "Missed calls",
  organic_sessions: "Organic sessions",
  booking_engine_conversions: "Booking-engine conversions",
  page_speed_mobile: "Page speed score (mobile)",
  keywords_top10: "Keywords in Google top 10",
  leads_captured: "Leads captured",
  lead_to_booking_pct: "Lead-to-booking %",
  first_response_min: "Average first-response time (min)",
};

/** Owner-safe titles for pipelines by code (used where pipeline names are not selectable). */
export const PIPELINE_TITLES: Record<string, string> = {
  influencer: "Influencer Marketing",
  whatsapp: "WhatsApp Marketing",
  email_marketing: "Email Marketing",
  corporate_comms: "Corporate Design and Communication",
  reservations_desk: "Reservation Desk",
  website_seo: "Website SEO",
  marketing_funnel: "Marketing Funnel Development",
};

export function metricValue(metrics: Record<string, number> | null | undefined, key: string): number | null {
  const v = metrics?.[key];
  return typeof v === "number" && !Number.isNaN(v) ? v : null;
}

export function formatMetric(value: number | null, field?: MetricField): string {
  if (value === null || value === undefined) return "—";
  const n = Number(value).toLocaleString("en-IN", { maximumFractionDigits: 1 });
  return field?.suffix ? `${n}${field.suffix}` : n;
}
