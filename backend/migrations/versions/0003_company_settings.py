"""The team's company settings, plus row-level security on Postgres so
Supabase's Data API serves nothing.

No data here: the sample row belongs to the seed.

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-24
"""

import sqlalchemy as sa
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "company_settings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("address", sa.Text(), nullable=True),
        sa.Column("email", sa.String(), nullable=True),
        sa.Column("phone", sa.String(), nullable=True),
        sa.Column("tax_label", sa.String(), nullable=True),
        sa.Column("tax_rate_thousandths", sa.Integer(), nullable=False),
        sa.Column("payment_terms_days", sa.Integer(), nullable=False),
        sa.Column("quote_prefix", sa.String(), nullable=True),
        sa.Column("invoice_prefix", sa.String(), nullable=True),
        sa.Column("updated_by", sa.String(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    if op.get_bind().dialect.name == "postgresql":
        op.execute("ALTER TABLE company_settings ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        op.execute("ALTER TABLE company_settings DISABLE ROW LEVEL SECURITY")
    op.drop_table("company_settings")
