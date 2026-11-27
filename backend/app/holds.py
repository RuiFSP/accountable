"""What holds a deal or an organization: records in another area that point at
it, such as the quotes on a deal or the bills from a supplier. A held record
can't be deleted, so a document is never left pointing at nothing.

Each area says which of its columns hold what, as a Hold. main.py puts every
area's holds on the app, and the delete routes read them from there, so they
never name another area.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

from fastapi import FastAPI, HTTPException
from sqlalchemy import Column, Connection, Table, select


@dataclass(frozen=True)
class Hold:
    """One kind of record that holds another, such as an invoice holding its deal."""

    link: Column
    """The holding table's column that points at the record it holds."""
    noun: str
    """One holding record, as the delete dialog names it, such as "invoice"."""

    @property
    def held(self) -> Table:
        """The table the link's foreign key points at."""
        [key] = self.link.foreign_keys
        return key.column.table


def app_holds(app: FastAPI) -> Sequence[Hold]:
    """Every area's holds, which main.py puts on the app. Tests can stand in for them."""
    return getattr(app.state, "holds", ())


def holding(
    connection: Connection,
    holds: Sequence[Hold],
    targets: Sequence[tuple[Table, int]],
) -> dict[str, int]:
    """How many records of each kind hold any of these records.

    A document that holds both an organization and one of its deals is counted
    once. The targets include the organization's deals because SQLite does not
    enforce the foreign keys, so the organization's cascade would otherwise
    delete a deal a quote still points at.
    """
    found: dict[str, set[int]] = {}
    for hold in holds:
        ids = [record_id for table, record_id in targets if table is hold.held]
        if not ids:
            continue
        # The holding records' own ids: two invoices on one deal count as two.
        rows = connection.execute(
            select(hold.link.table.c.id).where(hold.link.in_(ids))
        ).scalars()
        found.setdefault(hold.noun, set()).update(rows)
    return {noun: len(rows) for noun, rows in found.items() if rows}


def refuse_if_held(
    connection: Connection,
    holds: Sequence[Hold],
    targets: Sequence[tuple[Table, int]],
    kind: str,
) -> None:
    """Refuse the delete of a held record, naming what holds it."""
    found = holding(connection, holds, targets)
    if found:
        raise HTTPException(
            status_code=409,
            detail=f"This {kind} has {_listed(found)}, so it can't be deleted.",
        )


def _listed(found: dict[str, int]) -> str:
    """ "2 quotes", "2 quotes and 1 invoice"."""
    parts = [_count(count, noun) for noun, count in found.items()]
    if len(parts) == 1:
        return parts[0]
    return f"{', '.join(parts[:-1])} and {parts[-1]}"


def _count(count: int, noun: str) -> str:
    if count == 1:
        return f"1 {noun}"
    return f"{count} {noun}s"
