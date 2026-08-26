"""add_notification_detail_fields

Revision ID: e3b14a9c8f21
Revises: d2a93c4e5b6f
Create Date: 2026-08-25 15:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e3b14a9c8f21'
down_revision: Union[str, None] = 'd2a93c4e5b6f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('notifications', sa.Column('priority', sa.String(length=20), nullable=True))
    op.add_column('notifications', sa.Column('incident_id', sa.UUID(), nullable=True))
    op.add_column('notifications', sa.Column('vehicle_id', sa.UUID(), nullable=True))
    op.add_column('notifications', sa.Column('recipient_role', sa.String(length=50), nullable=True))
    op.add_column('notifications', sa.Column('action_url', sa.String(length=500), nullable=True))
    op.add_column('notifications', sa.Column('read_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('notifications', sa.Column('metadata_json', sa.JSON(), nullable=True))

    op.create_foreign_key('fk_notifications_incident_id', 'notifications', 'incidents', ['incident_id'], ['id'], ondelete='SET NULL')
    op.create_foreign_key('fk_notifications_vehicle_id', 'notifications', 'vehicles', ['vehicle_id'], ['id'], ondelete='SET NULL')

    op.create_index('ix_notifications_incident_id', 'notifications', ['incident_id'])
    op.create_index('ix_notifications_vehicle_id', 'notifications', ['vehicle_id'])
    op.create_index('ix_notifications_recipient_role', 'notifications', ['recipient_role'])


def downgrade() -> None:
    op.drop_index('ix_notifications_recipient_role', table_name='notifications')
    op.drop_index('ix_notifications_vehicle_id', table_name='notifications')
    op.drop_index('ix_notifications_incident_id', table_name='notifications')
    op.drop_constraint('fk_notifications_vehicle_id', 'notifications', type_='foreignkey')
    op.drop_constraint('fk_notifications_incident_id', 'notifications', type_='foreignkey')
    op.drop_column('notifications', 'metadata_json')
    op.drop_column('notifications', 'read_at')
    op.drop_column('notifications', 'action_url')
    op.drop_column('notifications', 'recipient_role')
    op.drop_column('notifications', 'vehicle_id')
    op.drop_column('notifications', 'incident_id')
    op.drop_column('notifications', 'priority')
