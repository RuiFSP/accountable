interface RecordAttributionProps {
  createdBy?: string | null;
  updatedBy?: string | null;
}

/** The two attribution lines a record's detail grid shows when there is an email. */
export default function RecordAttribution({
  createdBy,
  updatedBy,
}: RecordAttributionProps) {
  return (
    <>
      {createdBy ? (
        <>
          <dt>Added by</dt>
          <dd>{createdBy}</dd>
        </>
      ) : null}
      {updatedBy ? (
        <>
          <dt>Last changed by</dt>
          <dd>{updatedBy}</dd>
        </>
      ) : null}
    </>
  );
}
