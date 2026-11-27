"""Bills: the money the business owes its suppliers. A bill points at the
organization that supplied it, carries the supplier's own bill number and the
amount and tax as they appear on the bill, and stores the backend's total.
The paid date stays empty until the bill is marked paid. On Postgres, the
table gets row-level security with no policies, like every other table.

Revision ID: 0006
Revises: 0005
"""

import sqlalchemy as sa
from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "bills",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("organization_id", sa.Integer(), nullable=False),
        sa.Column("bill_number", sa.String(), nullable=False),
        sa.Column("bill_date", sa.Date(), nullable=False),
        sa.Column("due_date", sa.Date(), nullable=False),
        sa.Column("category", sa.String(), nullable=False),
        sa.Column("amount_cents", sa.Integer(), nullable=False),
        sa.Column("tax_cents", sa.Integer(), nullable=False),
        sa.Column("total_cents", sa.Integer(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("paid_date", sa.Date(), nullable=True),
        sa.Column("created_by", sa.String(), nullable=True),
        sa.Column("updated_by", sa.String(), nullable=True),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    if op.get_bind().dialect.name == "postgresql":
        op.execute("ALTER TABLE bills ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        op.execute("ALTER TABLE bills DISABLE ROW LEVEL SECURITY")
    op.drop_table("bills")
