-- =====================================================================
-- ENT-HNS ENDOSCOPY & CF4 REPORT SYSTEM
-- ADMIN INSIGHTS  (clinics / growth / database usage)
-- Run this ONCE in the Supabase SQL Editor, AFTER supabase_schema.sql
-- and supabase_auth_schema.sql. Safe to re-run (idempotent).
--
-- It creates two read-only functions the Admin Console calls:
--   * admin_record_activity(p_days, p_tz) -> per clinic / doctor / staff
--     / report-type record counts bucketed per calendar day.
--   * admin_db_usage()                    -> database + storage size with
--     the Supabase FREE plan quotas baked in for the progress bars.
--
-- Without this script the Admin Console still works: it falls back to
-- plain REST paging and shows sizes as "estimated".
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Indexes that keep the admin reports fast
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_patient_records_created
    ON patient_records (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_patient_records_clinic_created
    ON patient_records (clinic_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_created_action
    ON activity_logs (created_at DESC, action);


-- ---------------------------------------------------------------------
-- 2. RECORD ACTIVITY  (powers Clinics & Growth: day / week / month)
--    p_tz is the viewer's IANA time zone (e.g. 'Asia/Manila'), so a
--    "day" always means the clinic's own calendar day.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin_record_activity(
    p_days int DEFAULT 365,
    p_tz   text DEFAULT 'UTC'
)
RETURNS TABLE (
    clinic_id   text,
    doctor_id   text,
    created_by  text,
    report_type text,
    day         date,
    n           bigint
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    SELECT
        r.clinic_id::text                                             AS clinic_id,
        coalesce(nullif(r.doctor_id::text,   ''), '')                 AS doctor_id,
        coalesce(nullif(r.created_by::text,  ''), '')                 AS created_by,
        coalesce(nullif(r.report_type::text, ''), 'other')            AS report_type,
        date_trunc(
            'day',
            r.created_at AT TIME ZONE
                (CASE WHEN pg_timezone_exists(coalesce(p_tz, 'UTC'))
                      THEN p_tz ELSE 'UTC' END)
        )::date                                                       AS day,
        count(*)::bigint                                              AS n
    FROM patient_records r
    WHERE r.created_at >= now() - make_interval(days => greatest(coalesce(p_days, 365), 1))
    GROUP BY 1, 2, 3, 4, 5
    ORDER BY 5, 1;
$$;

-- ---------------------------------------------------------------------
-- 3. DATABASE + STORAGE USAGE  (Admin -> Database tab)
--    SECURITY DEFINER so it can also read storage.objects / auth.users,
--    which the anon role cannot see directly. Read-only, no writes.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin_db_usage()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_db_bytes      bigint;
    v_tables        jsonb := '[]'::jsonb;
    v_app_bytes     bigint := 0;
    v_app_rows      bigint := 0;
    v_storage_bytes bigint;
    v_storage_files bigint := 0;
    v_mau           bigint;
    v_auth_users    bigint;
BEGIN
    -- Total project disk usage (this is what the 500 MB free cap counts).
    BEGIN
        SELECT pg_database_size(current_database()) INTO v_db_bytes;
    EXCEPTION WHEN OTHERS THEN
        v_db_bytes := NULL;
    END;

    -- Per-table size + row estimate for everything in the public schema.
    SELECT coalesce(jsonb_agg(jsonb_build_object(
               'name',        t.tablename,
               'rows',        t.reltuples,
               'bytes',       t.bytes,
               'table_bytes', t.tbytes,
               'index_bytes', t.ibytes
           ) ORDER BY t.bytes DESC), '[]'::jsonb)
      INTO v_tables
      FROM (
        SELECT c.relname                        AS tablename,
               greatest(c.reltuples, 0)::bigint AS reltuples,
               pg_total_relation_size(c.oid)     AS bytes,
               pg_table_size(c.oid)             AS tbytes,
               pg_indexes_size(c.oid)           AS ibytes
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public'
           AND c.relkind IN ('r', 'p', 'm')
      ) t;

    SELECT coalesce(sum((t ->> 'bytes')::bigint), 0),
           coalesce(sum((t ->> 'rows')::bigint),  0)
      INTO v_app_bytes, v_app_rows
      FROM jsonb_array_elements(v_tables) t;

    -- Supabase file storage (Storage buckets).
    BEGIN
        SELECT coalesce(sum((o.metadata ->> 'size')::bigint), 0), count(*)
          INTO v_storage_bytes, v_storage_files
          FROM storage.objects o;
    EXCEPTION WHEN OTHERS THEN
        v_storage_bytes := NULL;
        v_storage_files := NULL;
    END;

    -- Monthly active users (Auth metric, 50 000 on the free plan).
    BEGIN
        SELECT count(*) INTO v_auth_users FROM auth.users;
        SELECT count(*) INTO v_mau
          FROM auth.users
         WHERE last_sign_in_at >= date_trunc('month', now());
    EXCEPTION WHEN OTHERS THEN
        v_auth_users := NULL;
        v_mau := NULL;
    END;

    RETURN jsonb_build_object(
        'generated_at',       now(),
        'exact',              true,
        'db_bytes',           v_db_bytes,
        'app_bytes',          v_app_bytes,
        'app_rows',           v_app_rows,
        'tables',             v_tables,
        'storage_bytes',      v_storage_bytes,
        'storage_files',      v_storage_files,
        'mau',                v_mau,
        'auth_users',         v_auth_users,
        'plan',               'free',
        'db_limit_bytes',       500  * 1024 * 1024,
        'storage_limit_bytes',  1    * 1024 * 1024 * 1024,
        'mau_limit',            50000,
        'egress_limit_bytes',   5    * 1024 * 1024 * 1024,
        'plan_note',          'Supabase Free plan: 500 MB database, 1 GB file storage, '
                              || '50 000 monthly active users, 5 GB egress. '
                              || 'Free projects pause after 1 week of inactivity (max 2 active projects).'
    );
END;
$$;


-- ---------------------------------------------------------------------
-- 4. Grants (the app only ever calls these two functions)
-- ---------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION admin_record_activity(int, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_db_usage()                TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
