import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";

import { api, type Deal as DealRecord } from "../api/client";
import AddedPanels, { type RecordPanel } from "../components/RecordPanels";
import RecordAttribution from "../components/RecordAttribution";
import Timeline from "../components/Timeline";
import { formatDate } from "../lib/dates";
import { formatUsd } from "../lib/money";

interface DealProps {
  panels?: RecordPanel<DealRecord>[];
}

export default function Deal({ panels = [] }: DealProps) {
  const { id } = useParams();
  const dealId = Number(id);

  const dealsQuery = useQuery({ queryKey: ["deals"], queryFn: api.deals.list });
  const { data: organizations = [] } = useQuery({
    queryKey: ["organizations"],
    queryFn: api.organizations.list,
  });
  const { data: contacts = [] } = useQuery({
    queryKey: ["contacts"],
    queryFn: api.contacts.list,
  });
  const { data: activities = [] } = useQuery({
    queryKey: ["activities"],
    queryFn: api.activities.list,
  });

  if (dealsQuery.isLoading) {
    return <p className="muted">Loading…</p>;
  }

  const deal = (dealsQuery.data ?? []).find((row) => row.id === dealId);
  if (!deal) {
    return (
      <div>
        <h1>Deal not found</h1>
        <Link className="back-link" to="/deals">
          ← Deals
        </Link>
      </div>
    );
  }

  const organization = organizations.find(
    (row) => row.id === deal.organization_id,
  );
  const contact = contacts.find((row) => row.id === deal.contact_id);
  const timeline = activities.filter((activity) => activity.deal_id === dealId);

  return (
    <div>
      <Link className="back-link" to="/deals">
        ← Deals
      </Link>
      <div className="page-title">
        <h1>{deal.name}</h1>
        <span className={`badge badge-${deal.stage}`}>{deal.stage}</span>
      </div>

      <section className="panel">
        <dl className="detail-grid">
          <dt>Value</dt>
          <dd className="num">{formatUsd(deal.value_cents)}</dd>
          <dt>Probability</dt>
          <dd className="num">{deal.probability}%</dd>
          <dt>Close date</dt>
          <dd>{formatDate(deal.close_date)}</dd>
          <dt>Organization</dt>
          <dd>
            {organization ? (
              <Link to={`/organizations/${organization.id}`}>
                {organization.name}
              </Link>
            ) : (
              "—"
            )}
          </dd>
          <dt>Contact</dt>
          <dd>
            {contact ? (
              <Link to={`/contacts/${contact.id}`}>{contact.name}</Link>
            ) : (
              "—"
            )}
          </dd>
          <RecordAttribution
            createdBy={deal.created_by}
            updatedBy={deal.updated_by}
          />
        </dl>
      </section>

      <AddedPanels panels={panels} record={deal} />

      <Timeline activities={timeline} recordType="deal" recordId={dealId} />
    </div>
  );
}
