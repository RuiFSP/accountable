import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { api, type Activity, type ActivityCreateType } from "../api/client";
import { ACTIVITY_COLORS } from "../lib/activity";
import { chartMonths, funnelBars, monthYearLabel } from "../lib/charts";
import { formatDue, formatWhen, isOverdue } from "../lib/dates";
import { formatUsd, formatUsdCompact } from "../lib/money";
import { STAGE_META } from "../lib/pipeline";

const AXIS_TICK = { fill: "var(--color-ink-muted)", fontSize: 12 };

/** Recharts' default tooltip is a white box; both modes take it from tokens. */
const TOOLTIP_STYLE = {
  backgroundColor: "var(--color-panel)",
  border: "1px solid var(--color-tooltip-border)",
  color: "var(--color-ink)",
};

interface KpiCardProps {
  label: string;
  value: string;
  note: string;
  danger?: boolean;
}

function KpiCard({ label, value, note, danger }: KpiCardProps) {
  return (
    <section className="panel kpi">
      <p className="kpi-label">{label}</p>
      <p className={`kpi-value num${danger ? " danger" : ""}`}>{value}</p>
      <p className="kpi-note muted">{note}</p>
    </section>
  );
}

export default function Dashboard() {
  const queryClient = useQueryClient();
  const dashboardQuery = useQuery({
    queryKey: ["dashboard"],
    queryFn: api.dashboard.get,
  });
  const { data: contacts = [] } = useQuery({
    queryKey: ["contacts"],
    queryFn: api.contacts.list,
  });
  const { data: deals = [] } = useQuery({
    queryKey: ["deals"],
    queryFn: api.deals.list,
  });

  const payload = dashboardQuery.data;
  const revenuePoints = payload ? chartMonths(payload.won) : [];
  const funnelRows = payload ? funnelBars(payload.funnel) : [];
  const range =
    payload && payload.won.months.length >= 2
      ? `${monthYearLabel(payload.won.months[0].month)} – ${monthYearLabel(
          payload.won.months[payload.won.months.length - 1].month,
        )}`
      : "";

  const recordName = (activity: Activity): string =>
    contacts.find((contact) => contact.id === activity.contact_id)?.name ??
    deals.find((deal) => deal.id === activity.deal_id)?.name ??
    "";

  const markDone = async (activity: Activity) => {
    try {
      await api.activities.update(activity.id, {
        type: activity.type as ActivityCreateType,
        contact_id: activity.contact_id,
        deal_id: activity.deal_id,
        description: activity.description,
        happened_at: activity.happened_at,
        follow_up_date: activity.follow_up_date,
        done: true,
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["activities"] }),
      ]);
    } catch (error) {
      console.error(error);
    }
  };

  const followUpRow = (activity: Activity) => {
    const overdue = activity.follow_up_date
      ? isOverdue(activity.follow_up_date)
      : false;
    return (
      <li key={activity.id} className="followup-row">
        <button
          type="button"
          className="followup-check"
          aria-label={`Mark done: ${activity.description}`}
          onClick={() => void markDone(activity)}
        />
        <div className="followup-body">
          <div className="followup-desc">{activity.description}</div>
          <div className="muted">{recordName(activity)}</div>
        </div>
        {activity.follow_up_date ? (
          <span className={`followup-due num${overdue ? " overdue" : ""}`}>
            {formatDue(activity.follow_up_date)}
          </span>
        ) : null}
      </li>
    );
  };

  return (
    <div>
      <div className="page-title">
        <h1>Dashboard</h1>
        {range ? (
          <span className="page-subtitle">Sales at a glance · {range}</span>
        ) : null}
      </div>

      {dashboardQuery.isLoading ? (
        <p className="muted">Loading…</p>
      ) : !payload ? (
        <p className="form-error" role="alert">
          Could not load the dashboard.
        </p>
      ) : (
        <div className="dashboard">
          <div className="kpi-grid">
            <KpiCard
              label="Revenue won, last 12 months"
              value={formatUsd(payload.won.total_revenue_cents)}
              note={`${payload.won.total_deals} deals won`}
            />
            <KpiCard
              label="Open pipeline"
              value={formatUsd(payload.pipeline.value_cents)}
              note={`${payload.pipeline.count} open deals`}
            />
            <KpiCard
              label="Expected revenue"
              value={formatUsd(payload.pipeline.expected_cents)}
              note="value × probability, open deals"
            />
            <KpiCard
              label="Overdue follow-ups"
              value={String(payload.follow_ups.overdue_count)}
              note={`of ${payload.follow_ups.open_count} open follow-ups`}
              danger={payload.follow_ups.overdue_count > 0}
            />
          </div>

          <div className="dashboard-grid">
            <section className="panel">
              <h2>Revenue won per month</h2>
              <p className="panel-sub muted">
                Won deals, counted in the month they closed
              </p>
              <div className="chart-box">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={revenuePoints}
                    margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid
                      stroke="var(--color-grid)"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      tick={AXIS_TICK}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      width={52}
                      tick={AXIS_TICK}
                      tickFormatter={(value: number | string) =>
                        formatUsdCompact(Number(value))
                      }
                    />
                    <Tooltip
                      formatter={(value) => formatUsd(Number(value))}
                      contentStyle={TOOLTIP_STYLE}
                    />
                    <Area
                      type="monotone"
                      dataKey="revenueCents"
                      stroke="var(--color-sea-green)"
                      strokeWidth={2.5}
                      fill="var(--color-sea-green)"
                      fillOpacity={0.12}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className="panel">
              <h2>Sales funnel</h2>
              <p className="panel-sub muted">Open deals by stage</p>
              <div className="funnel">
                {funnelRows.map((row) => (
                  <div key={row.stage} className="funnel-row">
                    <div className="funnel-label">
                      <strong>{row.stage}</strong>
                      <span className="muted">
                        {row.count} {row.count === 1 ? "deal" : "deals"}
                      </span>
                    </div>
                    <div className="funnel-track">
                      <div
                        className="funnel-fill"
                        style={{
                          width: `${Math.round(row.share * 100)}%`,
                          background: STAGE_META[row.stage].color,
                        }}
                      />
                    </div>
                    <span className="funnel-value num">
                      {formatUsd(row.valueCents)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="funnel-chips">
                <div className="chip">
                  <span
                    className="chip-dot"
                    style={{ background: "var(--color-sea-green)" }}
                  />
                  Won,12 months{" "}
                  <strong className="num">
                    {formatUsd(payload.funnel.won_12m_cents)}
                  </strong>
                </div>
                <div className="chip">
                  <span
                    className="chip-dot"
                    style={{ background: "var(--color-raspberry)" }}
                  />
                  Lost{" "}
                  <strong className="num">
                    {formatUsd(payload.funnel.lost_cents)}
                  </strong>
                </div>
              </div>
            </section>
          </div>

          <div className="dashboard-lower">
            <section className="panel">
              <h2>Deals won per month</h2>
              <p className="panel-sub muted">Count of won deals</p>
              <div className="chart-box chart-box-short">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={revenuePoints}
                    margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid
                      stroke="var(--color-grid)"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      tick={AXIS_TICK}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      width={32}
                      tick={AXIS_TICK}
                      allowDecimals={false}
                    />
                    <Tooltip
                      formatter={(value) => `${value} deals`}
                      contentStyle={TOOLTIP_STYLE}
                    />
                    <Bar
                      dataKey="deals"
                      fill="var(--color-cerulean)"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className="panel">
              <h2>Recent activity</h2>
              <p className="panel-sub muted">Latest across all records</p>
              <ul className="activity-list">
                {payload.recent_activity.map((activity) => (
                  <li key={activity.id} className="activity-row">
                    <span
                      className="activity-dot"
                      style={{ background: ACTIVITY_COLORS[activity.type] }}
                      aria-hidden="true"
                    />
                    <div className="activity-body">
                      <div className="activity-desc">
                        {activity.description}
                      </div>
                      <div className="muted">{recordName(activity)}</div>
                    </div>
                    <span className="activity-when num">
                      {formatWhen(activity.happened_at)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="panel">
              <h2>Follow-ups</h2>
              <p className="panel-sub muted">Open tasks from activities</p>
              {payload.follow_ups.open_count === 0 ? (
                <p className="muted">Nothing open.</p>
              ) : (
                <>
                  {payload.follow_ups.overdue.length > 0 ? (
                    <>
                      <h3 className="followup-group is-overdue">Overdue</h3>
                      <ul className="followup-list">
                        {payload.follow_ups.overdue.map(followUpRow)}
                      </ul>
                    </>
                  ) : null}
                  {payload.follow_ups.upcoming.length > 0 ? (
                    <>
                      <h3 className="followup-group">Upcoming</h3>
                      <ul className="followup-list">
                        {payload.follow_ups.upcoming.map(followUpRow)}
                      </ul>
                    </>
                  ) : null}
                </>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
