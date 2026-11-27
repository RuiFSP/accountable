"""The billing address on an organization: one free-text block, shown on its
page and used on the invoices it is billed to.

No data here: the sample addresses belong to the seed.

Revision ID: 0007
Revises: 0006
Create Date: 2026-11-26
"""

import sqlalchemy as sa
from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "organizations", sa.Column("billing_address", sa.Text(), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("organizations", "billing_address")
