"""The bill for one won deal: invoices, their lines and the payments against them.

An invoice takes its number when it is issued and keeps it forever, so the
number is unique and a draft's is empty. One non-void invoice per deal is held
by a partial unique index, on SQLite and Postgres alike. No rows here: the
sample invoices belong to the seed.

On Postgres, the tables get row-level security with no policies, like every
other table.

Revision ID: 0008
Revises: 0007
Create Date: 2026-11-26
"""

import sqlalchemy as sa
from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "invoices",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("number", sa.String(), nullable=True),
        sa.Column("deal_id", sa.Integer(), nullable=False),
        sa.Column("organization_id", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("issue_date", sa.Date(), nullable=True),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("subtotal_cents", sa.Integer(), nullable=False),
        sa.Column("tax_label", sa.String(), nullable=True),
        sa.Column("tax_rate_thousandths", sa.Integer(), nullable=True),
        sa.Column("tax_cents", sa.Integer(), nullable=True),
        sa.Column("total_cents", sa.Integer(), nullable=True),
        sa.Column("bill_to_name", sa.String(), nullable=True),
        sa.Column("bill_to_address", sa.Text(), nullable=True),
        sa.Column("bill_to_contact_name", sa.String(), nullable=True),
        sa.Column("bill_to_contact_email", sa.String(), nullable=True),
        sa.Column("created_by", sa.String(), nullable=True),
        sa.Column("updated_by", sa.String(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("number", name="uq_invoices_number"),
        sa.ForeignKeyConstraint(["deal_id"], ["deals.id"]),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"]),
    )
    op.create_index(
        "uq_invoices_deal_not_void",
        "invoices",
        ["deal_id"],
        unique=True,
        sqlite_where=sa.text("status != 'void'"),
        postgresql_where=sa.text("status != 'void'"),
    )
    op.create_table(
        "invoice_lines",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("invoice_id", sa.Integer(), nullable=False),
        sa.Column("product_id", sa.Integer(), nullable=True),
        sa.Column("description", sa.String(), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("unit_price_cents", sa.Integer(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["invoice_id"], ["invoices.id"]),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"]),
    )
    op.create_table(
        "payments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("invoice_id", sa.Integer(), nullable=False),
        sa.Column("paid_on", sa.Date(), nullable=False),
        sa.Column("amount_cents", sa.Integer(), nullable=False),
        sa.Column("method", sa.String(), nullable=False),
        sa.Column("reference", sa.String(), nullable=True),
        sa.Column("created_by", sa.String(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["invoice_id"], ["invoices.id"]),
    )
    if op.get_bind().dialect.name == "postgresql":
        for table in ("invoices", "invoice_lines", "payments"):
            op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    op.drop_table("payments")
    op.drop_table("invoice_lines")
    op.drop_index("uq_invoices_deal_not_void", table_name="invoices")
    op.drop_table("invoices")
