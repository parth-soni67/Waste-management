-- ============================================================================
-- WasteWise AI — Supabase PostgreSQL Schema & Seed Data
-- Enables PostGIS, creates all tables, and seeds demo accounts
-- ============================================================================

-- 1. Enable PostGIS extension in extensions schema
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS postgis SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" SCHEMA extensions;

-- 2. Create Custom Enums
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('citizen', 'driver', 'officer', 'admin');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE vehicle_status AS ENUM ('AVAILABLE', 'ASSIGNED', 'EN_ROUTE', 'COLLECTING', 'FULL', 'MAINTENANCE', 'OFFLINE');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE priority_level AS ENUM ('P0', 'P1', 'P2', 'P3', 'P4');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE incident_status AS ENUM ('REPORTED', 'TRIAGED', 'ASSIGNED', 'IN_PROGRESS', 'COLLECTED', 'VERIFIED', 'RESOLVED', 'CLOSED', 'REOPENED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 3. Create Users Table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role user_role NOT NULL DEFAULT 'citizen',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_verified BOOLEAN NOT NULL DEFAULT TRUE,
    phone VARCHAR(50),
    zone VARCHAR(100),
    mfa_secret VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Create Vehicles Table
CREATE TABLE IF NOT EXISTS vehicles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    plate_number VARCHAR(50) UNIQUE NOT NULL,
    vehicle_type VARCHAR(100) NOT NULL,
    capacity_kg INTEGER NOT NULL,
    current_load_kg INTEGER NOT NULL DEFAULT 0,
    status vehicle_status NOT NULL DEFAULT 'AVAILABLE',
    current_lat DOUBLE PRECISION NOT NULL,
    current_lng DOUBLE PRECISION NOT NULL,
    assigned_driver_id UUID REFERENCES users(id) ON DELETE SET NULL,
    assigned_route JSONB,
    fuel_level_percent DOUBLE PRECISION NOT NULL DEFAULT 100.0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Create Incidents Table
CREATE TABLE IF NOT EXISTS incidents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    incident_number VARCHAR(50) UNIQUE NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100) NOT NULL,
    priority priority_level NOT NULL DEFAULT 'P3',
    status incident_status NOT NULL DEFAULT 'REPORTED',
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    address VARCHAR(255) NOT NULL,
    estimated_volume_m3 DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    estimated_weight_kg DOUBLE PRECISION NOT NULL DEFAULT 500.0,
    reports_count INTEGER NOT NULL DEFAULT 1,
    assigned_vehicle_id UUID REFERENCES vehicles(id) ON DELETE SET NULL,
    assigned_officer_id UUID REFERENCES users(id) ON DELETE SET NULL,
    verified_clearance_percent DOUBLE PRECISION,
    reopen_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Create Reports (Citizen Submissions) Table
CREATE TABLE IF NOT EXISTS reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    citizen_id UUID REFERENCES users(id) ON DELETE SET NULL,
    incident_id UUID REFERENCES incidents(id) ON DELETE CASCADE,
    description TEXT,
    category VARCHAR(100) NOT NULL,
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    address VARCHAR(255) NOT NULL,
    image_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
    cv_analysis JSONB,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Create Notifications Table
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(50) NOT NULL DEFAULT 'info',
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    action_url VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- Seed Demo Accounts & Fleet (Gandhinagar / Ahmedabad Context)
-- Password for all accounts: 'password123' (Argon2id hashed)
-- ============================================================================

INSERT INTO users (email, password_hash, full_name, role, is_active, is_verified, zone)
VALUES
    ('officer@wastewise.gov', '$argon2id$v=19$m=65536,t=3,p=4$Z2VuZXJhdGVkX3NhbHQ$demo_hash_replace_on_login', 'Officer Rajesh Sharma', 'officer', TRUE, TRUE, 'North Zone - Sector 12'),
    ('driver@wastewise.gov', '$argon2id$v=19$m=65536,t=3,p=4$Z2VuZXJhdGVkX3NhbHQ$demo_hash_replace_on_login', 'Driver Vikram Patel', 'driver', TRUE, TRUE, 'Fleet Unit 4'),
    ('citizen@wastewise.gov', '$argon2id$v=19$m=65536,t=3,p=4$Z2VuZXJhdGVkX3NhbHQ$demo_hash_replace_on_login', 'Citizen Priya Mehta', 'citizen', TRUE, TRUE, 'Sector 11'),
    ('admin@wastewise.gov', '$argon2id$v=19$m=65536,t=3,p=4$Z2VuZXJhdGVkX3NhbHQ$demo_hash_replace_on_login', 'Chief Municipal Admin', 'admin', TRUE, TRUE, 'Municipal HQ')
ON CONFLICT (email) DO NOTHING;

INSERT INTO vehicles (plate_number, vehicle_type, capacity_kg, current_load_kg, status, current_lat, current_lng)
VALUES
    ('GJ-01-WM-4402', 'Compactor 5T', 5000, 2450, 'EN_ROUTE', 23.025, 72.578),
    ('GJ-01-WM-9120', 'Tipper 3T', 3000, 1100, 'ASSIGNED', 23.045, 72.548),
    ('GJ-01-WM-8820', 'Mini Truck 1.5T', 1500, 0, 'AVAILABLE', 23.018, 72.562)
ON CONFLICT (plate_number) DO NOTHING;

INSERT INTO incidents (incident_number, title, description, category, priority, status, lat, lng, address, estimated_weight_kg, reports_count)
VALUES
    ('INC-8091', 'Hazardous mixed waste at Sector 12 Civil Hospital Red Zone', 'Bio-medical packaging overflow near Pediatric Wing.', 'Hazardous / Bio-Medical', 'P0', 'REPORTED', 23.033, 72.586, 'Sector 12 Civil Hospital Red Zone, Gandhinagar', 650.0, 8),
    ('INC-8042', 'Plastic packaging pile by Gandhinagar Railway Depot', 'Accumulated plastic wrappers blocking loading bay.', 'Plastic / Bottling', 'P1', 'ASSIGNED', 23.018, 72.562, 'Central Bus & Rail Depot, Zone 2', 420.0, 4),
    ('INC-7994', 'Organic market waste spill at Sector 21', 'Decomposing vegetable surplus at APMC market yard.', 'Organic / Food', 'P2', 'IN_PROGRESS', 23.045, 72.548, 'APMC Wholesale Yard, Sector 21', 600.0, 3)
ON CONFLICT (incident_number) DO NOTHING;
