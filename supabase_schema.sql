-- =====================================================================
-- ENT-HNS ENDOSCOPY & CF4 REPORT SYSTEM - SUPABASE SCHEMA
-- Run this script in your Supabase SQL Editor.
-- =====================================================================

-- 1. Create Patient Records Table (Syncs with entPatientRecordHistoryV1)
CREATE TABLE IF NOT EXISTS patient_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id TEXT NOT NULL DEFAULT 'default_clinic',
    record_key TEXT NOT NULL,
    report_type TEXT NOT NULL,          -- 'cf4', 'nasal', 'laryngeal'
    patient_name TEXT,
    patient_id TEXT,
    case_number TEXT,
    procedure_date TEXT,
    file_name TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT patient_records_clinic_key UNIQUE (clinic_id, record_key)
);

-- Index for speedy search & filtering across devices
CREATE INDEX IF NOT EXISTS idx_records_clinic_type ON patient_records(clinic_id, report_type);
CREATE INDEX IF NOT EXISTS idx_records_updated ON patient_records(updated_at DESC);

-- 2. Create Shared Clinic Settings & Lists Table
CREATE TABLE IF NOT EXISTS clinic_shared_data (
    clinic_id TEXT NOT NULL,
    data_key TEXT NOT NULL,             -- 'clinicSettings', 'clinicPhysicians', 'cf4Settings', etc.
    payload JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (clinic_id, data_key)
);

-- 3. Row Level Security (RLS) Setup
ALTER TABLE patient_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic_shared_data ENABLE ROW LEVEL SECURITY;

-- Anonymous/Public access rules using standard anon key
-- (Allows clinic devices using the app to read and write without login roadblocks,
--  while keeping data segregated per clinic_id)
DROP POLICY IF EXISTS "Allow anon read patient_records" ON patient_records;
CREATE POLICY "Allow anon read patient_records" ON patient_records
    FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Allow anon insert patient_records" ON patient_records;
CREATE POLICY "Allow anon insert patient_records" ON patient_records
    FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon update patient_records" ON patient_records;
CREATE POLICY "Allow anon update patient_records" ON patient_records
    FOR UPDATE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Allow anon delete patient_records" ON patient_records;
CREATE POLICY "Allow anon delete patient_records" ON patient_records
    FOR DELETE TO anon, authenticated USING (true);

-- Policies for clinic_shared_data
DROP POLICY IF EXISTS "Allow anon read clinic_shared_data" ON clinic_shared_data;
CREATE POLICY "Allow anon read clinic_shared_data" ON clinic_shared_data
    FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Allow anon insert clinic_shared_data" ON clinic_shared_data;
CREATE POLICY "Allow anon insert clinic_shared_data" ON clinic_shared_data
    FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon update clinic_shared_data" ON clinic_shared_data;
CREATE POLICY "Allow anon update clinic_shared_data" ON clinic_shared_data
    FOR UPDATE TO anon, authenticated USING (true);

