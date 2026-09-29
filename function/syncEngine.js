/* =====================================================================
   SUPABASE DATA SYNC ENGINE
   Local-first synchronization for patient records & settings.

   Cloud rows finalized with "Save to Database" carry their full editable
   payload (metadata.formData) plus a dbSaved marker. Those rows are never
   pushed from local history, so the embedded payload is never overwritten,
   and heavy payloads are not downloaded during regular syncs.
   ===================================================================== */
(function (window) {
    'use strict';

    const SAVED_KEYS_STORAGE = 'entDbSavedRecordKeysV1';
    const REMOTE_ONLY_LIMIT = 100;
    const STUB_UPGRADE_LIMIT = 50;

    const TYPE_LABELS = {
        cf4: 'CF4 Form',
        nasal: 'Nasal Endoscopy',
        laryngeal: 'Laryngeal Endoscopy'
    };

    let isSyncing = false;
    const idleWaiters = [];

    function readDbSavedKeys() {
        try {
            const parsed = JSON.parse(localStorage.getItem(SAVED_KEYS_STORAGE) || '[]');
            return new Set(Array.isArray(parsed) ? parsed : []);
        } catch (error) {
            return new Set();
        }
    }

    function resolveIdleWaiters() {
        while (idleWaiters.length) idleWaiters.shift()();
    }

    // Resolves once the current sync cycle (if any) has finished.
    function whenIdle() {
        if (!isSyncing) return Promise.resolve();
        return new Promise(resolve => idleWaiters.push(resolve));
    }

    function stripHeavyFields(metadata) {
        if (!metadata || typeof metadata !== 'object') return null;
        const copy = { ...metadata };
        delete copy.formData; // full form payloads stay in the cloud only
        return copy;
    }

    // Which doctor's rows may this device read and write?
    //   doctor    -> own rows,  secretary -> her assigned doctor's rows,
    //   admin     -> every row of the clinic.
    // With no signed-in user the engine keeps the old clinic-wide behaviour.
    function owner() {
        const auth = window.EntAuth;
        if (!auth || typeof auth.scope !== 'function') {
            return { doctorId: '', seeAll: true, username: 'unassigned' };
        }
        const scoped = auth.scope() || {};
        const user = typeof auth.currentUser === 'function' ? (auth.currentUser() || {}) : {};
        return {
            doctorId: scoped.doctorId || '',
            seeAll: !!scoped.seeAll,
            username: user.username || 'unknown'
        };
    }

    function doctorFilter() {
        const current = owner();
        return current.seeAll ? '' : `&doctor_id=eq.${encodeURIComponent(current.doctorId)}`;
    }

    function buildStub(row) {
        return {
            key: row.record_key,
            reportType: row.report_type || 'unknown',
            reportLabel: TYPE_LABELS[row.report_type] || row.report_type || 'unknown',
            patientName: row.patient_name || '',
            patientId: row.patient_id || '',
            caseNumber: row.case_number || '',
            fileName: row.file_name || '',
            procedureDate: row.procedure_date || '',
            lastActivityAt: row.updated_at || '',
            syncedAt: row.updated_at || '',
            cloudStub: true
        };
    }

    // Light-weight listing: regular syncs never download metadata.formData payloads.
    async function fetchRemoteStubs(clinicId) {
        const base = `patient_records?clinic_id=eq.${encodeURIComponent(clinicId)}`;
        const columns = 'record_key,doctor_id,report_type,patient_name,patient_id,case_number,file_name,procedure_date,updated_at';
        try {
            return await window.EntSupabase.apiRequest(
                `${base}&select=${columns},metadata->dbSaved&order=updated_at.desc&limit=500` + doctorFilter()
            );
        } catch (error) {
            // Fallback when JSON key extraction is unavailable
            return await window.EntSupabase.apiRequest(
                `${base}&select=${columns}&order=updated_at.desc&limit=500` + doctorFilter()
            );
        }
    }

    async function fetchFullMetadata(clinicId, recordKey) {
        const rows = await window.EntSupabase.apiRequest(
            `patient_records?clinic_id=eq.${encodeURIComponent(clinicId)}` +
            `&record_key=eq.${encodeURIComponent(recordKey)}` +
            '&select=metadata' + doctorFilter()
        );
        if (Array.isArray(rows) && rows[0] && rows[0].metadata && typeof rows[0].metadata === 'object') {
            return rows[0].metadata;
        }
        return null;
    }

    // 1. Sync Patient Records with Supabase
    async function syncPatientRecords() {
        if (!window.EntSupabase || !window.EntSupabase.isConfigured()) return { success: false, reason: 'unconfigured' };
        if (isSyncing) return { success: false, reason: 'busy' };

        isSyncing = true;
        try {
            const config = window.EntSupabase.getConfig();
            const clinicId = config.clinicId || 'main_clinic';
            const localRaw = localStorage.getItem('entPatientRecordHistoryV1');
            const localRecords = localRaw ? JSON.parse(localRaw) : [];
            const localByKey = new Map();
            localRecords.forEach(rec => { if (rec && rec.key) localByKey.set(rec.key, rec); });

            // Light stubs only - heavy metadata.formData payloads are not downloaded here.
            const remoteRows = await fetchRemoteStubs(clinicId);
            const stubs = Array.isArray(remoteRows) ? remoteRows.filter(row => row && row.record_key) : [];
            const stubByKey = new Map(stubs.map(row => [row.record_key, row]));

            // Database-finalized keys: from this device and from other devices.
            const dbSavedKeys = readDbSavedKeys();
            stubs.forEach(row => { if (row.dbSaved) dbSavedKeys.add(row.record_key); });

            const recordMap = new Map();

            // Remote-only records: fetch full metadata (minus formData) so the local
            // drawer keeps names, counts and formats. Bounded per sync cycle.
            const remoteOnly = stubs.filter(row => !localByKey.has(row.record_key)).slice(0, REMOTE_ONLY_LIMIT);
            if (remoteOnly.length) {
                const results = await Promise.allSettled(
                    remoteOnly.map(row => fetchFullMetadata(clinicId, row.record_key))
                );
                results.forEach((result, index) => {
                    const stub = remoteOnly[index];
                    const meta = result.status === 'fulfilled' ? result.value : null;
                    const lightMeta = meta ? stripHeavyFields(meta) : null;
                    if (lightMeta) {
                        recordMap.set(stub.record_key, { ...lightMeta, syncedAt: stub.updated_at || '' });
                    } else {
                        recordMap.set(stub.record_key, buildStub(stub));
                    }
                });
            }

            // Any other remote record gets a light stub for now (local copies win below).
            stubs.forEach(row => {
                if (!recordMap.has(row.record_key)) recordMap.set(row.record_key, buildStub(row));
            });

            // Upgrade records previously stored on this device as stubs (bounded).
            const stubUpgrades = localRecords.filter(rec => rec && rec.cloudStub && rec.key).slice(0, STUB_UPGRADE_LIMIT);
            if (stubUpgrades.length) {
                const upgradeResults = await Promise.allSettled(
                    stubUpgrades.map(rec => fetchFullMetadata(clinicId, rec.key))
                );
                upgradeResults.forEach((result, index) => {
                    if (result.status !== 'fulfilled' || !result.value) return;
                    const localRec = stubUpgrades[index];
                    const lightMeta = stripHeavyFields(result.value);
                    if (!lightMeta) return;
                    const keepActivity = localRec.lastActivityAt;
                    const keepSynced = localRec.syncedAt;
                    Object.assign(localRec, lightMeta);
                    if (keepActivity) localRec.lastActivityAt = keepActivity;
                    if (keepSynced) localRec.syncedAt = keepSynced;
                    delete localRec.cloudStub;
                });
            }

            // Upsert local records that changed locally and are not database-finalized.
            const recordsToPush = [];
            const pushOwner = owner();
            for (const localRec of localRecords) {
                const key = localRec.key || `${localRec.reportType}|${localRec.patientName}|${localRec.procedureDate}`;
                const remote = stubByKey.get(key);
                const localTime = new Date(localRec.lastActivityAt || 0).getTime();
                const remoteTime = remote ? new Date(remote.updated_at || 0).getTime() : 0;
                const isDbSaved = dbSavedKeys.has(key);

                if (!isDbSaved && (!remote || localTime > remoteTime)) {
                    recordsToPush.push({
                        clinic_id: clinicId,
                        // Keep the row in the namespace it already belongs to (an
                        // admin or a shared device must not "adopt" another doctor's
                        // record into the unassigned namespace).
                        doctor_id: (remote && remote.doctor_id) ? remote.doctor_id : pushOwner.doctorId,
                        created_by: pushOwner.username,
                        record_key: key,
                        report_type: localRec.reportType || 'unknown',
                        patient_name: localRec.patientName || '',
                        patient_id: localRec.patientId || '',
                        case_number: localRec.caseNumber || '',
                        procedure_date: localRec.procedureDate || '',
                        file_name: localRec.fileName || '',
                        metadata: localRec,
                        updated_at: new Date().toISOString()
                    });
                }
                // Local copy wins for shared keys so this device keeps its own detail.
                recordMap.set(key, localRec);
            }

            // Push pending records up to Supabase
            if (recordsToPush.length > 0) {
                // Match the UNIQUE (clinic_id, doctor_id, record_key) constraint so
                // updates to existing rows merge instead of failing 23505 / HTTP 409.
                await window.EntSupabase.apiRequest('patient_records?on_conflict=clinic_id,doctor_id,record_key', {
                    method: 'POST',
                    headers: { 'Prefer': 'resolution=merge-duplicates' },
                    body: JSON.stringify(recordsToPush)
                });
            }

            // Merge back into local storage so this device shows every device's records
            const mergedList = Array.from(recordMap.values())
                .filter(Boolean)
                .sort((a, b) => String(b.lastActivityAt || '').localeCompare(String(a.lastActivityAt || '')))
                .slice(0, 500);

            localStorage.setItem('entPatientRecordHistoryV1', JSON.stringify(mergedList));
            window.dispatchEvent(new CustomEvent('patientrecords:updated'));
            return { success: true, count: mergedList.length };
        } catch (err) {
            console.error('Patient record sync failed:', err);
            return { success: false, error: err.message };
        } finally {
            isSyncing = false;
            resolveIdleWaiters();
        }
    }

    // Auto-sync listener when browser reconnects to internet
    window.addEventListener('online', () => {
        if (window.EntSupabase && window.EntSupabase.isConfigured()) {
            syncPatientRecords();
        }
    });

    // Initial sync on app load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            if (window.EntSupabase && window.EntSupabase.isConfigured()) {
                setTimeout(syncPatientRecords, 1000);
            }
        });
    } else {
        if (window.EntSupabase && window.EntSupabase.isConfigured()) {
            setTimeout(syncPatientRecords, 1000);
        }
    }

    window.EntSync = {
        syncPatientRecords,
        whenIdle
    };

})(window);


