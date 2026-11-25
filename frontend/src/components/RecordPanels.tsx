import type { ComponentType } from "react";

/**
 * A panel another area adds to a record page, such as a deal's quotes, given
 * the record as the page has it. The page never names the area that added it.
 */
export interface RecordPanel<R> {
  name: string;
  Panel: ComponentType<{ record: R }>;
}

interface AddedPanelsProps<R> {
  panels: RecordPanel<R>[];
  record: R;
}

/** The panels other areas add, in the order given, and nothing when there are none. */
export default function AddedPanels<R>({
  panels,
  record,
}: AddedPanelsProps<R>) {
  if (panels.length === 0) {
    return null;
  }
  return (
    <div className="record-panels">
      {panels.map(({ name, Panel }) => (
        <Panel key={name} record={record} />
      ))}
    </div>
  );
}
