interface KpiCardProps {
  label: string;
  value: string;
  note: string;
  danger?: boolean;
}

/** One figure at the top of a page or a section, in the dashboard's style. */
export default function KpiCard({ label, value, note, danger }: KpiCardProps) {
  return (
    <section className="panel kpi">
      <p className="kpi-label">{label}</p>
      <p className={`kpi-value num${danger ? " danger" : ""}`}>{value}</p>
      <p className="kpi-note muted">{note}</p>
    </section>
  );
}
