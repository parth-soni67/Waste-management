"""add_incident_assignment_fields

Revision ID: d2a93c4e5b6f
Revises: c1f82d94a11b
Create Date: 2026-08-24 18:10:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'd2a93c4e5b6f'
down_revision: Union[str, None] = 'c1f82d94a11b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('incidents', sa.Column('assigned_driver_id', sa.UUID(), nullable=True))
    op.add_column('incidents', sa.Column('assigned_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('incidents', sa.Column('assigned_by_id', sa.UUID(), nullable=True))

    op.create_foreign_key('fk_incidents_assigned_driver', 'incidents', 'users', ['assigned_driver_id'], ['id'], ondelete='SET NULL')
    op.create_foreign_key('fk_incidents_assigned_by', 'incidents', 'users', ['assigned_by_id'], ['id'], ondelete='SET NULL')

    op.create_index('ix_incidents_assigned_driver_id', 'incidents', ['assigned_driver_id'])
    op.create_index('ix_incidents_assigned_vehicle_id', 'incidents', ['assigned_vehicle_id'])


def downgrade() -> None:
    op.drop_index('ix_incidents_assigned_vehicle_id', table_name='incidents')
    op.drop_index('ix_incidents_assigned_driver_id', table_name='incidents')
    op.drop_constraint('fk_incidents_assigned_by', 'incidents', type_='foreignkey')
    op.drop_constraint('fk_incidents_assigned_driver', 'incidents', type_='foreignkey')
    op.drop_column('incidents', 'assigned_by_id')
    op.drop_column('incidents', 'assigned_at')
    op.drop_column('incidents', 'assigned_driver_id')
