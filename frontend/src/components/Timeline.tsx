import { useQueryClient } from "@tanstack/react-query";
import { FormEvent, useMemo, useState } from "react";

import {
  api,
  type Activity,
  type ActivityInput,
  type ActivityType,
} from "../api/client";
import {
  datetimeLocalNow,
  formatDateTime,
  formatDue,
  isOverdue,
} from "../lib/dates";
import { capitalize } from "../lib/text";
import ConfirmDialog from "./ConfirmDialog";
import Field from "./Field";
import Modal from "./Modal";

const TYPE_ACCENTS: Record<ActivityType, string> = {
  note: "var(--color-cerulean)",
  call: "var(--color-sea-green)",
  email: "var(--color-marigold)",
};

interface TimelineProps {
  activities: Activity[];
  recordType: "contact" | "deal";
  recordId: number;
}

export default function Timeline({
  activities,
  recordType,
  recordId,
}: TimelineProps) {
  const queryClient = useQueryClient();
  const [logging, setLogging] = useState(false);
  const [editing, setEditing] = useState<Activity | null>(null);
  const [deleting, setDeleting] = useState<Activity | null>(null);

  const sorted = useMemo(
    () =>
      [...activities].sort(
        (a, b) => b.happened_at.localeCompare(a.happened_at) || b.id - a.id,
      ),
    [activities],
  );

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["activities"] });

  const handleCreate = async (payload: ActivityInput) => {
    await api.activities.create(payload);
    await refresh();
    setLogging(false);
  };

  const handleUpdate = async (payload: ActivityInput) => {
    if (!editing) {
      return;
    }
    await api.activities.update(editing.id, payload);
    await refresh();
    setEditing(null);
  };

  const handleDelete = async () => {
    if (!deleting) {
      return;
    }
    try {
      await api.activities.remove(deleting.id);
      await refresh();
      setDeleting(null);
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <section className="timeline-section">
      <div className="section-head">
        <h2>Timeline</h2>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setLogging(true)}
        >
          Log activity
        </button>
      </div>

      {sorted.length === 0 ? (
        <p className="muted">Nothing logged yet.</p>
      ) : (
        <ul className="timeline">
          {sorted.map((activity) => (
            <li key={activity.id} className="timeline-item">
              <span
                className="activity-dot"
                style={{ background: TYPE_ACCENTS[activity.type] }}
                aria-hidden="true"
              />
              <div className="timeline-main">
                <div className="timeline-head">
                  <span className="timeline-description">
                    {activity.description}
                  </span>
                  <span className="timeline-time num">
                    {formatDateTime(activity.happened_at)}
                  </span>
                </div>
                <div className="timeline-meta">
                  <span className={`type-tag type-${activity.type}`}>
                    {capitalize(activity.type)}
                  </span>
                  {activity.follow_up_date ? (
                    <span
                      className={
                        "due" +
                        (activity.done
                          ? " done"
                          : isOverdue(activity.follow_up_date)
                            ? " overdue"
                            : "")
                      }
                    >
                      {activity.done
                        ? "Follow-up done"
                        : `Follow-up: ${formatDue(activity.follow_up_date)}`}
                    </span>
                  ) : null}
                  <span className="timeline-actions">
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => setEditing(activity)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="link-button link-danger"
                      onClick={() => setDeleting(activity)}
                    >
                      Delete
                    </button>
                  </span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {logging ? (
        <ActivityForm
          recordType={recordType}
          recordId={recordId}
          onSubmit={handleCreate}
          onCancel={() => setLogging(false)}
        />
      ) : null}
      {editing ? (
        <ActivityForm
          recordType={recordType}
          recordId={recordId}
          activity={editing}
          onSubmit={handleUpdate}
          onCancel={() => setEditing(null)}
        />
      ) : null}
      {deleting ? (
        <ConfirmDialog
          title="Delete activity?"
          message={deleting.description}
          groups={[]}
          onConfirm={() => {
            void handleDelete();
          }}
          onCancel={() => setDeleting(null)}
        />
      ) : null}
    </section>
  );
}

interface ActivityFormProps {
  recordType: "contact" | "deal";
  recordId: number;
  activity?: Activity;
  onSubmit: (payload: ActivityInput) => Promise<void>;
  onCancel: () => void;
}

function ActivityForm({
  recordType,
  recordId,
  activity,
  onSubmit,
  onCancel,
}: ActivityFormProps) {
  const [type, setType] = useState<ActivityType>(activity?.type ?? "note");
  const [description, setDescription] = useState(activity?.description ?? "");
  const [happenedAt, setHappenedAt] = useState(
    activity ? activity.happened_at.slice(0, 16) : datetimeLocalNow(),
  );
  const [followUpDate, setFollowUpDate] = useState(
    activity?.follow_up_date ?? "",
  );
  const [done, setDone] = useState(activity?.done ?? false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    try {
      await onSubmit({
        type,
        contact_id: recordType === "contact" ? recordId : null,
        deal_id: recordType === "deal" ? recordId : null,
        description: description.trim(),
        happened_at: happenedAt,
        follow_up_date: followUpDate || null,
        done,
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not save the activity.",
      );
    }
  };

  return (
    <Modal
      title={activity ? "Edit activity" : "Log activity"}
      onClose={onCancel}
    >
      <form className="record-form" onSubmit={handleSubmit}>
        <Field label="Type">
          <select
            value={type}
            onChange={(event) => setType(event.target.value as ActivityType)}
          >
            <option value="note">Note</option>
            <option value="call">Call</option>
            <option value="email">Email</option>
          </select>
        </Field>
        <Field label="Description">
          <textarea
            rows={3}
            required
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </Field>
        <div className="form-row">
          <Field label="Happened">
            <input
              type="datetime-local"
              required
              value={happenedAt}
              onChange={(event) => setHappenedAt(event.target.value)}
            />
          </Field>
          <Field label="Follow-up">
            <input
              type="date"
              value={followUpDate}
              onChange={(event) => setFollowUpDate(event.target.value)}
            />
          </Field>
        </div>
        <label className="check-field">
          <input
            type="checkbox"
            checked={done}
            onChange={(event) => setDone(event.target.checked)}
          />
          Done
        </label>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary">
            {activity ? "Save" : "Log"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
