/* =====================================================================
   LOCAL DRAFTS BROWSER - "Save Draft" popup that lists every draft
   stored on THIS DEVICE ONLY (localStorage key: entSavedDraftsV1).
   Nothing here is ever uploaded. Shared by cf4Form.html,
   nasalEndoscopy.html and laryngealEndoscopy.html.

   Depends on: (optional) patientRecords.js (window.PatientRecords)
   The active form page exposes window.EntFormBridge with:
       { reportType, getData(), restore(data), alert(message, title) }
   ===================================================================== */
(function (window) {
    'use strict';

    const STORAGE_KEY = 'entSavedDraftsV1';
    const MAX_DRAFTS = 100;

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
    let summaryElement = null;
    let statusTimer = null;
    let searchTerm = '';

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
        return String(value ?? '').replace(/[&<>'\"]/g, char => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '\"': '&quot;'
        })[char]);
    }

    function cleanText(value) {
        return String(value ?? '').trim();
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

    function formatBytes(bytes) {
        if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
        if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
        return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    }

    function normalizeDate(raw) {
        const text = cleanText(raw);
        if (!text) return '';
        if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
        const parsed = new Date(text);
        if (Number.isNaN(parsed.getTime())) return text;
        return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
    }

    function extractMeta(reportType, formData, fileName) {
        const normalizedType = TYPE_LABELS[reportType] ? reportType : 'nasal';
        const lastName = cleanText(formData.patientLastName);
        const firstName = cleanText(formData.patientFirstName);
        const patientName = [lastName, firstName].filter(Boolean).join(', ')
            || cleanText(formData.patientName)
            || 'Unnamed patient';
        const patientId = cleanText(
            formData.patientPin || formData.mrn || formData.patientId || formData.caseNumber
        );
        const caseNumber = cleanText(formData.caseNumber);
        const procedureDate = normalizeDate(
            formData.procedureDate || formData.reportDate || formData.dateOfProcedure ||
            formData.operationDate || formData.dateAdmitted || formData.date || ''
        );
        return {
            reportType: normalizedType,
            reportLabel: TYPE_LABELS[normalizedType],
            patientName,
            patientId,
            caseNumber,
            procedureDate,
            fileName: cleanText(fileName)
        };
    }

    function buildKey(meta) {
        return `${meta.reportType}|${meta.patientName.toLowerCase()}|${meta.procedureDate || 'no-date'}`;
    }

    // ------------------------------------------------------------------
    // Local storage (device only, quota-safe)
    // ------------------------------------------------------------------
    function readDrafts() {
        try {
            const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]');
            const list = Array.isArray(parsed) ? parsed.filter(draft => draft && draft.id) : [];
            return list.sort((a, b) => String(b.savedAt || '').localeCompare(String(a.savedAt || '')));
        } catch (error) {
            console.warn('Unable to read local drafts.', error);
            return [];
        }
    }

    function isQuotaError(error) {
        return Boolean(error) && (
            error.name === 'QuotaExceededError' ||
            error.code === 22 ||
            error.code === 1014
        );
    }

    function stripImages(draft) {
        if (!draft || !draft.formData || typeof draft.formData !== 'object') return null;
        const images = draft.formData.images;
        if (!Array.isArray(images) || images.length === 0) return null;
        return { ...draft, formData: { ...draft.formData, images: [] }, imagesStripped: true };
    }

    function writeDrafts(drafts) {
        const attempt = (list) => {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
            return list;
        };
        let working = drafts.slice(0, MAX_DRAFTS);
        try {
            return attempt(working);
        } catch (error) {
            if (!isQuotaError(error)) throw error;
        }

        // 1) Storage full: drop embedded photos from the OLDEST drafts first.
        working = drafts.slice(0, MAX_DRAFTS);
        for (let i = working.length - 1; i >= 0; i--) {
            const stripped = stripImages(working[i]);
            if (!stripped) continue;
            working[i] = stripped;
            try {
                return attempt(working);
            } catch (error) {
                if (!isQuotaError(error)) throw error;
            }
        }

        // 2) Still full: remove the oldest drafts entirely (newest kept).
        working = drafts.slice(0, MAX_DRAFTS);
        while (working.length > 1) {
            working = working.slice(0, -1);
            try {
                return attempt(working);
            } catch (error) {
                if (!isQuotaError(error)) throw error;
            }
        }

        // 3) Last resort: keep only the newest draft, without its photos.
        if (working[0]) {
            const stripped = stripImages(working[0]) ||
                (working[0].formData
                    ? { ...working[0], formData: { ...working[0].formData, images: [] }, imagesStripped: true }
                    : null);
            if (stripped) {
                working = [stripped];
                try {
                    return attempt(working);
                } catch (error) {
                    if (!isQuotaError(error)) throw error;
                }
            }
        }

        throw new Error('Local storage is full. Delete some drafts from the list and try again.');
    }

    // ------------------------------------------------------------------
    // Save / download / open / delete
    // ------------------------------------------------------------------
    function saveDraft(reportType, formData, fileName) {
        if (!formData || typeof formData !== 'object') {
            throw new Error('There is no form data to save.');
        }
        const drafts = readDrafts();
        const meta = extractMeta(reportType, formData, fileName);
        const key = buildKey(meta);
        const timestamp = new Date().toISOString();

        let draft = drafts.find(item => item.key === key);
        if (draft) {
            drafts.splice(drafts.indexOf(draft), 1);
        } else {
            draft = {
                id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                key,
                createdAt: timestamp,
                saveCount: 0,
                imagesStripped: false
            };
        }
        Object.assign(draft, meta);
        draft.key = key;
        draft.fileName = cleanText(fileName) || draft.fileName || '';
        draft.formData = formData;
        draft.savedAt = timestamp;
        draft.saveCount = Number(draft.saveCount || 0) + 1;
        drafts.unshift(draft);

        writeDrafts(drafts);
        return draft;
    }

    function buildFileName(draft) {
        if (draft.fileName) return draft.fileName;
        const label = String(draft.reportLabel || 'Draft').replace(/\s+/g, '_');
        const base = draft.patientName && draft.patientName !== 'Unnamed patient'
            ? draft.patientName.replace(/[^a-z0-9\s,-]/gi, '').trim().replace(/\s+/g, '_')
            : '';
        return base ? `${base}_${label}_Data.json` : `${label}_Data.json`;
    }

    function downloadDraft(draft) {
        if (!draft || !draft.formData) {
            setStatus('This draft has no form data attached.', true);
            return;
        }
        try {
            const dataStr = JSON.stringify(draft.formData, null, 2);
            const filename = buildFileName(draft);
            const blob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            setStatus(`⬇ Downloaded "${filename}"`);
        } catch (error) {
            console.error('Error downloading draft:', error);
            setStatus(`Could not download: ${error.message}`, true);
        }
    }

    function showConfirm(message, title) {
        return new Promise(resolve => {
            if (!modal) {
                resolve(window.confirm(message));
                return;
            }
            if (confirmResolver) confirmResolver(false);
            confirmBox = document.createElement('div');
            confirmBox.className = 'ent-drafts-confirm';
            confirmBox.innerHTML = `
                <div class="ent-drafts-confirm-dialog" role="alertdialog" aria-modal="true">
                    <h3 class="ent-drafts-confirm-title">${escapeHtml(title)}</h3>
                    <p class="ent-drafts-confirm-text">${escapeHtml(message)}</p>
                    <div class="ent-drafts-confirm-actions">
                        <button type="button" class="ent-drafts-confirm-no">Cancel</button>
                        <button type="button" class="ent-drafts-confirm-yes">Continue</button>
                    </div>
                </div>`;
            modal.appendChild(confirmBox);
            const settle = (value) => {
                if (confirmBox && confirmBox.parentNode) {
                    confirmBox.parentNode.removeChild(confirmBox);
                }
                confirmBox = null;
                confirmResolver = null;
                resolve(value);
            };
            confirmResolver = settle;
            confirmBox.querySelector('.ent-drafts-confirm-no').addEventListener('click', () => settle(false));
            confirmBox.querySelector('.ent-drafts-confirm-yes').addEventListener('click', () => settle(true));
        });
    }

    async function openDraft(draft) {
        const bridge = getBridge();
        if (!bridge) {
            showAlert('This page cannot restore drafts.', 'ERROR');
            return;
        }
        if (!draft.formData) {
            setStatus('This draft has no form data attached.', true);
            return;
        }
        if (draft.reportType !== bridge.reportType) {
            showAlert(
                `This is a ${draft.reportLabel || 'different report'} draft and cannot be opened on this page.\n\n` +
                `Open it from the ${draft.reportLabel || 'matching report'} page to continue editing.`,
                'DIFFERENT REPORT'
            );
            return;
        }
        const confirmed = await showConfirm(
            `Opening "${draft.patientName}" will replace the current form contents (including images). Continue?`,
            'Open Saved Draft'
        );
        if (!confirmed) return;
        try {
            bridge.restore(draft.formData);
            if (window.PatientRecords && typeof window.PatientRecords.recordOpen === 'function') {
                window.PatientRecords.recordOpen(draft.reportType, draft.formData, { format: 'Draft', fileName: draft.fileName });
            }
            closeModal();
            showAlert(
                'DRAFT LOADED!\n\n' +
                (draft.patientName || 'The draft') + ' is now open in the form.\n\n' +
                'Continue editing, then use "Save Draft" (💾) to store your changes again.',
                'SUCCESS'
            );
        } catch (error) {
            console.error('Could not open local draft:', error);
            setStatus(`Could not open draft: ${error.message}`, true);
            showAlert('COULD NOT OPEN DRAFT\n\n' + error.message, 'ERROR');
        }
    }

    async function deleteDraft(draft) {
        const confirmed = await showConfirm(
            `Delete the saved draft for "${draft.patientName}"? This only removes it from this device.`,
            'Delete Draft'
        );
        if (!confirmed) return;
        try {
            writeDrafts(readDrafts().filter(item => item.id !== draft.id));
            render();
            setStatus('Draft deleted from this device.');
        } catch (error) {
            console.error('Could not delete draft:', error);
            setStatus(`Could not delete: ${error.message}`, true);
        }
    }

    async function deleteAllDrafts() {
        const total = readDrafts().length;
        if (!total) return;
        const confirmed = await showConfirm(
            `Delete ALL ${total} saved draft(s) from this device? This cannot be undone.`,
            'Delete All Drafts'
        );
        if (!confirmed) return;
        try {
            writeDrafts([]);
            render();
            setStatus('All drafts deleted from this device.');
        } catch (error) {
            console.error('Could not delete drafts:', error);
            setStatus(`Could not delete: ${error.message}`, true);
        }
    }

    // ------------------------------------------------------------------
    // Modal UI
    // ------------------------------------------------------------------
    function setStatus(message, isError) {
        if (!modal || !statusElement) return;
        if (statusTimer) {
            clearTimeout(statusTimer);
            statusTimer = null;
        }
        statusElement.textContent = message || '';
        statusElement.classList.toggle('is-error', Boolean(isError));
        statusElement.hidden = !message;
        if (message) {
            statusTimer = setTimeout(() => {
                statusElement.textContent = '';
                statusElement.hidden = true;
                statusElement.classList.remove('is-error');
                statusTimer = null;
            }, 6000);
        }
    }

    function getFilteredDrafts() {
        const query = searchTerm.trim().toLowerCase();
        return readDrafts().filter(draft => {
            if (!query) return true;
            return [draft.patientName, draft.patientId, draft.caseNumber, draft.fileName, draft.reportLabel, draft.procedureDate]
                .some(value => String(value || '').toLowerCase().includes(query));
        });
    }

    function estimateSize(draft) {
        try {
            return JSON.stringify(draft.formData || {}).length;
        } catch (error) {
            return 0;
        }
    }

    function createCard(draft, bridge) {
        const card = document.createElement('article');
        card.className = 'ent-drafts-card';
        const hasData = Boolean(draft.formData);
        const sameType = Boolean(bridge) && draft.reportType === bridge.reportType;
        const identifier = draft.patientId || draft.caseNumber || 'No patient ID';
        const sizeNote = draft.imagesStripped ? ' · photos removed to fit' : '';
        card.innerHTML = `
            <div class="ent-drafts-card-main">
                <div class="ent-drafts-card-topline">
                    <span class="ent-drafts-badge">${escapeHtml(draft.reportLabel || draft.reportType || 'Draft')}</span>
                    <span class="ent-drafts-card-date">${escapeHtml(draft.procedureDate || 'No procedure date')}</span>
                </div>
                <h3 class="ent-drafts-card-name">${escapeHtml(draft.patientName || 'Unnamed patient')}</h3>
                <div class="ent-drafts-card-meta">
                    <span>ID: ${escapeHtml(identifier)}</span>
                    <span>Saved: ${escapeHtml(formatTimestamp(draft.savedAt))}</span>
                    <span>Size: ${escapeHtml(formatBytes(estimateSize(draft)))}${escapeHtml(sizeNote)}</span>
                </div>
                ${draft.fileName ? `<div class="ent-drafts-card-file" title="${escapeHtml(draft.fileName)}">📄 ${escapeHtml(draft.fileName)}</div>` : ''}
            </div>
            <div class="ent-drafts-actions">
                <button type="button" class="ent-drafts-open" data-draft-action="open" data-draft-id="${escapeHtml(draft.id)}" title="Load this draft back into the form">📂 Open</button>
                <button type="button" class="ent-drafts-download" data-draft-action="download" data-draft-id="${escapeHtml(draft.id)}" title="Download this draft as a .json file">⬇ JSON</button>
                <button type="button" class="ent-drafts-delete" data-draft-action="delete" data-draft-id="${escapeHtml(draft.id)}" title="Delete this draft from this device">🗑</button>
            </div>`;

        const openButton = card.querySelector('.ent-drafts-open');
        if (!hasData) {
            openButton.disabled = true;
            openButton.title = 'This draft has no form data attached.';
        } else if (!sameType) {
            openButton.disabled = true;
            openButton.title = `This is a ${draft.reportLabel || 'different report'} draft — open it from that page.`;
        }
        const downloadButton = card.querySelector('.ent-drafts-download');
        if (!hasData) {
            downloadButton.disabled = true;
            downloadButton.title = 'This draft has no form data attached.';
        }
        return card;
    }

    function render() {
        if (!modal || !listElement) return;
        const bridge = getBridge();
        const drafts = getFilteredDrafts();
        const total = readDrafts().length;
        listElement.innerHTML = '';

        if (!drafts.length) {
            const empty = document.createElement('div');
            empty.className = 'ent-drafts-empty';
            empty.textContent = total
                ? 'No drafts match this search.'
                : 'No saved drafts yet. Click "Save Draft" (💾) to keep your work on this device.';
            listElement.appendChild(empty);
        } else {
            drafts.forEach(draft => listElement.appendChild(createCard(draft, bridge)));
        }

        if (summaryElement) {
            summaryElement.textContent = `${drafts.length} shown · ${total} total · stored only on this device`;
        }
        const clearButton = modal.querySelector('.ent-drafts-clear');
        if (clearButton) clearButton.disabled = total === 0;
    }

    function handleListClick(event) {
        const button = event.target.closest('button[data-draft-action]');
        if (!button || button.disabled) return;
        const draft = readDrafts().find(item => item.id === button.dataset.draftId);
        if (!draft) {
            render();
            setStatus('That draft is no longer available.', true);
            return;
        }
        const action = button.dataset.draftAction;
        if (action === 'open') {
            openDraft(draft);
        } else if (action === 'download') {
            downloadDraft(draft);
        } else if (action === 'delete') {
            deleteDraft(draft);
        }
    }

    function handleKeydown(event) {
        if (event.key !== 'Escape' || !modal || !modal.classList.contains('is-open')) return;
        if (confirmBox) return; // let the confirm dialog handle its own keys
        closeModal();
    }

    function buildModal() {
        if (modal) return modal;
        modal = document.createElement('div');
        modal.className = 'ent-drafts-modal no-print';
        modal.id = 'localDraftsModal';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-label', 'Saved drafts on this device');
        modal.innerHTML = `
            <div class="ent-drafts-dialog" role="document">
                <div class="ent-drafts-header">
                    <div class="ent-drafts-heading">
                        <h2>🗂️ Saved Drafts</h2>
                        <p class="ent-drafts-subtitle">Stored <strong>only on this device</strong> (browser storage) — never uploaded. Use "Open" to continue editing, or "JSON" to download the draft file.</p>
                    </div>
                    <button type="button" class="ent-drafts-close" title="Close saved drafts" aria-label="Close saved drafts">&times;</button>
                </div>
                <div class="ent-drafts-toolbar">
                    <input type="search" class="ent-drafts-search" placeholder="Search patient name, ID, report..." aria-label="Search saved drafts">
                </div>
                <div class="ent-drafts-status" hidden></div>
                <div class="ent-drafts-list"></div>
                <div class="ent-drafts-footer">
                    <span class="ent-drafts-summary"></span>
                    <button type="button" class="ent-drafts-clear">🗑 Delete All</button>
                </div>
            </div>`;
        document.body.appendChild(modal);

        listElement = modal.querySelector('.ent-drafts-list');
        statusElement = modal.querySelector('.ent-drafts-status');
        searchElement = modal.querySelector('.ent-drafts-search');
        summaryElement = modal.querySelector('.ent-drafts-summary');

        modal.addEventListener('click', (event) => {
            if (event.target === modal) closeModal();
        });
        modal.querySelector('.ent-drafts-close').addEventListener('click', closeModal);
        modal.querySelector('.ent-drafts-clear').addEventListener('click', deleteAllDrafts);
        searchElement.addEventListener('input', () => {
            searchTerm = searchElement.value;
            render();
        });
        listElement.addEventListener('click', handleListClick);
        document.addEventListener('keydown', handleKeydown);
        return modal;
    }

    function openModal() {
        buildModal();
        searchTerm = '';
        if (searchElement) searchElement.value = '';
        modal.classList.add('is-open');
        document.body.style.overflow = 'hidden';
        render();
    }

    function closeModal() {
        if (!modal) return;
        if (confirmBox && confirmResolver) confirmResolver(false);
        modal.classList.remove('is-open');
        document.body.style.overflow = '';
    }

    // ------------------------------------------------------------------
    // "Draft saved" confirmation popup (toast)
    // ------------------------------------------------------------------
    let toastElement = null;
    let toastTimer = null;
    let toastDraftId = null;

    function buildToast() {
        if (toastElement && document.body.contains(toastElement)) return toastElement;
        toastElement = document.createElement('div');
        toastElement.id = 'entDraftsToast';
        toastElement.className = 'ent-saved-toast';
        toastElement.setAttribute('role', 'status');
        toastElement.setAttribute('aria-live', 'polite');
        toastElement.innerHTML = `
            <span class="ent-saved-toast-mark" aria-hidden="true">&#10003;</span>
            <div class="ent-saved-toast-body">
                <strong class="ent-saved-toast-title">Draft saved on this device</strong>
                <span class="ent-saved-toast-detail"></span>
            </div>
            <div class="ent-saved-toast-actions">
                <button type="button" class="ent-saved-toast-btn is-primary" data-toast-action="view" title="Open this draft in the form right now">Open it</button>
                <button type="button" class="ent-saved-toast-btn" data-toast-action="drafts" title="See every draft stored on this device">All drafts</button>
                <button type="button" class="ent-saved-toast-btn" data-toast-action="json" title="Download this draft as a .json backup">.json</button>
                <button type="button" class="ent-saved-toast-btn is-quiet" data-toast-action="close" title="Keep working" aria-label="Keep working">&times;</button>
            </div>`;
        toastElement.addEventListener('click', (event) => {
            const button = event.target.closest('[data-toast-action]');
            if (!button) return;
            const action = button.getAttribute('data-toast-action');
            const draft = readDrafts().find(item => item.id === toastDraftId) || null;
            if (action === 'close') {
                hideToast();
            } else if (action === 'drafts') {
                hideToast();
                openModal();
            } else if (action === 'json') {
                if (draft) downloadDraft(draft);
            } else if (action === 'view') {
                hideToast();
                if (draft) openDraft(draft);
            }
        });
        document.body.appendChild(toastElement);
        return toastElement;
    }

    function hideToast() {
        if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; }
        if (toastElement) toastElement.classList.remove('is-visible');
    }

    function showSavedToast(draft) {
        if (!draft) return;
        const toast = buildToast();
        toastDraftId = draft.id || null;
        const detail = toast.querySelector('.ent-saved-toast-detail');
        const when = new Date(draft.savedAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        detail.textContent = `${draft.patientName || 'Untitled patient'} · ${draft.reportLabel || 'Draft'} · ${when} · nothing was uploaded`;
        toast.classList.add('is-visible');
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(() => {
            toast.classList.remove('is-visible');
            toastTimer = null;
        }, 12000);
    }

    // Brief "✓ Saved" pulse on the Save Draft button itself.
    function flashSaveButton() {
        const button = document.getElementById('saveDataBtn');
        if (!button) return;
        button.classList.remove('is-saved');
        void button.offsetWidth;            // restart the animation
        button.classList.add('is-saved');
        setTimeout(() => button.classList.remove('is-saved'), 2400);
    }

    // Save the draft on this device, then confirm it with a small popup.
    function saveAndOpen(reportType, formData, fileName) {
        const draft = saveDraft(reportType, formData, fileName);
        flashSaveButton();
        showSavedToast(draft);
        return draft;
    }


    // ------------------------------------------------------------------
    // Button wiring
    // ------------------------------------------------------------------
    function bindButtons() {
        const browseButton = document.getElementById('localDraftsBtn');
        if (browseButton && browseButton.dataset.draftsBound !== 'true') {
            browseButton.dataset.draftsBound = 'true';
            browseButton.addEventListener('click', () => { openModal(); });
        }
    }

    window.EntDrafts = {
        saveDraft,
        saveAndOpen,
        openModal,
        showSavedToast,
        readDrafts,
        downloadDraft
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindButtons, { once: true });
    } else {
        bindButtons();
    }

})(window);






