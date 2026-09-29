/* =========================================
   SHARED PATIENT RECORDS
   Lightweight metadata history stored only on this device.
   ========================================= */
(function () {
    'use strict';

    const STORAGE_KEY = 'entPatientRecordHistoryV1';
    const MAX_RECORDS = 500;
    const TYPE_LABELS = {
        cf4: 'CF4 Form',
        nasal: 'Nasal Endoscopy',
        laryngeal: 'Laryngeal Endoscopy'
    };
    const FILTERS = [
        { id: 'all', label: 'All' },
        { id: 'cf4', label: 'CF4' },
        { id: 'nasal', label: 'Nasal' },
        { id: 'laryngeal', label: 'Laryngeal' }
    ];

    let activeFilter = 'all';
    let searchTerm = '';
    let button = null;
    let panel = null;
    let countElement = null;

    function normalizeType(type) {
        const value = String(type || '').toLowerCase();
        return ['cf4', 'nasal', 'laryngeal'].includes(value) ? value : '';
    }

    function cleanText(value) {
        if (value === undefined || value === null) return '';
        return String(value).replace(/\s+/g, ' ').trim();
    }

    function firstValue(data, keys) {
        for (const key of keys) {
            const value = cleanText(data && data[key]);
            if (value) return value;
        }
        return '';
    }

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>'"]/g, char => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
        })[char]);
    }

    function readRecords() {
        try {
            const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
            return Array.isArray(parsed) ? parsed : [];
        } catch (error) {
            console.warn('Unable to read patient record history.', error);
            return [];
        }
    }

    function writeRecords(records) {
        const nextRecords = records
            .filter(Boolean)
            .sort((a, b) => String(b.lastActivityAt || '').localeCompare(String(a.lastActivityAt || '')))
            .slice(0, MAX_RECORDS);
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(nextRecords));
        } catch (error) {
            console.warn('Unable to save patient record history.', error);
        }
        updateButtonCount();
        renderPanel();
        window.dispatchEvent(new CustomEvent('patientrecords:updated'));
        
        // Background sync to Supabase when new records are written
        if (window.EntSync && typeof window.EntSync.syncPatientRecords === 'function') {
            window.EntSync.syncPatientRecords().catch(err => {
                console.warn('Background Supabase sync notice:', err);
            });
        }

        return nextRecords;
    }

    function buildPatientName(data) {
        const first = firstValue(data, ['patientFirstName', 'firstName']);
        const middle = firstValue(data, ['patientMiddleName', 'middleName']);
        const last = firstValue(data, ['patientLastName', 'lastName']);
        const suffix = firstValue(data, ['suffix']);
        if (first || middle || last) {
            const givenName = [first, middle].filter(Boolean).join(' ');
            const displayName = last ? [last, givenName].filter(Boolean).join(', ') : [givenName, suffix].filter(Boolean).join(' ');
            return cleanText(displayName);
        }
        return firstValue(data, ['patientName', 'name']);
    }

    function buildRecordKey(metadata) {
        const identity = metadata.patientId
            ? `id:${metadata.patientId.toLowerCase()}`
            : metadata.patientName
                ? `name:${metadata.patientName.toLowerCase()}`
                : `file:${(metadata.fileName || 'unnamed').toLowerCase()}`;
        return `${metadata.reportType}|${identity}|${metadata.procedureDate || 'no-date'}`;
    }

    function extractMetadata(reportType, data = {}, meta = {}) {
        const normalizedType = normalizeType(reportType);
        if (!normalizedType) return null;
        const patientName = buildPatientName(data);
        const patientId = firstValue(data, ['patientPin', 'mrn', 'patientId', 'caseNumber']);
        const caseNumber = firstValue(data, ['caseNumber']);
        const rawReportDate = firstValue(data, [
            'procedureDate',
            'dateDischarged',
            'dateAdmitted',
            'reportDate',
            'operationDate',
            'dateOfProcedure',
            'date',
            'savedAt',
            'createdAt'
        ]);
        const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(rawReportDate);
        const parsedDate = rawReportDate ? new Date(isDateOnly ? `${rawReportDate}T00:00:00` : rawReportDate) : null;
        const isValidDate = parsedDate && !Number.isNaN(parsedDate.getTime());
        const procedureDate = isDateOnly
            ? rawReportDate
            : isValidDate
                ? `${parsedDate.getFullYear()}-${String(parsedDate.getMonth() + 1).padStart(2, '0')}-${String(parsedDate.getDate()).padStart(2, '0')}`
                : (rawReportDate || '');
        return {
            reportType: normalizedType,
            reportLabel: TYPE_LABELS[normalizedType],
            patientName,
            patientId,
            caseNumber,
            procedureDate,
            fileName: cleanText(meta.fileName),
            format: cleanText(meta.format)
        };
    }

    function addFormat(existing, format) {
        const values = Array.isArray(existing) ? existing.slice() : [];
        if (format && !values.includes(format)) values.push(format);
        return values;
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

    function getFilteredRecords() {
        const query = searchTerm.toLowerCase();
        return readRecords().filter(record => {
            if (activeFilter !== 'all' && record.reportType !== activeFilter) return false;
            if (!query) return true;
            return [record.patientName, record.patientId, record.caseNumber, record.fileName, record.reportLabel]
                .some(value => String(value || '').toLowerCase().includes(query));
        });
    }

    function createCard(record) {
        const card = document.createElement('article');
        card.className = 'patient-record-card';
        card.dataset.reportType = record.reportType;
        const identifier = record.patientId || record.caseNumber || 'No patient ID';
        const savedFormats = Array.isArray(record.savedFormats) ? record.savedFormats.join(' + ') : '';
        const reportDate = record.procedureDate
            ? (() => {
                const parsed = new Date(`${record.procedureDate}T00:00:00`);
                if (Number.isNaN(parsed.getTime())) return record.procedureDate;
                return new Intl.DateTimeFormat(undefined, {
                    year: 'numeric', month: 'short', day: '2-digit'
                }).format(parsed);
            })()
            : 'Not set';
        card.innerHTML = `
            <div class="patient-record-topline">
                <span class="patient-record-type">${escapeHtml(record.reportLabel || TYPE_LABELS[record.reportType] || record.reportType)}</span>
                <span class="patient-record-id">${escapeHtml(identifier)}</span>
            </div>
            <h4 class="patient-record-name">${escapeHtml(record.patientName || 'Unnamed patient')}</h4>
            <div class="patient-record-meta">
                <div class="patient-record-meta-item"><strong>Report date</strong>${escapeHtml(reportDate)}</div>
                <div class="patient-record-meta-item"><strong>Last saved</strong>${escapeHtml(formatTimestamp(record.lastSavedAt))}</div>
                <div class="patient-record-meta-item"><strong>Last opened</strong>${escapeHtml(formatTimestamp(record.lastOpenedAt))}</div>
                <div class="patient-record-meta-item"><strong>Activity</strong>${Number(record.saveCount || 0)} save${Number(record.saveCount || 0) === 1 ? '' : 's'} · ${Number(record.openCount || 0)} open${Number(record.openCount || 0) === 1 ? '' : 's'}${savedFormats ? ` · ${escapeHtml(savedFormats)}` : ''}</div>
            </div>
            ${record.fileName ? `<div class="patient-record-file" title="${escapeHtml(record.fileName)}">📄 ${escapeHtml(record.fileName)}</div>` : ''}
        `;
        return card;
    }

    function renderPanel() {
        if (!panel) return;
        const list = panel.querySelector('.patient-records-list');
        const summary = panel.querySelector('.patient-records-summary');
        const clearButton = panel.querySelector('.patient-records-clear');
        if (!list || !summary || !clearButton) return;

        const records = getFilteredRecords();
        const allCount = readRecords().length;
        list.innerHTML = '';
        if (!records.length) {
            const empty = document.createElement('div');
            empty.className = 'patient-records-empty';
            empty.textContent = allCount
                ? 'No records match this search or filter.'
                : 'No saved reports yet. Use Save Draft or Save PDF to start the patient history.';
            list.appendChild(empty);
        } else {
            records.forEach(record => list.appendChild(createCard(record)));
        }
        summary.textContent = `${records.length} shown · ${allCount} total · stored on this device`;
        clearButton.disabled = allCount === 0;
    }

    function updateButtonCount() {
        if (!countElement) return;
        const count = readRecords().length;
        countElement.textContent = count > 99 ? '99+' : String(count);
        countElement.hidden = count === 0;
    }

    function upsertRecord(reportType, data, meta, action) {
        const metadata = extractMetadata(reportType, data, meta);
        if (!metadata) return null;
        const timestamp = new Date().toISOString();
        const records = readRecords();
        const key = buildRecordKey(metadata);
        let record = records.find(item => item.key === key);
        if (!record) {
            record = {
                id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                key,
                createdAt: timestamp,
                firstSavedAt: null,
                lastSavedAt: null,
                firstOpenedAt: null,
                lastOpenedAt: null,
                saveCount: 0,
                openCount: 0,
                savedFormats: [],
                openedFormats: []
            };
        }

        Object.assign(record, metadata);
        if (action === 'save') {
            record.firstSavedAt = record.firstSavedAt || timestamp;
            record.lastSavedAt = timestamp;
            record.saveCount = Number(record.saveCount || 0) + 1;
            record.savedFormats = addFormat(record.savedFormats, metadata.format);
        } else if (action === 'open') {
            record.firstOpenedAt = record.firstOpenedAt || timestamp;
            record.lastOpenedAt = timestamp;
            record.openCount = Number(record.openCount || 0) + 1;
            record.openedFormats = addFormat(record.openedFormats, metadata.format);
        }
        record.lastActivityAt = timestamp;
        const existingIndex = records.findIndex(item => item.key === key);
        if (existingIndex >= 0) records.splice(existingIndex, 1);
        records.unshift(record);
        writeRecords(records);
        return record;
    }

    function positionPanel() {
        if (!panel || !button) return;
        const rect = button.getBoundingClientRect();
        const panelWidth = Math.min(440, window.innerWidth - 24);
        const left = Math.max(12, Math.min(window.innerWidth - panelWidth - 12, rect.right - panelWidth));
        panel.style.left = `${left}px`;
        panel.style.right = 'auto';
        panel.style.top = `${Math.max(8, rect.bottom + 6)}px`;
        const availableHeight = window.innerHeight - Math.max(8, rect.bottom + 6) - 10;
        panel.style.maxHeight = `${Math.max(180, availableHeight)}px`;
    }

    function setPanelOpen(open) {
        if (!panel || !button) return;
        panel.classList.toggle('is-open', open);
        button.setAttribute('aria-expanded', String(open));
        if (open) {
            positionPanel();
            renderPanel();
        }
    }

    function buildPanel() {
        panel = document.createElement('section');
        panel.className = 'patient-records-popover no-print';
        panel.id = 'patientRecordsPopover';
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-label', 'Saved patient reports');
        panel.innerHTML = `
            <div class="patient-records-header">
                <div>
                    <h2 class="patient-records-title">🗂 Patient Records</h2>
                    <p class="patient-records-subtitle">Saved CF4 and Endoscopy reports on this device</p>
                </div>
                <button type="button" class="patient-records-close" aria-label="Close patient records">×</button>
            </div>
            <div class="patient-records-search-wrap">
                <input type="search" class="patient-records-search" placeholder="Search patient, MRN/PIN, case no., or file..." aria-label="Search patient records">
            </div>
            <div class="patient-records-filters" role="group" aria-label="Filter patient records">
                ${FILTERS.map(filter => `<button type="button" class="patient-records-filter${filter.id === 'all' ? ' is-active' : ''}" data-record-filter="${filter.id}">${filter.label}</button>`).join('')}
            </div>
            <div class="patient-records-list"></div>
            <div class="patient-records-footer" style="display:flex; justify-content:space-between; align-items:center;">
                <span class="patient-records-summary"></span>
                <div style="display:flex; gap:8px;">
                    <button type="button" class="patient-records-sync" title="Sync records with Supabase cloud" style="background:#e0f2fe; color:#0369a1; border:1px solid #bae6fd; border-radius:6px; font-size:12px; padding:4px 8px; cursor:pointer;">☁️ Sync Now</button>
                    <button type="button" class="patient-records-clear">Clear History</button>
                </div>
            </div>
        `;
        document.body.appendChild(panel);

        panel.querySelector('.patient-records-close').addEventListener('click', () => setPanelOpen(false));
        panel.querySelector('.patient-records-search').addEventListener('input', event => {
            searchTerm = event.target.value;
            renderPanel();
        });
        panel.querySelectorAll('[data-record-filter]').forEach(filterButton => {
            filterButton.addEventListener('click', () => {
                activeFilter = filterButton.dataset.recordFilter;
                panel.querySelectorAll('[data-record-filter]').forEach(item => item.classList.toggle('is-active', item === filterButton));
                renderPanel();
            });
        });
        panel.querySelector('.patient-records-clear').addEventListener('click', () => {
            if (!readRecords().length) return;
            if (window.confirm('Clear the saved patient-record history from this device? Your downloaded draft and PDF files will not be deleted.')) {
                writeRecords([]);
            }
        });
        const syncBtn = panel.querySelector('.patient-records-sync');
        if (syncBtn) {
            syncBtn.addEventListener('click', async () => {
                if (!window.EntSync) return;
                const orig = syncBtn.textContent;
                syncBtn.textContent = '⏳ Syncing...';
                syncBtn.disabled = true;
                try {
                    const res = await window.EntSync.syncPatientRecords();
                    if (res && res.success) {
                        syncBtn.textContent = '✅ Synced!';
                    } else {
                        syncBtn.textContent = '⚠️ Failed';
                    }
                } catch (e) {
                    syncBtn.textContent = '⚠️ Error';
                } finally {
                    setTimeout(() => {
                        syncBtn.textContent = orig;
                        syncBtn.disabled = false;
                    }, 2500);
                }
            });
        }
    }

    // The floating "Records / saved patients" popover button is switched off:
    // Database ▸ DB Records already lets the user browse every saved report, and
    // the extra button crowded the report header. This module keeps running so
    // recordSave()/recordOpen() still maintain the local saved-patients history
    // (dbRecords.js, draftsBrowser.js and the form scripts call into it).
    // Flip this flag to true to bring the button back on every report page.
    const RECORDS_UI_ENABLED = false;

    function initializeUI() {
        if (!RECORDS_UI_ENABLED) return;
        if (!document.querySelector('.report-header')) return;
        const actions = document.querySelector('.report-header .header-actions');
        if (!actions) return;
        if (panel) {
            button = document.getElementById('patientRecordsBtn') || button;
            countElement = button?.querySelector('.patient-records-count') || countElement;
            bindUI();
            return;
        }

        button = document.getElementById('patientRecordsBtn');
        if (button) {
            // The report pages provide the button in markup; the shared module only binds it.
        } else {
            button = document.createElement('button');
            button.type = 'button';
            button.id = 'patientRecordsBtn';
            button.className = 'btn-patient-records no-print';
            button.setAttribute('aria-haspopup', 'dialog');
            button.setAttribute('aria-expanded', 'false');
            button.title = 'View saved CF4 and Endoscopy patient reports';
            button.innerHTML = `
                <span class="btn-icon">🗂</span>
                <span class="btn-label"><span class="btn-main">Records</span><span class="btn-sub">saved patients</span></span>
                <span class="patient-records-count" hidden>0</span>
            `;
            actions.insertBefore(button, actions.firstChild);
        }
        countElement = button.querySelector('.patient-records-count');
        buildPanel();
        bindUI();
    }

    function bindUI() {
        if (!panel || !button || button.dataset.patientRecordsBound === 'true') return;
        button.dataset.patientRecordsBound = 'true';
        updateButtonCount();
        button.addEventListener('click', event => {
            event.stopPropagation();
            setPanelOpen(!panel.classList.contains('is-open'));
        });
        panel.addEventListener('click', event => event.stopPropagation());
        document.addEventListener('click', event => {
            if (!button.contains(event.target) && !panel.contains(event.target)) setPanelOpen(false);
        });
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape') setPanelOpen(false);
        });
        window.addEventListener('resize', positionPanel);
        window.addEventListener('scroll', positionPanel, true);
        window.addEventListener('patientrecords:updated', updateButtonCount);
    }

    window.PatientRecords = {
        recordSave(reportType, data, meta = {}) {
            return upsertRecord(reportType, data, meta, 'save');
        },
        recordOpen(reportType, data, meta = {}) {
            return upsertRecord(reportType, data, meta, 'open');
        },
        getAll() {
            return readRecords();
        },
        clear() {
            writeRecords([]);
        },
        ensureUI() {
            initializeUI();
            updateButtonCount();
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            initializeUI();
            updateButtonCount();
        }, { once: true });
    } else {
        initializeUI();
        updateButtonCount();
    }
})();

