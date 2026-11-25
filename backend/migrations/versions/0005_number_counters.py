"""The counters that number quotes and invoices: one row for each kind of
document, added when it takes its first number.

It adds no rows, so on a database that already exists, as on a new one, each
count starts at 1. On Postgres, the table gets row-level security with no
policies, like every other table.

Revision ID: 0005
Revises: 0004
"""

import sqlalchemy as sa
from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "number_counters",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(), nullable=False),
        sa.Column("last_number", sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("kind", name="uq_number_counters_kind"),
    )
    if op.get_bind().dialect.name == "postgresql":
        op.execute("ALTER TABLE number_counters ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    op.drop_table("number_counters")
