/** Colors for activity dots and tags — shared by timelines and the dashboard. */

import type { ActivityType } from "../api/client";

export const ACTIVITY_COLORS: Record<ActivityType, string> = {
  note: "var(--color-cerulean)",
  call: "var(--color-sea-green)",
  email: "var(--color-marigold)",
  stage_change: "var(--color-coral)",
};
