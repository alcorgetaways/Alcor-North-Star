export const SOCIAL_PLATFORMS = [
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "youtube", label: "YouTube" },
  { value: "linkedin", label: "LinkedIn" },
] as const;

export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number]["value"];

export function platformLabel(value: string): string {
  return SOCIAL_PLATFORMS.find((p) => p.value === value)?.label ?? value;
}

export type SocialEntry = {
  id?: string;
  month: string;
  platform: string;
  posts: number;
  followers: number;
  content_views: number;
  profile_views: number;
  engagement: number;
  new_followers: number;
  notes?: string | null;
  status?: string;
};

export const SOCIAL_METRICS = [
  { key: "posts", label: "Posts" },
  { key: "followers", label: "Followers" },
  { key: "content_views", label: "Content views" },
  { key: "profile_views", label: "Profile views" },
  { key: "engagement", label: "Engagement" },
  { key: "new_followers", label: "New followers" },
] as const;

export type SocialMetric = (typeof SOCIAL_METRICS)[number]["key"];

/** Percentage change from previous to current. Null when it cannot be computed. */
export function changePct(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || !previous) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function num(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return Number(value).toLocaleString("en-IN");
}
