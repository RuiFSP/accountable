import type { ReactNode } from "react";

export type StatusTone =
  "neutral" | "info" | "positive" | "warning" | "negative";

interface StatusBadgeProps {
  tone: StatusTone;
  children: ReactNode;
}

/**
 * A document status, in the tones agreed for quotes, invoices and bills. The
 * badge always names its status, so its color never carries the meaning alone.
 */
export default function StatusBadge({ tone, children }: StatusBadgeProps) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}
