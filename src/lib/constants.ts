export const APP_NAME = "Alcor North Star";
export const APP_TAGLINE = "One Hotel. One System. One North Star.";
export const GBP_ACCESS_EMAIL = "mohnish@group2001.in";

export type AppRole =
  | "admin"
  | "management"
  | "bd_manager"
  | "pipeline_manager"
  | "team_member"
  | "finance"
  | "hr"
  | "client";

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Admin",
  management: "Management",
  bd_manager: "BD Manager",
  pipeline_manager: "Pipeline Manager",
  team_member: "Team Member",
  finance: "Finance",
  hr: "HR",
  client: "Client",
};

export const ROLE_OPTIONS = Object.entries(ROLE_LABELS).map(([value, label]) => ({
  value: value as AppRole,
  label,
}));

export const SIGNED_DOCUMENTS = ["Agreement Copy", "NOC — No Objection Certificate"];

export const MANDATORY_COMPLIANCE_DOCS = [
  "Lessee Agreement",
  "Electricity Bill",
  "PAN Card",
  "Cancelled Cheque",
  "GST Certificate",
  "Aadhaar Card — Authorised Person",
];

export const ADDITIONAL_COMPLIANCE_DOCS = [
  "FSSAI Certificate",
  "Udyog Aadhaar Certificate",
  "Brand Trademark Certificate",
];

export const DOC_STATUSES = ["pending", "uploaded", "verified", "rejected"] as const;

export const PAYMENT_MODES = ["UPI", "NEFT / RTGS", "Bank Transfer", "Cheque", "Cash", "Card"];

export const PROPERTY_TYPES = [
  "Hotel",
  "Resort",
  "Homestay",
  "Glamping/Camp",
  "Clinic",
  "Restaurant",
  "Bar",
  "Cafe",
  "Other",
];

/** Word used in client-facing copy: "hotel" for hotels and resorts, "property" for everything else. */
export function propertyWord(type: string | null | undefined): "hotel" | "property" {
  return type == null || type === "" || type === "Hotel" || type === "Resort" ? "hotel" : "property";
}

export const LAUNCH_ROLES: Array<{ value: string; label: string }> = [
  { value: "account_manager", label: "Account Manager" },
  { value: "bd_manager", label: "BD Manager" },
  { value: "revenue_manager", label: "OTA & Revenue Manager" },
  { value: "gmb_manager", label: "GMB SEO Manager" },
  { value: "social_manager", label: "Social Media Manager" },
  { value: "brand_manager", label: "Brand & Creative Manager" },
  { value: "automation_manager", label: "WhatsApp & Automation Manager" },
  { value: "drip_manager", label: "WhatsApp Drip Manager" },
  { value: "performance_manager", label: "Performance Marketing Manager" },
  { value: "b2b_manager", label: "Email & B2B Manager" },
  { value: "influencer_manager", label: "Influencer & Partnerships Manager" },
  { value: "vrd_lead", label: "Virtual Desk Lead" },
  { value: "creative_designer", label: "Creative & Content Designer" },
  { value: "reputation_executive", label: "Review & Reputation Executive" },
  { value: "accounts", label: "Accounts" },
];

export const ACCESS_STATUSES = ["pending", "received", "verified"] as const;

export const REPORT_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  submitted: "Submitted",
  review: "Management Review",
  approved: "Approved",
};

export const ACTION_STATUS_LABELS: Record<string, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  completed: "Completed",
  delayed: "Delayed",
  dropped: "Dropped",
};

export const ACTION_PRIORITY_LABELS: Record<string, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

export const KPI_TYPES = ["number", "currency", "percentage", "rating", "text"] as const;

export const IN_ROOM_AMENITIES = [
  "Air Conditioning",
  "Television",
  "Wi-Fi",
  "Mini Bar",
  "Tea/Coffee Maker",
  "Safe",
  "Balcony",
  "Bathtub",
  "Hair Dryer",
  "Work Desk",
];

export const PROPERTY_AMENITIES = [
  "Swimming Pool",
  "Spa",
  "Restaurant",
  "Bar",
  "Gym",
  "Banquet Hall",
  "Parking",
  "Kids Play Area",
  "Bonfire",
  "Conference Room",
];
