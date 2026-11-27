"""The quotes and their lines: one document per deal, priced in whole cents.

No amounts or totals are stored: every sum is worked out from the lines with
tax.py. It adds no rows, so the sample quotes belong to the seed. On Postgres,
both tables get row-level security with no policies, like every other table.

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
        "quotes",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("number", sa.String(), nullable=False),
        sa.Column("deal_id", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("created_at", sa.Date(), nullable=False),
        sa.Column("valid_until", sa.Date(), nullable=False),
        sa.Column("tax_label", sa.String(), nullable=True),
        sa.Column("tax_rate_thousandths", sa.Integer(), nullable=True),
        sa.Column("created_by", sa.String(), nullable=True),
        sa.Column("updated_by", sa.String(), nullable=True),
        sa.ForeignKeyConstraint(["deal_id"], ["deals.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "quote_lines",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("quote_id", sa.Integer(), nullable=False),
        sa.Column("product_id", sa.Integer(), nullable=False),
        sa.Column("product_name", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("unit_price_cents", sa.Integer(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"]),
        sa.ForeignKeyConstraint(["quote_id"], ["quotes.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    if op.get_bind().dialect.name == "postgresql":
        op.execute("ALTER TABLE quotes ENABLE ROW LEVEL SECURITY")
        op.execute("ALTER TABLE quote_lines ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    op.drop_table("quote_lines")
    op.drop_table("quotes")
