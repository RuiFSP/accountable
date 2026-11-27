"""The Documents settings: the invoice design, the accent color and the logo.

A database whose settings predate this section keeps what it has and gains the
Classic design, the Midnight accent and no logo (company-settings decision 18),
which the columns' defaults give every existing row. Nothing else is written:
the sample row belongs to the seed.

Revision ID: 0010
Revises: 0009
Create Date: 2026-11-26
"""

import sqlalchemy as sa
from alembic import op

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "company_settings",
        sa.Column(
            "invoice_design",
            sa.String(),
            nullable=False,
            server_default="classic",
        ),
    )
    op.add_column(
        "company_settings",
        sa.Column(
            "accent_color",
            sa.String(),
            nullable=False,
            server_default="#073B4C",
        ),
    )
    op.add_column(
        "company_settings", sa.Column("logo_data", sa.LargeBinary(), nullable=True)
    )
    op.add_column(
        "company_settings", sa.Column("logo_content_type", sa.String(), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("company_settings", "logo_content_type")
    op.drop_column("company_settings", "logo_data")
    op.drop_column("company_settings", "accent_color")
    op.drop_column("company_settings", "invoice_design")
