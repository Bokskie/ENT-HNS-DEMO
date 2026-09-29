-- =====================================================================
-- ENT-HNS ENDOSCOPY & CF4 REPORT SYSTEM
-- AUTH / USERS / ACTIVITY-LOG SCHEMA  (v2)
-- Run this in the Supabase SQL Editor AFTER supabase_schema.sql.
-- Safe to re-run (idempotent).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Make sure the base tables exist (no-op if already created)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS patient_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id TEXT NOT NULL DEFAULT 'default_clinic',
    record_key TEXT NOT NULL,
    report_type TEXT NOT NULL,
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

CREATE TABLE IF NOT EXISTS clinic_shared_data (
    clinic_id TEXT NOT NULL,
    data_key TEXT NOT NULL,
    payload JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (clinic_id, data_key)
);

-- ---------------------------------------------------------------------
-- 1. DOCTOR SCOPING on patient_records
--    Every saved report is stamped with the doctor it belongs to.
--    A secretary only ever queries rows of HER assigned doctor.
--    '' = clinic-wide / unassigned (still visible to admins).
-- ---------------------------------------------------------------------
ALTER TABLE patient_records ADD COLUMN IF NOT EXISTS doctor_id TEXT NOT NULL DEFAULT '';
ALTER TABLE patient_records ADD COLUMN IF NOT EXISTS created_by TEXT NOT NULL DEFAULT '';

-- Each doctor gets his/her own namespace. Without this, two doctors saving the
-- same patient on the same day collide on record_key and overwrite each other.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'patient_records_clinic_key') THEN
        ALTER TABLE patient_records DROP CONSTRAINT patient_records_clinic_key;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'patient_records_clinic_doctor_key') THEN
        ALTER TABLE patient_records
            ADD CONSTRAINT patient_records_clinic_doctor_key UNIQUE (clinic_id, doctor_id, record_key);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_patient_records_doctor
    ON patient_records(clinic_id, doctor_id, updated_at DESC);


-- ---------------------------------------------------------------------
-- 2. CLINIC USERS  (4 doctors + 4 secretaries + 1 admin by default)
--    password_hash = SHA-256( UTF8( salt || password ) )  -> hex
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clinic_users (
    id UUID PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    full_name TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL CHECK (role IN ('admin','doctor','secretary')),
    -- secretaries only see the records of the doctor they are assigned to
    assigned_doctor_id UUID,
    specialty TEXT NOT NULL DEFAULT '',
    license_no TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at TIMESTAMPTZ
);

-- A secretary must point at a real doctor (validated app-side too).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'clinic_users_secretary_requires_doctor'
    ) THEN
        ALTER TABLE clinic_users
            ADD CONSTRAINT clinic_users_secretary_requires_doctor
            CHECK (role <> 'secretary' OR assigned_doctor_id IS NOT NULL);
    END IF;
END $$;

-- ---------------------------------------------------------------------
-- 3. USER SESSIONS  -> powers the admin "ACTIVE NOW" counter
--    The client sends a heartbeat every 30 seconds; anyone seen in the
--    last 5 minutes counts as currently active.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY,
    token TEXT NOT NULL UNIQUE,
    user_id UUID NOT NULL,
    username TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT '',
    device TEXT NOT NULL DEFAULT '',
    clinic_id TEXT NOT NULL DEFAULT 'main_clinic',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_sessions_active ON user_sessions(last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON user_sessions(user_id);

-- ---------------------------------------------------------------------
-- 4. ACTIVITY LOGS
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS activity_logs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id UUID,
    username TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT '',
    action TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT '',
    clinic_id TEXT NOT NULL DEFAULT 'main_clinic',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_user ON activity_logs(user_id);

-- ---------------------------------------------------------------------
-- 5. ROW LEVEL SECURITY
--    Same model as the rest of the app: anon key + clinic-side scoping.
--    (The app filters by clinic_id / doctor_id / session user.)
-- ---------------------------------------------------------------------
ALTER TABLE patient_records   ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic_shared_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic_users      ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs     ENABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated;

DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['patient_records','clinic_shared_data','clinic_users','user_sessions','activity_logs']
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS "anon_all_%s" ON %I;', t, t);
        EXECUTE format(
            'CREATE POLICY "anon_all_%s" ON %I FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);',
            t, t
        );
    END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- 6. SEED DEFAULT ACCOUNTS
--    Admin can rename users / change passwords from Admin -> Users.
--
--    username | password      | role       | sees
--    ---------+---------------+------------+----------------------------------
--    admin    | admin123      | admin      | everything + Admin interface
--    doc1..4  | doctor123     | doctor     | only their own patients
--    sec1..4  | secretary123  | secretary  | only her assigned doctor's patients
-- ---------------------------------------------------------------------
INSERT INTO clinic_users (id, username, password_hash, salt, full_name, role, assigned_doctor_id, specialty, is_active) VALUES
 ('00000000-0000-4000-8000-000000000001','admin','667f4489f4bf92fca054aa4fe0734c0ab0714f3d925e5275a22ef3836c5aa16d','ENTs4lt-adm1n','Clinic Administrator','admin',NULL,'Administration',TRUE),
 ('00000000-0000-4000-8000-000000000002','doc1','a929b474468f1238c204cce1ba80c96bc9bd508e787e1d8df4ecb20f6f47c397','ENTs4lt-doc1','Doctor One','doctor',NULL,'ENT',TRUE),
 ('00000000-0000-4000-8000-000000000003','doc2','76eea04bed53f1688f0c5c5a3155b38f4065970d0c4cef041b8edbffd951b508','ENTs4lt-doc2','Doctor Two','doctor',NULL,'ENT',TRUE),
 ('00000000-0000-4000-8000-000000000004','doc3','2ec4d77bb11e033ab89cc30db5f7aee14decb9286a839828e0825660e8af5117','ENTs4lt-doc3','Doctor Three','doctor',NULL,'ENT',TRUE),
 ('00000000-0000-4000-8000-000000000005','doc4','c0fc09e495a357574971652a31ee015c6eb23f460340dacf8a21d05e805707e6','ENTs4lt-doc4','Doctor Four','doctor',NULL,'ENT',TRUE),
 ('00000000-0000-4000-8000-000000000006','sec1','9ac004b376f6567a6df7ca89aca42e36487ed3b453320825a7567191628fd9f2','ENTs4lt-sec1','Secretary One','secretary','00000000-0000-4000-8000-000000000002','',TRUE),
 ('00000000-0000-4000-8000-000000000007','sec2','56aae6fe7ee5f7e0501ebad0c49be4372d0db775dc4d6848d5dbe4b46946ed01','ENTs4lt-sec2','Secretary Two','secretary','00000000-0000-4000-8000-000000000003','',TRUE),
 ('00000000-0000-4000-8000-000000000008','sec3','24064190dee976ed47821b52cc002bb0ee2c82a86869eef37d7e376b72306221','ENTs4lt-sec3','Secretary Three','secretary','00000000-0000-4000-8000-000000000004','',TRUE),
 ('00000000-0000-4000-8000-000000000009','sec4','a353c82cc0fafd2b83c7d38194150af6466298bcef5f0e19a529aab2697b13e5','ENTs4lt-sec4','Secretary Four','secretary','00000000-0000-4000-8000-000000000005','',TRUE)
ON CONFLICT (username) DO NOTHING;



-- The doctor-scoped unique key (clinic_id, doctor_id, record_key) and its
-- index are created in section 1 above, so nothing to migrate here.

-- Handy for the admin console ("saved by" / who touched what).
CREATE INDEX IF NOT EXISTS idx_records_created_by ON patient_records(clinic_id, created_by);
