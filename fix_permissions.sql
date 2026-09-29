-- =====================================================================
-- FIX PERMISSIONS & SCHEMA REPAIR FOR ANON ROLE
-- =====================================================================

-- 1. Siguraduhin ang basic grants sa schema
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO anon, authenticated;

-- 2. Drop at recreate ng policies para malinis
DROP POLICY IF EXISTS "Allow anon all patient_records" ON patient_records;
DROP POLICY IF EXISTS "Allow anon read patient_records" ON patient_records;
DROP POLICY IF EXISTS "Allow anon insert patient_records" ON patient_records;
DROP POLICY IF EXISTS "Allow anon update patient_records" ON patient_records;
DROP POLICY IF EXISTS "Allow anon delete patient_records" ON patient_records;

CREATE POLICY "Allow anon all patient_records" ON patient_records
    FOR ALL TO anon, authenticated
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon all clinic_shared_data" ON clinic_shared_data;
DROP POLICY IF EXISTS "Allow anon read clinic_shared_data" ON clinic_shared_data;
DROP POLICY IF EXISTS "Allow anon insert clinic_shared_data" ON clinic_shared_data;
DROP POLICY IF EXISTS "Allow anon update clinic_shared_data" ON clinic_shared_data;
DROP POLICY IF EXISTS "Allow anon delete clinic_shared_data" ON clinic_shared_data;

CREATE POLICY "Allow anon all clinic_shared_data" ON clinic_shared_data
    FOR ALL TO anon, authenticated
    USING (true)
    WITH CHECK (true);

-- 3. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
