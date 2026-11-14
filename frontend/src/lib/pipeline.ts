/** Pipeline knowledge shared by forms, table badges and (later) the board. */

import type { Stage } from "../api/client";

export interface StageInfo {
  /** Usual probability of close, in percent. */
  probability: number;
  /** Brand accent used for this stage. */
  color: string;
}

export const STAGE_META: Record<Stage, StageInfo> = {
  New: { probability: 10, color: "var(--color-cerulean)" },
  Qualified: { probability: 25, color: "var(--color-marigold)" },
  Proposal: { probability: 50, color: "var(--color-coral)" },
  Negotiation: { probability: 75, color: "var(--color-sea-green)" },
  Won: { probability: 100, color: "var(--color-sea-green)" },
  Lost: { probability: 0, color: "var(--color-raspberry)" },
};

export const STAGES = Object.keys(STAGE_META) as Stage[];

export const CONTACT_STATUSES = ["lead", "qualified", "customer"] as const;
