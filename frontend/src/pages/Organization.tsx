import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";

import { api } from "../api/client";
import RecordAttribution from "../components/RecordAttribution";
import { formatUsd } from "../lib/money";
import { capitalize } from "../lib/text";

export default function Organization() {
  const { id } = useParams();
  const organizationId = Number(id);

  const organizationsQuery = useQuery({
    queryKey: ["organizations"],
    queryFn: api.organizations.list,
  });
  const { data: contacts = [] } = useQuery({
    queryKey: ["contacts"],
    queryFn: api.contacts.list,
  });
  const { data: deals = [] } = useQuery({
    queryKey: ["deals"],
    queryFn: api.deals.list,
  });

  if (organizationsQuery.isLoading) {
    return <p className="muted">Loading…</p>;
  }

  const organization = (organizationsQuery.data ?? []).find(
    (row) => row.id === organizationId,
  );
  if (!organization) {
    return (
      <div>
        <h1>Organization not found</h1>
        <Link className="back-link" to="/organizations">
          ← Organizations
        </Link>
      </div>
    );
  }

  const linkedContacts = contacts.filter(
    (contact) => contact.organization_id === organizationId,
  );
  const linkedDeals = deals.filter(
    (deal) => deal.organization_id === organizationId,
  );

  return (
    <div>
      <Link className="back-link" to="/organizations">
        ← Organizations
      </Link>
      <div className="page-title">
        <h1>{organization.name}</h1>
      </div>

      <section className="panel">
        <dl className="detail-grid">
          <dt>Website</dt>
          <dd>{organization.website ?? "—"}</dd>
          <dt>Industry</dt>
          <dd>{organization.industry ?? "—"}</dd>
          <dt>Notes</dt>
          <dd>{organization.notes ?? "—"}</dd>
          <RecordAttribution
            createdBy={organization.created_by}
            updatedBy={organization.updated_by}
          />
        </dl>
      </section>

      <div className="two-col">
        <section className="panel">
          <h2>
            Contacts <span className="count num">{linkedContacts.length}</span>
          </h2>
          {linkedContacts.length === 0 ? (
            <p className="muted">No contacts yet.</p>
          ) : (
            <ul className="link-list">
              {linkedContacts.map((contact) => (
                <li key={contact.id}>
                  <Link to={`/contacts/${contact.id}`}>{contact.name}</Link>
                  <span className={`badge badge-${contact.status}`}>
                    {capitalize(contact.status)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel">
          <h2>
            Deals <span className="count num">{linkedDeals.length}</span>
          </h2>
          {linkedDeals.length === 0 ? (
            <p className="muted">No deals yet.</p>
          ) : (
            <ul className="link-list">
              {linkedDeals.map((deal) => (
                <li key={deal.id}>
                  <Link to={`/deals/${deal.id}`}>{deal.name}</Link>
                  <span className={`badge badge-${deal.stage}`}>
                    {deal.stage}
                  </span>
                  <span className="num">{formatUsd(deal.value_cents)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
