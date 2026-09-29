/* =====================================================================
   DATABASE RECORDS - Supabase final save & in-form record browser
   Shared by cf4Form.html, nasalEndoscopy.html and laryngealEndoscopy.html.
   Depends on: supabaseClient.js (window.EntSupabase),
                syncEngine.js (window.EntSync),
                patientRecords.js (window.PatientRecords)
   The active form page exposes window.EntFormBridge with:
       { reportType, getData(), restore(data), alert(message, title) }
   ===================================================================== */
(function (window) {
    'use strict';

    const SAVED_KEYS_STORAGE = 'entDbSavedRecordKeysV1';
    const MAX_LIST_RECORDS = 200;

    const TYPE_LABELS = {
        cf4: 'CF4 Form',
        nasal: 'Nasal Endoscopy',
        laryngeal: 'Laryngeal Endoscopy'
    };

    let modal = null;
    let confirmBox = null;
    let confirmResolver = null;
    let listElement = null;
    let statusElement = null;
    let searchElement = null;
    let currentRecords = [];
    let saving = false;

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------
    function getBridge() {
        const bridge = window.EntFormBridge;
        if (!bridge || typeof bridge.getData !== 'function' || typeof bridge.restore !== 'function') {
            return null;
        }
        return bridge;
    }

    function showAlert(message, title) {
        const bridge = getBridge();
        if (bridge && typeof bridge.alert === 'function') {
            bridge.alert(message, title);
        } else {
            window.alert(message);
        }
    }

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>'"]/g, char => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
        })[char]);
    }

    function formatDate(value) {
        if (!value) return 'Date not set';
        const parsed = new Date(`${value}T00:00:00`);
        if (Number.isNaN(parsed.getTime())) return value;
        return new Intl.DateTimeFormat(undefined, {
            year: 'numeric', month: 'short', day: '2-digit'
        }).format(parsed);
    }

    function formatTimestamp(value) {
        if (!value) return 'Not yet';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return 'Unknown';
        return new Intl.DateTimeFormat(undefined, {
            year: 'numeric', month: 'short', day: '2-digit',
            hour: '2-digit', minute: '2-digit'
        }).format(date);
    }

    // ------------------------------------------------------------------
    // Doctor scoping - decides which rows this user may read or write.
    //   doctor    -> only his/her own rows
    //   secretary -> rows of the doctor she is assigned to
    //   admin     -> every row of the clinic
    // With no signed-in user (file:// preview, older cached page) it falls
    // back to the pre-auth behaviour: clinic-wide, unassigned owner.
    // ------------------------------------------------------------------
    function actor() {
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

    // Extra PostgREST filter restricting a query to the caller's doctor.
    function doctorFilter() {
        const a = actor();
        return a.seeAll ? '' : `&doctor_id=eq.${encodeURIComponent(a.doctorId)}`;
    }

    function logActivity(action, detail) {
        if (window.EntAuth && typeof window.EntAuth.logActivity === 'function') {
            window.EntAuth.logActivity(action, detail).catch(() => {});
        }
    }

    // Records finalized to the database are flagged locally so the background
    // sync never overwrites the cloud copy's embedded form payload.
    function readSavedKeys() {
        try {
            const parsed = JSON.parse(localStorage.getItem(SAVED_KEYS_STORAGE) || '[]');
            return new Set(Array.isArray(parsed) ? parsed : []);
        } catch (error) {
            console.warn('Unable to read database save flags.', error);
            return new Set();
        }
    }

    function markKeySaved(key) {
        try {
            const keys = readSavedKeys();
            keys.add(key);
            localStorage.setItem(SAVED_KEYS_STORAGE, JSON.stringify(Array.from(keys).slice(-2000)));
        } catch (error) {
            console.warn('Unable to remember database save flag.', error);
        }
    }

    // ------------------------------------------------------------------
    // Save current form to Supabase (final save)
    // ------------------------------------------------------------------
    async function saveToDatabase() {
        if (saving) return;

        const bridge = getBridge();
        if (!bridge) {
            showAlert('The current form is not ready yet. Please try again in a moment.', 'Not Ready');
            return;
        }
        if (!window.EntSupabase || !window.EntSupabase.isConfigured()) {
            showAlert('The cloud database is not configured yet.\n\nOpen Settings \u2192 Cloud Sync to add your Supabase credentials.', 'Database Not Configured');
            return;
        }

        let formData;
        try {
            formData = bridge.getData();
        } catch (error) {
            console.error('Could not read form data:', error);
            showAlert('COULD NOT READ THE FORM\n\n' + error.message, 'ERROR');
            return;
        }
        if (!formData || !Object.keys(formData).length) {
            showAlert('The form is empty - there is nothing to save yet.', 'Empty Form');
            return;
        }

        // A final database save should identify the patient when possible.
        const identityKeys = ['patientLastName', 'patientFirstName', 'patientName', 'patientPin', 'mrn', 'patientId', 'caseNumber'];
        const hasIdentity = identityKeys.some(key => String(formData[key] || '').trim());
        if (!hasIdentity) {
            const proceed = await showConfirm(
                'No patient name or ID was detected in the form. Save this record to the database anyway?',
                'Missing Patient Info'
            );
            if (!proceed) return;
        }

        const saveButton = document.getElementById('saveToDbBtn');
        const mainLabel = saveButton ? saveButton.querySelector('.btn-main') : null;
        const originalLabel = mainLabel ? mainLabel.textContent : '';
        saving = true;
        if (saveButton) saveButton.disabled = true;
        if (mainLabel) mainLabel.textContent = 'Saving...';

        try {
            const record = window.PatientRecords
                ? window.PatientRecords.recordSave(bridge.reportType, formData, { format: 'Database' })
                : null;
            if (!record) {
                throw new Error('Could not build the record entry for this report type.');
            }

            // Let any background sync finish first so the final payload
            // (with the editable form data) is always the last write.
            if (window.EntSync && typeof window.EntSync.whenIdle === 'function') {
                await window.EntSync.whenIdle();
            }

            const config = window.EntSupabase.getConfig();
            const now = new Date().toISOString();
            const owner = actor();
            const row = {
                clinic_id: config.clinicId || 'main_clinic',
                doctor_id: owner.doctorId,
                created_by: owner.username,
                record_key: record.key,
                report_type: record.reportType,
                patient_name: record.patientName || '',
                patient_id: record.patientId || '',
                case_number: record.caseNumber || '',
                procedure_date: record.procedureDate || '',
                file_name: record.fileName || '',
                metadata: { ...record, formData, dbSaved: true, savedToDbAt: now },
                updated_at: now
            };

            // The table has a UNIQUE (clinic_id, doctor_id, record_key) constraint;
            // without an explicit conflict target PostgREST only resolves conflicts
            // on the primary key, so re-saving an existing record raised 23505 (409).
            await window.EntSupabase.apiRequest('patient_records?on_conflict=clinic_id,doctor_id,record_key', {
                method: 'POST',
                headers: { 'Prefer': 'resolution=merge-duplicates' },
                body: JSON.stringify([row])
            });

            markKeySaved(record.key);
            logActivity('SAVE_RECORD', `${record.reportType} - ${record.patientName || record.key}`);

            const label = TYPE_LABELS[record.reportType] || record.reportType;
            const who = record.patientName ? ` for ${record.patientName}` : '';
            showAlert(
                'SAVED TO DATABASE!\n\n' +
                label + who + ' was saved to the shared cloud database.\n\n' +
                'You can reopen it anytime from the "DB Records" button in the header.',
                'SUCCESS'
            );
        } catch (error) {
            console.error('Save to database failed:', error);
            const conflict = /\(409\)|23505|on_conflict|ON CONFLICT/.test(String(error.message || ''));
            showAlert(
                'COULD NOT SAVE TO DATABASE\n\n' + error.message + '\n\n' +
                (conflict
                    ? 'The server already has a record with the same patient/record key and could not update it. ' +
                      'Make sure your Supabase schema matches supabase_schema.sql, then try again.'
                    : 'Check your internet connection and your Supabase settings, then try again.'),
                'ERROR'
            );
        } finally {
            saving = false;
            if (saveButton) saveButton.disabled = false;
            if (mainLabel) mainLabel.textContent = originalLabel;
        }
    }

    // ------------------------------------------------------------------
    // Database records modal (browse / search / open for editing)
    // ------------------------------------------------------------------
    function setStatus(message, isLoading, isError) {
        if (!statusElement) return;
        statusElement.textContent = message || '';
        statusElement.classList.toggle('is-loading', Boolean(isLoading));
        statusElement.classList.toggle('is-error', Boolean(isError));
        statusElement.hidden = !message;
    }

    function closeModal() {
        if (modal) modal.style.display = 'none';
    }

    function ensureModal() {
        if (modal) return modal;

        modal = document.createElement('div');
        modal.id = 'entDbRecordsModal';
        modal.className = 'modal-overlay ent-db-modal no-print';
        modal.style.display = 'none';
        modal.innerHTML = `
            <div class="ent-db-dialog" role="dialog" aria-modal="true" aria-label="Cloud database records">
                <div class="ent-db-header">
                    <div class="ent-db-heading">
                        <h2>&#9729;&#65039; Database Records</h2>
                        <p class="ent-db-subtitle">Reports saved to the shared cloud database for this report type</p>
                    </div>
                    <button type="button" class="ent-db-close" aria-label="Close database records">&times;</button>
                </div>
                <div class="ent-db-toolbar">
                    <input type="search" class="ent-db-search" placeholder="Search patient, MRN/PIN, case no., or file..." aria-label="Search database records">
                    <button type="button" class="ent-db-refresh" title="Reload records from the database">&#8635; Refresh</button>
                </div>
                <div class="ent-db-status" role="status" hidden></div>
                <div class="ent-db-list"></div>
            </div>
        `;
        document.body.appendChild(modal);

        listElement = modal.querySelector('.ent-db-list');
        statusElement = modal.querySelector('.ent-db-status');
        searchElement = modal.querySelector('.ent-db-search');

        modal.querySelector('.ent-db-close').addEventListener('click', closeModal);
        modal.querySelector('.ent-db-refresh').addEventListener('click', () => loadRecords());
        searchElement.addEventListener('input', () => renderList(currentRecords));
        modal.addEventListener('click', event => { if (event.target === modal) closeModal(); });
        document.addEventListener('keydown', event => {
            if (event.key !== 'Escape') return;
            if (confirmBox && confirmBox.style.display === 'flex') { finishConfirm(false); return; }
            if (modal && modal.style.display !== 'none') closeModal();
        });

        return modal;
    }

    function openRecordsModal() {
        const bridge = getBridge();
        if (!bridge) {
            showAlert('This page does not have an open form to load records into.', 'Not Available');
            return;
        }
        ensureModal();
        modal.style.display = 'flex';
        loadRecords();
    }



    async function loadRecords() {
        const bridge = getBridge();
        if (!bridge) return;

        if (!window.EntSupabase || !window.EntSupabase.isConfigured()) {
            currentRecords = [];
            renderList([]);
            setStatus('Cloud database is not configured. Open Settings \u2192 Cloud Sync first.', false, true);
            return;
        }

        setStatus('Loading records from the database...', true, false);
        try {
            const config = window.EntSupabase.getConfig();
            const clinicId = config.clinicId || 'main_clinic';
            const rows = await window.EntSupabase.apiRequest(
                `patient_records?clinic_id=eq.${encodeURIComponent(clinicId)}` +
                `&report_type=eq.${encodeURIComponent(bridge.reportType)}` +
                `&select=record_key,report_type,patient_name,patient_id,case_number,file_name,procedure_date,updated_at` +
                `&order=updated_at.desc&limit=${MAX_LIST_RECORDS}` +
                doctorFilter()
            );
            currentRecords = Array.isArray(rows) ? rows : [];
            renderList(currentRecords);
        } catch (error) {
            console.error('Could not load database records:', error);
            currentRecords = [];
            renderList([]);
            setStatus(`Could not load records: ${error.message}`, false, true);
        }
    }

    function renderList(records) {
        if (!listElement) return;
        const query = String((searchElement && searchElement.value) || '').toLowerCase().trim();
        const filtered = (records || []).filter(record => {
            if (!query) return true;
            return [record.patient_name, record.patient_id, record.case_number, record.file_name, record.record_key]
                .some(value => String(value || '').toLowerCase().includes(query));
        });

        listElement.innerHTML = '';
        if (!filtered.length) {
            const empty = document.createElement('div');
            empty.className = 'ent-db-empty';
            empty.textContent = (records && records.length)
                ? 'No records match this search.'
                : 'No database records for this report type yet. Use "Save to Database" (\u2601\uFE0F) in the header to save the current report here.';
            listElement.appendChild(empty);
            if (records && records.length) setStatus(`${records.length} record(s) - none match the search.`, false, false);
            return;
        }

        filtered.forEach(record => listElement.appendChild(buildCard(record)));
        const suffix = query ? ` (filtered from ${records.length})` : '';
        setStatus(`${filtered.length} record${filtered.length === 1 ? '' : 's'}${suffix}`, false, false);
    }

    function buildCard(record) {
        const card = document.createElement('article');
        card.className = 'ent-db-card';
        const label = TYPE_LABELS[record.report_type] || record.report_type || 'Report';
        const identifier = record.patient_id || record.case_number || 'No patient ID';
        card.innerHTML = `
            <div class="ent-db-card-main">
                <div class="ent-db-card-topline">
                    <span class="ent-db-badge">${escapeHtml(label)}</span>
                    <span class="ent-db-card-id">${escapeHtml(identifier)}</span>
                </div>
                <h4 class="ent-db-card-name">${escapeHtml(record.patient_name || 'Unnamed patient')}</h4>
                <div class="ent-db-card-meta">
                    <span>&#128197; ${escapeHtml(formatDate(record.procedure_date))}</span>
                    <span>saved ${escapeHtml(formatTimestamp(record.updated_at))}</span>
                </div>
                ${record.file_name ? `<div class="ent-db-card-file" title="${escapeHtml(record.file_name)}">&#128196; ${escapeHtml(record.file_name)}</div>` : ''}
            </div>
            <button type="button" class="ent-db-open">Open</button>
        `;
        card.querySelector('.ent-db-open').addEventListener('click', () => confirmAndOpen(record));
        return card;
    }

    // ------------------------------------------------------------------
    // Confirm dialog (promise based)
    // ------------------------------------------------------------------
    function finishConfirm(result) {
        if (!confirmBox) return;
        confirmBox.style.display = 'none';
        if (confirmResolver) {
            const resolve = confirmResolver;
            confirmResolver = null;
            resolve(result);
        }
    }

    function showConfirm(message, title) {
        if (!confirmBox) {
            confirmBox = document.createElement('div');
            confirmBox.className = 'modal-overlay ent-db-confirm no-print';
            confirmBox.style.display = 'none';
            confirmBox.innerHTML = `
                <div class="ent-db-confirm-dialog" role="dialog" aria-modal="true">
                    <h3 class="ent-db-confirm-title"></h3>
                    <p class="ent-db-confirm-text"></p>
                    <div class="ent-db-confirm-actions">
                        <button type="button" class="ent-db-confirm-no">Cancel</button>
                        <button type="button" class="ent-db-confirm-yes">Yes, open it</button>
                    </div>
                </div>
            `;
            document.body.appendChild(confirmBox);
            confirmBox.querySelector('.ent-db-confirm-no').addEventListener('click', () => finishConfirm(false));
            confirmBox.querySelector('.ent-db-confirm-yes').addEventListener('click', () => finishConfirm(true));
            confirmBox.addEventListener('click', event => { if (event.target === confirmBox) finishConfirm(false); });
        }
        confirmBox.querySelector('.ent-db-confirm-title').textContent = title || 'Confirm';
        confirmBox.querySelector('.ent-db-confirm-text').textContent = message;
        confirmBox.style.display = 'flex';
        confirmBox.querySelector('.ent-db-confirm-yes').focus();
        return new Promise(resolve => { confirmResolver = resolve; });
    }

    // ------------------------------------------------------------------
    // Open a cloud record into the current form
    // ------------------------------------------------------------------
    function confirmAndOpen(record) {
        const bridge = getBridge();
        if (!bridge) {
            showAlert('This page does not have an open form to load records into.', 'Not Available');
            return;
        }

        const display = record.patient_name || record.record_key || 'this record';
        showConfirm(
            `Opening "${display}" will replace the current form contents (including images). Continue?`,
            'Open Database Record'
        ).then(confirmed => {
            if (!confirmed) return;
            openRecordFromCloud(record, bridge);
        });
    }

    async function openRecordFromCloud(record, bridge) {
        setStatus(`Opening ${record.patient_name || record.record_key}...`, true, false);
        try {
            const config = window.EntSupabase.getConfig();
            const clinicId = config.clinicId || 'main_clinic';
            const rows = await window.EntSupabase.apiRequest(
                `patient_records?clinic_id=eq.${encodeURIComponent(clinicId)}` +
                `&record_key=eq.${encodeURIComponent(record.record_key)}` +
                '&select=metadata,report_type,updated_at' +
                doctorFilter()
            );
            const row = Array.isArray(rows) ? rows[0] : null;
            const formData = row && row.metadata ? row.metadata.formData : null;

            if (!formData || typeof formData !== 'object') {
                throw new Error('This record has no editable form data attached (it was synced without a final "Save to Database").');
            }
            if (row.report_type !== bridge.reportType) {
                throw new Error('This record belongs to a different report type and cannot be opened on this page.');
            }

            bridge.restore(formData);
            logActivity('OPEN_RECORD', `${row.report_type} - ${record.patient_name || record.record_key}`);
            if (window.PatientRecords && typeof window.PatientRecords.recordOpen === 'function') {
                window.PatientRecords.recordOpen(row.report_type, formData, { format: 'Database' });
            }

            closeModal();
            setStatus('', false, false);
            showAlert(
                'RECORD LOADED!\n\n' +
                (record.patient_name || 'The record') + ' is now open in the form.\n\n' +
                'Review the entries and use "Save to Database" (\u2601\uFE0F) to save your changes back to the cloud.',
                'SUCCESS'
            );
        } catch (error) {
            console.error('Could not open database record:', error);
            setStatus(`Could not open record: ${error.message}`, false, true);
            showAlert('COULD NOT OPEN RECORD\n\n' + error.message, 'ERROR');
        }
    }




    // ------------------------------------------------------------------
    // Button wiring
    // ------------------------------------------------------------------
    function bindButtons() {
        const saveButton = document.getElementById('saveToDbBtn');
        if (saveButton && saveButton.dataset.dbRecordsBound !== 'true') {
            saveButton.dataset.dbRecordsBound = 'true';
            saveButton.addEventListener('click', () => { saveToDatabase(); });
        }
        const browseButton = document.getElementById('dbRecordsBtn');
        if (browseButton && browseButton.dataset.dbRecordsBound !== 'true') {
            browseButton.dataset.dbRecordsBound = 'true';
            browseButton.addEventListener('click', () => { openRecordsModal(); });
        }
    }

    window.EntDbRecords = {
        saveToDatabase,
        openRecordsModal,
        markKeySaved,
        readSavedKeys
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindButtons, { once: true });
    } else {
        bindButtons();
    }

})(window);
