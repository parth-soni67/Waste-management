"""create_driver_workflow_and_proofs

Revision ID: c1f82d94a11b
Revises: ba38670d9729
Create Date: 2026-08-24 17:45:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'c1f82d94a11b'
down_revision: Union[str, None] = 'ba38670d9729'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add execution columns to incidents table
    op.add_column('incidents', sa.Column('started_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('incidents', sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('incidents', sa.Column('completed_by_id', sa.UUID(), nullable=True))
    op.add_column('incidents', sa.Column('completion_latitude', sa.Float(), nullable=True))
    op.add_column('incidents', sa.Column('completion_longitude', sa.Float(), nullable=True))
    op.create_foreign_key('fk_incidents_completed_by', 'incidents', 'users', ['completed_by_id'], ['id'], ondelete='SET NULL')

    # 2. Create collection_proofs table
    op.create_table(
        'collection_proofs',
        sa.Column('id', sa.UUID(), primary_key=True),
        sa.Column('incident_id', sa.UUID(), sa.ForeignKey('incidents.id', ondelete='CASCADE'), nullable=False),
        sa.Column('driver_id', sa.UUID(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('image_url', sa.String(length=1000), nullable=False),
        sa.Column('storage_path', sa.String(length=500), nullable=False),
        sa.Column('latitude', sa.Float(), nullable=True),
        sa.Column('longitude', sa.Float(), nullable=True),
        sa.Column('accuracy', sa.Float(), nullable=True),
        sa.Column('captured_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('uploaded_at', sa.DateTime(timezone=True), server_default=sa.text("timezone('utc', now())"), nullable=False),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('verification_status', sa.String(length=50), server_default='VALID', nullable=False),
    )
    op.create_index('ix_collection_proofs_incident_id', 'collection_proofs', ['incident_id'])
    op.create_index('ix_collection_proofs_driver_id', 'collection_proofs', ['driver_id'])

    # 3. Create driver_locations table
    op.create_table(
        'driver_locations',
        sa.Column('id', sa.UUID(), primary_key=True),
        sa.Column('driver_id', sa.UUID(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('latitude', sa.Float(), nullable=False),
        sa.Column('longitude', sa.Float(), nullable=False),
        sa.Column('accuracy', sa.Float(), nullable=True),
        sa.Column('heading', sa.Float(), nullable=True),
        sa.Column('speed', sa.Float(), nullable=True),
        sa.Column('recorded_at', sa.DateTime(timezone=True), server_default=sa.text("timezone('utc', now())"), nullable=False),
    )
    op.create_index('ix_driver_locations_driver_id', 'driver_locations', ['driver_id'])
    op.create_index('ix_driver_locations_recorded_at', 'driver_locations', ['recorded_at'])


def downgrade() -> None:
    op.drop_index('ix_driver_locations_recorded_at', table_name='driver_locations')
    op.drop_index('ix_driver_locations_driver_id', table_name='driver_locations')
    op.drop_table('driver_locations')

    op.drop_index('ix_collection_proofs_driver_id', table_name='collection_proofs')
    op.drop_index('ix_collection_proofs_incident_id', table_name='collection_proofs')
    op.drop_table('collection_proofs')

    op.drop_constraint('fk_incidents_completed_by', 'incidents', type_='foreignkey')
    op.drop_column('incidents', 'completion_longitude')
    op.drop_column('incidents', 'completion_latitude')
    op.drop_column('incidents', 'completed_by_id')
    op.drop_column('incidents', 'completed_at')
    op.drop_column('incidents', 'started_at')
