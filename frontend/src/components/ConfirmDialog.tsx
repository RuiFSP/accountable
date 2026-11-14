import { useEffect } from "react";

import type { CascadeGroup } from "../lib/cascade";

interface ConfirmDialogProps {
  title: string;
  message?: string;
  groups: CascadeGroup[];
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  title,
  message,
  groups,
  confirmLabel = "Delete",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCancel();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  return (
    <div
      className="modal-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onCancel();
        }
      }}
    >
      <div
        className="modal"
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-header">
          <h2>{title}</h2>
        </div>
        {message ? <p className="muted">{message}</p> : null}
        {groups.length > 0 ? (
          <div className="cascade-list">
            {groups.map((group) => (
              <div key={group.label} className="cascade-group">
                <h3>
                  {group.label}{" "}
                  <span className="cascade-count num">
                    {group.items.length}
                  </span>
                </h3>
                <ul>
                  {group.items.map((item, index) => (
                    <li key={`${group.label}-${index}`}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : null}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn btn-danger" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
