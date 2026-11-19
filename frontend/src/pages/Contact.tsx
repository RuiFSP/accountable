import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";

import { api } from "../api/client";
import Timeline from "../components/Timeline";
import { capitalize } from "../lib/text";

export default function Contact() {
  const { id } = useParams();
  const contactId = Number(id);

  const contactsQuery = useQuery({
    queryKey: ["contacts"],
    queryFn: api.contacts.list,
  });
  const { data: organizations = [] } = useQuery({
    queryKey: ["organizations"],
    queryFn: api.organizations.list,
  });
  const { data: activities = [] } = useQuery({
    queryKey: ["activities"],
    queryFn: api.activities.list,
  });

  if (contactsQuery.isLoading) {
    return <p className="muted">Loading…</p>;
  }

  const contact = (contactsQuery.data ?? []).find(
    (row) => row.id === contactId,
  );
  if (!contact) {
    return (
      <div>
        <h1>Contact not found</h1>
        <Link className="back-link" to="/contacts">
          ← Contacts
        </Link>
      </div>
    );
  }

  const organization = organizations.find(
    (row) => row.id === contact.organization_id,
  );
  const timeline = activities.filter(
    (activity) => activity.contact_id === contactId,
  );

  return (
    <div>
      <Link className="back-link" to="/contacts">
        ← Contacts
      </Link>
      <div className="page-title">
        <h1>{contact.name}</h1>
        <span className={`badge badge-${contact.status}`}>
          {capitalize(contact.status)}
        </span>
      </div>

      <section className="panel">
        <dl className="detail-grid">
          <dt>Email</dt>
          <dd>{contact.email ?? "—"}</dd>
          <dt>Phone</dt>
          <dd className="num">{contact.phone ?? "—"}</dd>
          <dt>Job title</dt>
          <dd>{contact.job_title ?? "—"}</dd>
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
          {contact.created_by ? (
            <>
              <dt>Added by</dt>
              <dd>{contact.created_by}</dd>
            </>
          ) : null}
          {contact.updated_by ? (
            <>
              <dt>Last changed by</dt>
              <dd>{contact.updated_by}</dd>
            </>
          ) : null}
        </dl>
      </section>

      <Timeline
        activities={timeline}
        recordType="contact"
        recordId={contactId}
      />
    </div>
  );
}
