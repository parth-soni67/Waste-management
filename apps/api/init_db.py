"""
WasteWise AI — Supabase / PostgreSQL Database Initializer & Seeder

Initializes all database tables (Users, Vehicles, Incidents, Reports, Notifications)
and creates seed users and vehicles in your Supabase database.

Usage:
    cd apps/api
    python init_db.py
"""

import asyncio
import sys
import os

# Add the apps/api directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.core.db import engine, Base, async_session_factory
from app.models.entities import (
    User,
    UserRole,
    Vehicle,
    VehicleStatus,
    Incident,
    PriorityLevel,
    IncidentStatus,
)
from app.core.security import get_password_hash


async def init_and_seed_database():
    print("Connecting to database...")
    print(f"Engine URL: {engine.url.render_as_string(hide_password=True)}")

    # 1. Create all tables
    async with engine.begin() as conn:
        print("Creating tables (Base.metadata.create_all)...")
        await conn.run_sync(Base.metadata.create_all)
        print("Tables created successfully!")

    # 2. Seed Initial Admin, Officer, Driver & Citizen Users
    async with async_session_factory() as session:
        from sqlalchemy import select
        result = await session.execute(select(User).limit(1))
        existing_user = result.scalars().first()

        if not existing_user:
            print("Seeding demo accounts...")
            demo_password_hash = get_password_hash("password123")

            users = [
                User(
                    email="officer@wastewise.gov",
                    password_hash=demo_password_hash,
                    full_name="Officer Rajesh Sharma",
                    role=UserRole.OFFICER,
                    is_active=True,
                    is_verified=True,
                ),
                User(
                    email="driver@wastewise.gov",
                    password_hash=demo_password_hash,
                    full_name="Driver Vikram Patel",
                    role=UserRole.DRIVER,
                    is_active=True,
                    is_verified=True,
                ),
                User(
                    email="citizen@wastewise.gov",
                    password_hash=demo_password_hash,
                    full_name="Citizen Priya Mehta",
                    role=UserRole.CITIZEN,
                    is_active=True,
                    is_verified=True,
                ),
                User(
                    email="admin@wastewise.gov",
                    password_hash=demo_password_hash,
                    full_name="Chief Admin",
                    role=UserRole.ADMIN,
                    is_active=True,
                    is_verified=True,
                ),
            ]

            session.add_all(users)

            # Seed demo fleet vehicles
            vehicles = [
                Vehicle(
                    plate_number="GJ-01-WM-4402",
                    vehicle_type="Compactor 5T",
                    capacity_kg=5000,
                    current_load_kg=2450,
                    status=VehicleStatus.EN_ROUTE,
                    current_lat=23.025,
                    current_lng=72.578,
                ),
                Vehicle(
                    plate_number="GJ-01-WM-9120",
                    vehicle_type="Tipper 3T",
                    capacity_kg=3000,
                    current_load_kg=1100,
                    status=VehicleStatus.ASSIGNED,
                    current_lat=23.045,
                    current_lng=72.548,
                ),
                Vehicle(
                    plate_number="GJ-01-WM-8820",
                    vehicle_type="Mini Truck 1.5T",
                    capacity_kg=1500,
                    current_load_kg=0,
                    status=VehicleStatus.AVAILABLE,
                    current_lat=23.018,
                    current_lng=72.562,
                ),
            ]
            session.add_all(vehicles)

            await session.commit()
            print("Successfully seeded demo users & fleet into Supabase!")
        else:
            print("Database already contains seed data.")

    print("\nDatabase initialization complete! Ready for WasteWise AI.")


if __name__ == "__main__":
    asyncio.run(init_and_seed_database())
