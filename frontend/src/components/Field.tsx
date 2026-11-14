import {
  type ReactElement,
  type ReactNode,
  cloneElement,
  isValidElement,
  useId,
} from "react";

interface FieldProps {
  label: string;
  hint?: string;
  children: ReactNode;
}

interface ControlProps {
  id?: string;
  "aria-describedby"?: string;
}

/**
 * A label over a form control. The label text stays the label text — no hint,
 * option or value text leaks into it — and the hint is attached as a description.
 */
export default function Field({ label, hint, children }: FieldProps) {
  const id = useId();
  const describedBy = hint ? `${id}-hint` : undefined;

  const control = isValidElement(children)
    ? cloneElement(children as ReactElement<ControlProps>, {
        id,
        "aria-describedby": describedBy,
      })
    : children;

  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      {control}
      {hint ? (
        <span className="field-hint" id={`${id}-hint`}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}
