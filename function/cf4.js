document.addEventListener('DOMContentLoaded', () => {
    const themeToggle = document.getElementById('theme-toggle');
    const currentTheme = localStorage.getItem('theme');
    if (currentTheme === 'dark') { document.body.classList.add('dark-mode'); if (themeToggle) themeToggle.checked = true; }
    if (themeToggle) {
        themeToggle.addEventListener('change', function() {
            if (this.checked) { document.body.classList.add('dark-mode'); localStorage.setItem('theme', 'dark'); }
            else { document.body.classList.remove('dark-mode'); localStorage.setItem('theme', 'light'); }
        });
    }

    function updateConnectionStatus(isOnline) {
        const statusEl = document.getElementById('connectionStatus');
        if (statusEl) {
            if (isOnline) { statusEl.classList.remove('offline'); statusEl.classList.add('online'); statusEl.title = "Online: You are connected to the internet."; }
            else { statusEl.classList.remove('online'); statusEl.classList.add('offline'); statusEl.title = "Offline: You are currently working offline."; }
        }
    }
    updateConnectionStatus(navigator.onLine);
    window.addEventListener('online', () => { updateConnectionStatus(true); showCustomAlert("Internet connection restored. You are back online.", "Online"); });
    window.addEventListener('offline', () => { updateConnectionStatus(false); showCustomAlert("You are currently offline. The app is running in offline mode.", "Offline"); });

    const messageModal = document.getElementById('messageModal');
    const msgModalTitle = document.getElementById('msgModalTitle');
    const msgModalText = document.getElementById('msgModalText');
    const msgModalOkBtn = document.getElementById('msgModalOkBtn');
    function showCustomAlert(message, title = 'Notification') {
        if (!messageModal) { alert(message); return; }
        msgModalTitle.textContent = title; msgModalText.textContent = message;
        messageModal.style.display = 'flex';
    }
    if (msgModalOkBtn) { msgModalOkBtn.addEventListener('click', () => { messageModal.style.display = 'none'; }); }
    if (messageModal) { messageModal.addEventListener('click', (e) => { if (e.target === messageModal) { messageModal.style.display = 'none'; } }); }

    function readStoredJson(key, fallback) {
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return fallback;
            const parsed = JSON.parse(raw);
            return parsed == null ? fallback : parsed;
        } catch (error) {
            console.warn(`Unable to read ${key}; using defaults.`, error);
            return fallback;
        }
    }

    const savedCf4Settings = readStoredJson('cf4Settings', {});
    const CF4_DEFAULT_LOGOS = {
        left: 'image/rmci-logo.png',
        right: 'image/ent-logo.webp'
    };
    const headerLeftLogo = document.getElementById('headerLeftLogo');
    const headerRightLogo = document.getElementById('headerRightLogo');
    if (headerLeftLogo) headerLeftLogo.src = savedCf4Settings.cf4LeftLogo || CF4_DEFAULT_LOGOS.left;
    if (headerRightLogo) headerRightLogo.src = savedCf4Settings.cf4RightLogo || CF4_DEFAULT_LOGOS.right;
    
    // Default HCI Information for Rever Medical Center Inc.
    const defaultHciSettings = {
        hciName: 'REVER MEDICAL CENTER INC.',
        hciBldgNo: 'ZONE 4, CAPUNUYAN',
        hciStreet: '',
        hciBarangay: 'APLAYA, JAASAAN',
        hciProvince: 'MISAMIS ORIENTAL',
        hciZipCode: '9003'
    };
    
    // Apply saved settings or defaults
    if (document.getElementById('hciName')) { 
        document.getElementById('hciName').value = savedCf4Settings.cf4HciName || defaultHciSettings.hciName; 
    }
    if (savedCf4Settings.cf4AccreditationNo && document.getElementById('accreditationNo')) { 
        document.getElementById('accreditationNo').value = savedCf4Settings.cf4AccreditationNo; 
    }
    if (document.getElementById('hciBldgNo')) { 
        document.getElementById('hciBldgNo').value = savedCf4Settings.cf4HciBldgNo || defaultHciSettings.hciBldgNo; 
    }
    if (document.getElementById('hciStreet')) { 
        document.getElementById('hciStreet').value = savedCf4Settings.cf4HciStreet || defaultHciSettings.hciStreet; 
    }
    if (document.getElementById('hciBarangay')) { 
        document.getElementById('hciBarangay').value = savedCf4Settings.cf4HciBarangay || defaultHciSettings.hciBarangay; 
    }
    if (document.getElementById('hciProvince')) { 
        document.getElementById('hciProvince').value = savedCf4Settings.cf4HciProvince || defaultHciSettings.hciProvince; 
    }
    if (document.getElementById('hciZipCode')) { 
        document.getElementById('hciZipCode').value = savedCf4Settings.cf4HciZipCode || defaultHciSettings.hciZipCode; 
    }
    if (savedCf4Settings.cf4AttendingHcp && document.getElementById('attendingHcpName')) { 
        document.getElementById('attendingHcpName').value = savedCf4Settings.cf4AttendingHcp; 
    }

    const CF4_TEMPLATE_CONFIG = [
        { fieldId: 'chiefComplaint', storageKey: 'cf4ChiefComplaintTemplates', placeholder: 'Select Chief Complaint...' },
        { fieldId: 'admittingDiagnosis', storageKey: 'cf4AdmittingDiagnosisTemplates', placeholder: 'Select Admitting Diagnosis...' },
        { fieldId: 'dischargeDiagnosis', storageKey: 'cf4DischargeDiagnosisTemplates', placeholder: 'Select Discharge Diagnosis...' },
        { fieldId: 'historyPresentIllness', storageKey: 'cf4HpiTemplates', placeholder: 'Select HPI Template...' },
        { fieldId: 'pertinentPastMedicalHistory', storageKey: 'cf4PmhTemplates', placeholder: 'Select PMH Template...' }
    ];

    // Keep one standard doctor's-note template. It fills the actual textarea so
    // all existing save/load, print, and PDF code continues to receive the text.
    const DOCTORS_NOTE_TEMPLATE = 'THE PATIENT UNDERWENT (     ) UNDER LOCAL ANESTHESIA FOR (     ). DURING THE PROCEDURE, PATIENT WAS SITTING COMFORTABLY, COOPERATIVE, AND NOT IN PAIN. THE PROCEDURE WAS WELL TOLERATED WITH NO COMPLICATIONS. AFTER THE PROCEDURE, PATIENT WAS AWAKE, ALERT, COHERENT, AMBULANT WITH (     ).';

    const courseInWardContainer = document.getElementById('courseInWardContainer');
    const addCourseRowBtn = document.getElementById('addCourseRowBtn');
    const cf4Form = document.getElementById('cf4-form');
    const STORAGE_KEY = 'cf4FormData';

    function removeCourseRow(row) {
        if (!row) return;
        row.remove();
        // Keep the form usable: the doctor can always add another row afterward.
        saveFormData();
    }

    function createSimpleCourseControls(container, input) {
        if (!container || !input) return;
        container.replaceChildren();
        const defaultBtn = document.createElement('button');
        defaultBtn.type = 'button';
        defaultBtn.className = 'template-select-btn';
        defaultBtn.dataset.courseAction = 'default';
        defaultBtn.textContent = '↩ Default Note';
        defaultBtn.title = 'Restore the standard default note';
        defaultBtn.setAttribute('aria-label', 'Restore the default doctor order and action note');
        defaultBtn.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            applyDefaultDoctorsNoteTemplate(input);
            saveFormData();
            input.focus();
        });

        const clearBtn = document.createElement('button');
        clearBtn.type = 'button';
        clearBtn.className = 'clear-text-btn';
        clearBtn.dataset.courseAction = 'clear';
        clearBtn.textContent = '✕ Clear Text';
        clearBtn.title = "Erase this doctor's order/action text";
        clearBtn.setAttribute('aria-label', "Clear this doctor's order and action text");
        clearBtn.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            setCourseOrderValue(input, '');
            saveFormData();
            showQuickClearConfirmation(input.closest('.course-in-ward-row'));
            input.focus();
        });

        container.append(defaultBtn, clearBtn);
    }

    function createCourseRow() {
        const row = document.createElement('div'); row.className = 'course-in-ward-row';
        row.innerHTML = `<div class="course-row-header"><div class="date-time-inputs-row"><div class="date-input-section"><label class="form-label">Date:</label><input type="date" name="courseDate[]" class="course-date-input"></div><div class="time-input-section"><label class="form-label">Time:</label><input type="time" name="courseTime[]" class="course-time-input"></div></div><div class="template-controls-header"><button type="button" class="template-select-btn" data-course-action="default" title="Restore the standard default note" aria-label="Restore the default doctor order and action note">↩ Default Note</button><button type="button" class="clear-text-btn" data-course-action="clear" title="Erase this doctor's order/action text" aria-label="Clear this doctor's order and action text">✕ Clear Text</button></div><button type="button" class="btn-remove-course btn-danger" title="Remove this row" aria-label="Remove this row">✕</button></div><div class="course-textarea-container"><textarea name="courseOrder[]" placeholder="DOCTOR'S ORDER/ACTION - Type here..." rows="12">${DOCTORS_NOTE_TEMPLATE}</textarea></div>`;
        const orderInput = row.querySelector('textarea[name="courseOrder[]"]');
        const templateControlsHeader = row.querySelector('.template-controls-header');

        if (orderInput) {
            orderInput.dataset.templateKey = 'cf4DoctorsNoteTemplates';
            applyDefaultDoctorsNoteTemplate(orderInput);
            if (templateControlsHeader) createSimpleCourseControls(templateControlsHeader, orderInput);
        }

        row.querySelector('.btn-remove-course')?.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            removeCourseRow(row);
        });
        row.querySelectorAll('input, textarea').forEach(input => { input.addEventListener('input', saveFormData); });

        // Auto-fill current date and time for new rows
        const dateInput = row.querySelector('input[name="courseDate[]"]');
        const timeInput = row.querySelector('input[name="courseTime[]"]');
        const now = new Date();
        if (dateInput && !dateInput.value) {
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            dateInput.value = `${year}-${month}-${day}`;
        }
        if (timeInput && !timeInput.value) {
            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            timeInput.value = `${hours}:${minutes}`;
        }

        return row;
    }

    if (addCourseRowBtn && courseInWardContainer) {
        addCourseRowBtn.addEventListener('click', (event) => {
            event.preventDefault();
            courseInWardContainer.appendChild(createCourseRow());
            saveFormData();
        });
    }
    // Existing markup has one initial row; its controls and X handler are wired here.
    document.querySelectorAll('.course-in-ward-row').forEach(row => {
        const removeBtn = row.querySelector('.btn-remove-course');
        if (removeBtn && !removeBtn.dataset.bound) {
            removeBtn.dataset.bound = 'true';
            removeBtn.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                removeCourseRow(row);
            });
        }
    });
    document.querySelectorAll('.btn-remove-course').forEach(btn => {
        if (btn.dataset.bound) return;
        btn.dataset.bound = 'true';
        btn.addEventListener('click', () => removeCourseRow(btn.closest('.course-in-ward-row')));
    });

    // Course-in-ward doctor's note templates - header controls for ALL rows (consistent)
    document.querySelectorAll('.course-in-ward-row .template-controls-header').forEach(controlsHeader => {
        const row = controlsHeader.closest('.course-in-ward-row');
        const orderInput = row ? row.querySelector('textarea[name="courseOrder[]"]') : null;
        if (orderInput) {
            orderInput.dataset.templateKey = 'cf4DoctorsNoteTemplates';
            if (!orderInput.value.trim()) applyDefaultDoctorsNoteTemplate(orderInput);
            createSimpleCourseControls(controlsHeader, orderInput);
        }
    });
    
    // Auto-fill date and time for existing course rows on page load
    function autoFillExistingCourseRows() {
        const courseRows = document.querySelectorAll('.course-in-ward-row');
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const currentDate = `${year}-${month}-${day}`;
        
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const currentTime = `${hours}:${minutes}`;
        
        courseRows.forEach(row => {
            const dateInput = row.querySelector('input[name="courseDate[]"]');
            const timeInput = row.querySelector('input[name="courseTime[]"]');
            if (dateInput && !dateInput.value) {
                dateInput.value = currentDate;
            }
            if (timeInput && !timeInput.value) {
                timeInput.value = currentTime;
            }
        });
    }

    const drugsContainer = document.getElementById('drugsContainer');
    const addDrugRowBtn = document.getElementById('addDrugRowBtn');
    function createDrugRow() {
        const row = document.createElement('div'); row.className = 'drugs-row';
        row.innerHTML = `<input type="text" name="drugGenericName[]" placeholder="Generic Name"><input type="text" name="drugQuantity[]" placeholder="Quantity/Dosage/Route"><input type="text" name="drugTotalCost[]" placeholder="Total Cost"><button type="button" class="btn-remove-drug btn-danger" title="Remove this drug row" aria-label="Remove this drug row">✕</button>`;
        row.querySelector('.btn-remove-drug')?.addEventListener('click', () => { row.remove(); saveFormData(); });
        row.querySelectorAll('input').forEach(input => { input.addEventListener('input', saveFormData); });
        return row;
    }
    if (addDrugRowBtn && drugsContainer) {
        addDrugRowBtn.addEventListener('click', () => {
            drugsContainer.appendChild(createDrugRow());
            saveFormData();
        });
    }
    // Wire only the static rows; newly-created rows already have their handlers.
    document.querySelectorAll('.drugs-row .btn-remove-drug').forEach(btn => {
        if (btn.dataset.bound) return;
        btn.dataset.bound = 'true';
        btn.addEventListener('click', () => {
            const row = btn.closest('.drugs-row');
            if (row) row.remove();
            saveFormData();
        });
    });

    // ===================================================================================
    // CF4 QUICK TEMPLATES (SELECT INSTEAD OF TYPE)
    // ===================================================================================
    function getCf4Templates(storageKey, defaultValues = []) {
        if (storageKey === 'cf4DoctorsNoteTemplates') {
            // This CF4 course note intentionally has one standard default only.
            return [DOCTORS_NOTE_TEMPLATE];
        }

        const stored = localStorage.getItem(storageKey);
        if (stored) {
            try {
                const items = JSON.parse(stored);
                if (Array.isArray(items) && items.length > 0) return items;
            } catch (e) {}
        }
        // Fallback defaults if nothing stored yet
        const fallbackDefaults = {
            'cf4ChiefComplaintTemplates': [
                'PERSISTENT RHINORRHEA',
                'PERSISTENT RHINORRHEA WITH NASAL OBSTRUCTION',
                'NASAL OBSTRUCTION AND POSTNASAL DRIP',
                'CHRONIC NASAL CONGESTION',
                'NASAL BLOCKAGE WITH MUCUS DISCHARGE'
            ],
            'cf4AdmittingDiagnosisTemplates': [
                'CHRONIC RHINOSINUSITIS T/C R/O POLYPOSIS',
                'ALLERGIC RHINITIS WITH CHRONIC RHINOSINUSITIS',
                'CHRONIC RHINOSINUSITIS WITHOUT POLYPOSIS',
                'CHRONIC RHINOSINUSITIS WITH NASAL POLYPOSIS',
                'ALLERGIC RHINITIS'
            ],
            'cf4DischargeDiagnosisTemplates': [
                'CHRONIC RHINOSINUSITIS WITHOUT POLYPOSIS. ALLERGIC RHINITIS.',
                'ALLERGIC RHINITIS WITH CHRONIC RHINOSINUSITIS',
                'CHRONIC RHINOSINUSITIS WITH NASAL OBSTRUCTION',
                'CHRONIC RHINOSINUSITIS, IMPROVED',
                'ALLERGIC RHINITIS, IMPROVED'
            ],
            'cf4HpiTemplates': [
                'PATIENT CAME IN AND COMPLAINED OF PERSISTENT RHINORRHEA FOR SEVERAL MONTHS ASSOCIATED WITH NASAL OBSTRUCTION. ANTERIOR RHINOSCOPY WAS [SIGNATURE/INITIAL].',
                'PATIENT CAME IN WITH PERSISTENT RHINORRHEA FOR SEVERAL MONTHS ASSOCIATED WITH POSTNASAL DRIP AND NASAL OBSTRUCTION.',
                'PATIENT REPORTED CHRONIC NASAL CONGESTION AND RHINORRHEA FOR SEVERAL MONTHS WITH NO IMPROVEMENT WITH HOME CARE.',
                'PATIENT COMPLAINED OF PERSISTENT RHINORRHEA WITH THICK MUCOID SECRETION AND NASAL BLOCKAGE.'
            ],
            'cf4PmhTemplates': [
                'NO COMMOBIDITIES, NO PRIOR SURGERIES',
                'HYPERTENSIVE, ON MEDICATION',
                'DIABETIC, ON MEDICATION',
                'ASTHMATIC',
                'ALLERGIC RHINITIS',
                'PREVIOUS SURGERY: TONSILLECTOMY'
            ],
            'cf4DoctorsNoteTemplates': [
                'THE PATIENT UNDERWENT (     ) UNDER LOCAL ANESTHESIA FOR (     ). DURING THE PROCEDURE, PATIENT WAS SITTING COMFORTABLY, COOPERATIVE, AND NOT IN PAIN. THE PROCEDURE WAS WELL TOLERATED WITH NO COMPLICATIONS. AFTER THE PROCEDURE, PATIENT WAS AWAKE, ALERT, COHERENT, AMBULANT WITH (     ).'
            ]
        };
        return fallbackDefaults[storageKey] || defaultValues;
    }

    function createTemplateSelect(input) {
        if (!input) return;

        let wrapper = input.closest('.cf4-template-wrapper');
        if (!wrapper) {
            wrapper = document.createElement('div');
            wrapper.className = 'cf4-template-wrapper';
            Object.assign(wrapper.style, {
                display: 'flex',
                flexDirection: 'row',
                flexWrap: 'wrap',
                gap: '8px',
                alignItems: 'flex-start',
                width: '100%',
                marginBottom: '15px'
            });
            if (input.parentNode) {
                input.parentNode.insertBefore(wrapper, input);
                wrapper.appendChild(input);
            }
            input.style.marginBottom = '0';
            input.style.flex = '1';
        }

        let inputFieldContainer = input.closest('.cf4-template-input-container');
        if (!inputFieldContainer) {
            inputFieldContainer = document.createElement('div');
            inputFieldContainer.className = 'cf4-template-input-container';
            inputFieldContainer.style.position = 'relative';
            inputFieldContainer.style.flex = '1 1 0%';
            inputFieldContainer.style.minWidth = '0';
            inputFieldContainer.style.display = 'flex';
            inputFieldContainer.style.flexDirection = 'column';
            if (input.parentNode) {
                input.parentNode.insertBefore(inputFieldContainer, input);
                inputFieldContainer.appendChild(input);
            }
            input.style.width = '100%';
            input.style.minWidth = '0';
        }

        const inputClearBtn = document.createElement('button');
        inputClearBtn.type = 'button';
        inputClearBtn.textContent = '✕ Clear';
        inputClearBtn.title = 'Clear field';
        Object.assign(inputClearBtn.style, {
            marginTop: '6px',
            alignSelf: 'flex-start',
            background: '#ffffff',
            border: '1.5px solid #f0b9b9',
            borderRadius: '8px',
            color: '#c0392b',
            fontSize: '12px',
            fontWeight: '600',
            cursor: 'pointer',
            padding: '5px 10px',
            lineHeight: '1',
            opacity: '1',
            boxShadow: 'none',
            transition: 'background 0.2s ease, transform 0.1s ease, color 0.2s ease',
            display: input.value ? 'inline-flex' : 'none',
            zIndex: '1'
        });
        inputClearBtn.addEventListener('mouseenter', () => { inputClearBtn.style.background = '#e74c3c'; inputClearBtn.style.color = '#ffffff'; inputClearBtn.style.boxShadow = '0 3px 8px rgba(231, 76, 60, 0.35)'; });
        inputClearBtn.addEventListener('mouseleave', () => { inputClearBtn.style.background = '#ffffff'; inputClearBtn.style.color = '#c0392b'; inputClearBtn.style.boxShadow = 'none'; });
        inputClearBtn.addEventListener('mousedown', () => { inputClearBtn.style.transform = 'scale(0.95)'; });
        inputClearBtn.addEventListener('mouseup', () => { inputClearBtn.style.transform = 'scale(1)'; });
        inputClearBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            input.value = '';
            inputClearBtn.style.display = 'none';
            input.dispatchEvent(new Event('input'));
            input.dispatchEvent(new Event('change'));
        });
        input.addEventListener('input', () => {
            inputClearBtn.style.display = input.value ? 'inline-flex' : 'none';
        });
        input.addEventListener('focus', () => {
            if (input.value) {
                inputClearBtn.style.display = 'inline-flex';
            }
        });
        inputFieldContainer.appendChild(inputClearBtn);

        const existingDropdown = wrapper.querySelector('.cf4-template-dropdown');
        if (existingDropdown) {
            existingDropdown.remove();
        }

        const controlsContainer = document.createElement('div');
        controlsContainer.className = 'cf4-template-controls';
        Object.assign(controlsContainer.style, {
            display: 'flex',
            flexDirection: 'column',
            gap: '7px',
            flex: '0 0 320px',
            minWidth: '260px',
            alignItems: 'stretch',
            marginLeft: '14px'
        });

        const dropdown = document.createElement('div');
        dropdown.className = 'cf4-template-dropdown';
        Object.assign(dropdown.style, {
            position: 'relative',
            width: '100%'
        });

        const dropdownToggle = document.createElement('button');
        dropdownToggle.type = 'button';
        dropdownToggle.className = 'cf4-template-dropdown-toggle';
        dropdownToggle.textContent = '📋 Choose Template ▾';
        dropdownToggle.title = 'Click to pick a saved phrase for this field';
        Object.assign(dropdownToggle.style, {
            width: '100%',
            padding: '11px 12px',
            border: '2px solid var(--primary-color)',
            borderRadius: '10px',
            backgroundColor: 'var(--input-bg-color)',
            color: 'var(--text-color)',
            textAlign: 'left',
            fontSize: '13px',
            fontWeight: '700',
            cursor: 'pointer',
            boxShadow: '0 2px 6px rgba(14, 165, 233, 0.15)',
            transition: 'all 0.2s ease'
        });
        dropdownToggle.addEventListener('mouseenter', () => { dropdownToggle.style.boxShadow = '0 4px 12px rgba(14, 165, 233, 0.35)'; dropdownToggle.style.borderColor = 'var(--primary-hover-color)'; });
        dropdownToggle.addEventListener('mouseleave', () => { dropdownToggle.style.boxShadow = '0 2px 6px rgba(14, 165, 233, 0.15)'; dropdownToggle.style.borderColor = 'var(--primary-color)'; });

        // Small helper label above the dropdown
        const dropdownLabel = document.createElement('span');
        dropdownLabel.className = 'cf4-template-field-label';
        dropdownLabel.textContent = 'Or fill from an existing saved phrase:';
        dropdownLabel.title = 'Saved phrases can be picked here instead of typing';
        Object.assign(dropdownLabel.style, {
            fontSize: '11px',
            fontWeight: '600',
            color: 'var(--secondary-text-color)',
            lineHeight: '1.3',
            padding: '0 2px'
        });

        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.placeholder = '🔍 Search saved templates...';
        searchInput.autocomplete = 'off';
        Object.assign(searchInput.style, {
            width: '100%',
            padding: '9px 35px 9px 12px',
            border: '1.5px solid var(--border-color)',
            borderRadius: '8px',
            backgroundColor: 'var(--input-bg-color)',
            color: 'var(--text-color)',
            fontSize: '13px',
            fontWeight: '600',
            boxSizing: 'border-box',
            cursor: 'text',
            marginTop: '6px',
            position: 'relative',
            transition: 'border-color 0.2s ease, box-shadow 0.2s ease'
        });
        searchInput.addEventListener('focus', () => { searchInput.style.borderColor = 'var(--primary-color)'; searchInput.style.boxShadow = '0 0 0 3px rgba(14, 165, 233, 0.15)'; });
        searchInput.addEventListener('blur', () => { searchInput.style.borderColor = 'var(--border-color)'; searchInput.style.boxShadow = 'none'; });

        const clearSearchBtn = document.createElement('button');
        clearSearchBtn.type = 'button';
        clearSearchBtn.textContent = '✕';
        clearSearchBtn.title = 'Clear search';
        Object.assign(clearSearchBtn.style, {
            position: 'absolute',
            right: '8px',
            top: '50%',
            transform: 'translateY(-50%)',
            background: 'transparent',
            border: 'none',
            color: 'var(--text-color)',
            fontSize: '16px',
            fontWeight: 'bold',
            cursor: 'pointer',
            padding: '4px 8px',
            lineHeight: '1',
            opacity: '0.8',
            transition: 'opacity 0.2s ease',
            display: 'none',
            zIndex: '10'
        });
        clearSearchBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            searchInput.value = '';
            clearSearchBtn.style.display = 'none';
            searchInput.focus();
            renderOptions('');
        });

        const optionsContainer = document.createElement('div');
        optionsContainer.className = 'cf4-template-options';
        Object.assign(optionsContainer.style, {
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: '0',
            right: '0',
            zIndex: '999',
            maxHeight: '300px',
            overflowY: 'auto',
            border: '2px solid var(--primary-color)',
            borderRadius: '12px',
            backgroundColor: 'var(--panel-bg-color)',
            color: 'var(--text-color)',
            boxShadow: '0 14px 30px rgba(0, 0, 0, 0.18)',
            padding: '8px',
            display: 'none'
        });

        const panelTitle = document.createElement('div');
        panelTitle.className = 'cf4-template-panel-title';
        panelTitle.textContent = '📁 Saved Templates';
        Object.assign(panelTitle.style, {
            fontSize: '10px',
            fontWeight: '800',
            textTransform: 'uppercase',
            letterSpacing: '1px',
            color: 'var(--secondary-text-color)',
            padding: '4px 2px 8px',
            borderBottom: '1px dashed var(--border-color)',
            marginBottom: '6px'
        });

        const saveTemplateBtn = document.createElement('button');
        saveTemplateBtn.type = 'button';
        saveTemplateBtn.className = 'cf4-template-save-btn';
        saveTemplateBtn.textContent = '➕ Save as Template';
        saveTemplateBtn.title = 'Save the text you typed above as a reusable template';
        Object.assign(saveTemplateBtn.style, {
            width: '100%',
            padding: '10px 12px',
            border: 'none',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, #28a745, #1e8449)',
            color: '#ffffff',
            textAlign: 'center',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: '700',
            boxShadow: '0 3px 8px rgba(40, 167, 69, 0.35)',
            transition: 'all 0.2s ease'
        });
        saveTemplateBtn.addEventListener('mouseenter', () => { saveTemplateBtn.style.boxShadow = '0 5px 14px rgba(40, 167, 69, 0.5)'; saveTemplateBtn.style.transform = 'translateY(-1px)'; });
        saveTemplateBtn.addEventListener('mouseleave', () => { saveTemplateBtn.style.boxShadow = '0 3px 8px rgba(40, 167, 69, 0.35)'; saveTemplateBtn.style.transform = 'none'; });

        const listContainer = document.createElement('div');
        listContainer.className = 'cf4-template-options-list';

        const config = CF4_TEMPLATE_CONFIG.find(c => c.fieldId === input.id);
        const storageKey = config ? config.storageKey : (input.dataset.templateKey || (input.id === 'cf4CourseNotes' ? 'cf4DoctorsNoteTemplates' : ''));

        function getTemplates() {
            return storageKey ? getCf4Templates(storageKey) : [];
        }

        function renderOptions(filterText = '') {
            const templates = getTemplates().sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
            listContainer.innerHTML = '';

            const filtered = templates.filter(tpl => tpl.toLowerCase().includes(filterText.toLowerCase()));
            filtered.forEach((tpl) => {
                const item = document.createElement('button');
                item.type = 'button';
                item.className = 'cf4-template-option';
                item.textContent = tpl;
                Object.assign(item.style, {
                    width: '100%',
                    padding: '10px 12px',
                    border: 'none',
                    borderBottom: '1px solid rgba(0, 0, 0, 0.12)',
                    background: 'transparent',
                    color: 'var(--text-color)',
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontSize: '13px'
                });
                item.addEventListener('mouseenter', () => { item.style.backgroundColor = 'rgba(14, 165, 233, 0.10)'; item.style.color = 'var(--primary-hover-color)'; });
                item.addEventListener('mouseleave', () => { item.style.backgroundColor = 'transparent'; item.style.color = 'var(--text-color)'; });
                item.addEventListener('click', () => {
                    // Check if this is a fillable template (contains parentheses)
                    if (tpl.includes('(') && tpl.includes(')')) {
                        createFillableTemplate(input, tpl);
                    } else {
                        // Regular template - just set the value
                        input.value = tpl;
                        input.dispatchEvent(new Event('input'));
                        input.dispatchEvent(new Event('change'));
                    }
                    optionsContainer.style.display = 'none';
                });
                listContainer.appendChild(item);
            });

            if (!filtered.length) {
                const emptyMessage = document.createElement('div');
                emptyMessage.textContent = 'No matching templates found.';
                Object.assign(emptyMessage.style, {
                    padding: '10px 12px',
                    color: 'var(--text-color)',
                    opacity: '0.7',
                    fontSize: '13px'
                });
                listContainer.appendChild(emptyMessage);
            }
        }

        saveTemplateBtn.addEventListener('click', () => {
            if (input.value && input.value.trim()) {
                const templates = getTemplates();
                const newTemplate = input.value.trim();
                if (!templates.includes(newTemplate)) {
                    templates.push(newTemplate);
                    localStorage.setItem(storageKey, JSON.stringify(templates));
                    showCustomAlert('✅ Template saved successfully!', 'SUCCESS');
                    renderOptions(searchInput.value);
                } else {
                    showCustomAlert('⚠️ This template already exists!', 'INFO');
                }
            } else {
                showCustomAlert('⚠️ Please type something first before saving as template.', 'INFO');
            }
        });

        function openDropdown() {
            renderOptions(searchInput.value);
            optionsContainer.style.display = 'block';
            dropdownToggle.textContent = '📋 Choose Template ▴';
        }

        function closeDropdown() {
            optionsContainer.style.display = 'none';
            dropdownToggle.textContent = '📋 Choose Template ▾';
        }

        dropdownToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            if (optionsContainer.style.display === 'block') {
                closeDropdown();
            } else {
                openDropdown();
                // Do NOT auto-focus the search input - let user manually tap it if needed
            }
        });

        searchInput.addEventListener('input', () => {
            openDropdown();
            clearSearchBtn.style.display = searchInput.value ? 'block' : 'none';
        });

        searchInput.addEventListener('focus', openDropdown);

        document.addEventListener('click', (e) => {
            if (!dropdown.contains(e.target)) {
                closeDropdown();
            }
        });

        controlsContainer.appendChild(dropdown);
        controlsContainer.appendChild(saveTemplateBtn);
        dropdown.appendChild(dropdownToggle);
        dropdown.appendChild(dropdownLabel);

        const templateHint = document.createElement('div');
        templateHint.className = 'cf4-template-hint';
        templateHint.textContent = '💡 Hint: "Choose Template" fills this field automatically. "Save as Template" keeps the text you typed for next time.';
        Object.assign(templateHint.style, {
            fontSize: '11px',
            color: 'var(--secondary-text-color)',
            lineHeight: '1.4',
            opacity: '0.92',
            padding: '0 2px'
        });
        controlsContainer.appendChild(templateHint);
        
        const searchWrapper = document.createElement('div');
        searchWrapper.style.position = 'relative';
        searchWrapper.style.width = '100%';
        searchWrapper.appendChild(searchInput);
        searchWrapper.appendChild(clearSearchBtn);
        
        optionsContainer.appendChild(panelTitle);
        optionsContainer.appendChild(searchWrapper);
        optionsContainer.appendChild(listContainer);
        dropdown.appendChild(optionsContainer);
        wrapper.appendChild(controlsContainer);
        input.dataset.templateEnabled = 'true';

    }

    // Course-in-ward doctor's note controls: one consistent set for every row.
    function createTemplateControlsInHeader(container, input) {
        if (!container || !input) return;
        
        const templateWrapper = document.createElement('div');
        templateWrapper.className = 'header-template-controls';
        Object.assign(templateWrapper.style, {
            display: 'flex',
            gap: '8px',
            alignItems: 'center',
            flexWrap: 'wrap',
            position: 'relative'
        });
        
        const templateBtn = document.createElement('button');
        templateBtn.type = 'button';
        templateBtn.className = 'template-select-btn';
        templateBtn.textContent = '📋 Templates';
        templateBtn.title = 'Open saved doctor\'s note templates to fill this box';

        const modeToggleBtn = document.createElement('button');
        modeToggleBtn.type = 'button';
        modeToggleBtn.className = 'template-mode-btn';
        modeToggleBtn.textContent = '✍️ Typing';
        modeToggleBtn.dataset.mode = 'text';
        modeToggleBtn.title = 'Switch between typing directly or using a saved template';

        const addTemplateBtn = document.createElement('button');
        addTemplateBtn.type = 'button';
        addTemplateBtn.className = 'add-template-btn';
        addTemplateBtn.textContent = 'ℹ️ Default Note';
        addTemplateBtn.title = 'This section uses one standard default note; edit it directly or use Clear for a blank note.';

        const editTemplateBtn = document.createElement('button');
        editTemplateBtn.type = 'button';
        editTemplateBtn.className = 'edit-template-btn';
        editTemplateBtn.textContent = '✏️ Edit Template';
        editTemplateBtn.title = 'Update the selected template with the current text';
        editTemplateBtn.style.display = 'none';

        const clearTextBtn = document.createElement('button');
        clearTextBtn.type = 'button';
        clearTextBtn.className = 'clear-text-btn';
        clearTextBtn.textContent = '🗑️ Clear';
        clearTextBtn.title = 'Quickly erase all text in this box (removes the template too)';
        clearTextBtn.dataset.role = 'clear-text';

        const dropdown = document.createElement('div');
        dropdown.className = 'template-dropdown-inline';

        const dropdownHeader = document.createElement('div');
        dropdownHeader.className = 'template-dropdown-header';
        dropdownHeader.textContent = '📁 Saved Doctor\'s Note Templates';
        Object.assign(dropdownHeader.style, {
            padding: '10px 14px',
            fontSize: '11px',
            fontWeight: '800',
            textTransform: 'uppercase',
            letterSpacing: '1px',
            color: 'var(--secondary-text-color)',
            borderBottom: '1px solid #e5e7eb',
            background: 'rgba(0, 0, 0, 0.02)'
        });

        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.placeholder = '🔍 Search doctor\'s note templates...';
        searchInput.className = 'template-search-input';

        const optionsList = document.createElement('div');
        optionsList.className = 'template-options-list';

        dropdown.appendChild(dropdownHeader);
        dropdown.appendChild(searchInput);
        dropdown.appendChild(optionsList);
        templateWrapper.appendChild(templateBtn);
        templateWrapper.appendChild(modeToggleBtn);
        templateWrapper.appendChild(addTemplateBtn);
        templateWrapper.appendChild(editTemplateBtn);
        templateWrapper.appendChild(clearTextBtn);
        templateWrapper.appendChild(dropdown);
        container.appendChild(templateWrapper);
        
        // Keep the default note immediately available to the doctor.
        input.templateDropdown = dropdown;
        input.templateOptionsList = optionsList;
        input.templateSearchInput = searchInput;
        input.editTemplateBtn = editTemplateBtn;
        input.currentTemplateIndex = -1;
        input.templateMode = 'text';
        
        function updateMode() {
            if (input.templateMode === 'template') {
                modeToggleBtn.textContent = '📋 Using Template';
                modeToggleBtn.title = 'Template mode is ON - you are working from a saved template';
                templateBtn.style.opacity = '1';
                addTemplateBtn.style.opacity = '0.65';
            } else {
                modeToggleBtn.textContent = '✍️ Typing';
                modeToggleBtn.title = 'Type directly. Click "Templates" to pick a saved template';
                templateBtn.style.opacity = '0.85';
                addTemplateBtn.style.opacity = '1';
                dropdown.style.display = 'none';
            }
        }
        updateMode();
        
        templateBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            input.templateMode = 'template';
            updateMode();
            const isVisible = dropdown.style.display === 'block';
            document.querySelectorAll('.template-dropdown-inline').forEach(d => d.style.display = 'none');
            dropdown.style.display = isVisible ? 'none' : 'block';
            if (!isVisible) {
                renderTemplateOptions('');
                searchInput.focus();
            }
        });
        
        modeToggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            input.templateMode = input.templateMode === 'template' ? 'text' : 'template';
            updateMode();
        });
        
        addTemplateBtn.addEventListener('click', () => {
            if (input.value && input.value.trim()) {
                showCustomAlert('ℹ️ This CF4 section uses one standard default template. You can edit it directly or press Clear for a blank note.', 'DEFAULT TEMPLATE');
            } else {
                showCustomAlert('Type a note first if you want to replace this row.', 'INFO');
            }
        });
        
        editTemplateBtn.addEventListener('click', () => {
            if (input.currentTemplateIndex >= 0) {
                setCourseOrderValue(input, DOCTORS_NOTE_TEMPLATE);
                editTemplateBtn.style.display = 'none';
                input.currentTemplateIndex = -1;
            }
        });

        // Quick-erase button: clear only this note. Keep it blank until the doctor types again.
        clearTextBtn.addEventListener('click', () => {
            removeFillableIfAny(input);
            setCourseOrderValue(input, '');
            dropdown.style.display = 'none';
            input.focus();
        });
        
        searchInput.addEventListener('input', (e) => {
            e.stopPropagation();
            renderTemplateOptions(searchInput.value);
        });
        
        function renderTemplateOptions(filterText = '') {
            const templates = getCf4Templates('cf4DoctorsNoteTemplates').sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
            optionsList.innerHTML = '';
            
            const filtered = templates.filter(tpl => tpl.toLowerCase().includes(filterText.toLowerCase()));
            filtered.forEach((tpl) => {
                const originalIndex = templates.indexOf(tpl);
                const item = document.createElement('button');
                item.type = 'button';
                item.className = 'template-option-item';
                item.textContent = tpl;
                Object.assign(item.style, {
                    width: '100%',
                    padding: '12px',
                    background: 'transparent',
                    border: 'none',
                    borderBottom: '1px solid #dee2e6',
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontSize: '13px',
                    color: 'var(--text-color)',
                    transition: 'background 0.2s ease, color 0.2s ease',
                    lineHeight: '1.6',
                    whiteSpace: 'normal',
                    wordWrap: 'break-word'
                });
                
                item.addEventListener('mouseenter', () => { item.style.background = 'rgba(14, 165, 233, 0.10)'; item.style.color = 'var(--primary-hover-color)'; });
                item.addEventListener('mouseleave', () => { item.style.background = 'transparent'; item.style.color = 'var(--text-color)'; });
                item.addEventListener('click', () => {
                    // All templates use the same plain, editable textarea. The doctor
                    // can type inside (     ) or clear the entire note from Clear.
                    setCourseOrderValue(input, tpl);
                    input.currentTemplateIndex = originalIndex;
                    editTemplateBtn.style.display = 'inline-block';
                    dropdown.style.display = 'none';
                });
                
                optionsList.appendChild(item);
            });
            
            if (!filtered.length) {
                const emptyMsg = document.createElement('div');
                emptyMsg.textContent = 'No matching templates found.';
                emptyMsg.className = 'template-empty-message';
                Object.assign(emptyMsg.style, {
                    padding: '15px',
                    textAlign: 'center',
                    color: '#999',
                    fontSize: '13px'
                });
                optionsList.appendChild(emptyMsg);
            }
        }
        
        document.addEventListener('click', (e) => {
            if (!templateWrapper.contains(e.target)) {
                dropdown.style.display = 'none';
                editTemplateBtn.style.display = 'none';
                input.currentTemplateIndex = -1;
            }
        });
    }

    // Optional fillable view retained for the other saved CF4 phrase fields.
    function createFillableTemplate(input, templateText) {
        // Hide the original textarea
        input.style.display = 'none';
        
        // Create fillable template container
        const fillableContainer = document.createElement('div');
        fillableContainer.className = 'fillable-template-container';
        Object.assign(fillableContainer.style, {
            padding: '18px 20px',
            border: '2px solid var(--primary-color)',
            borderRadius: '10px',
            backgroundColor: 'var(--input-bg-color)',
            fontSize: '15px',
            lineHeight: '2',
            fontFamily: 'inherit',
            minHeight: '300px',
            boxShadow: 'inset 0 2px 8px rgba(0, 0, 0, 0.04)'
        });

        // Small hint at the top of the fillable template
        const fillableHint = document.createElement('div');
        fillableHint.className = 'fillable-hint';
        fillableHint.textContent = '✏️ Type directly on the underlined blank spaces above. Blanks left empty will print as "_____".';
        Object.assign(fillableHint.style, {
            fontSize: '11px',
            color: 'var(--secondary-text-color)',
            borderBottom: '1px dashed var(--border-color)',
            paddingBottom: '8px',
            marginBottom: '10px'
        });
        fillableContainer.appendChild(fillableHint);
        
        // Parse template and create fillable fields
        const parts = templateText.split(/(\([ ]+\))/g);
        const fillableFields = [];
        
        parts.forEach((part, index) => {
            if (part.match(/\([ ]+\)/)) {
                // This is a fillable blank
                const blankInput = document.createElement('input');
                blankInput.type = 'text';
                blankInput.className = 'fillable-blank';
                blankInput.dataset.fieldIndex = index;
                Object.assign(blankInput.style, {
                    border: 'none',
                    borderBottom: '2px solid var(--primary-color)',
                    backgroundColor: 'rgba(14, 165, 233, 0.06)',
                    fontSize: '15px',
                    fontFamily: 'inherit',
                    padding: '2px 6px',
                    margin: '0 2px',
                    minWidth: '150px',
                    outline: 'none',
                    fontWeight: '600',
                    borderRadius: '3px 3px 0 0'
                });
                blankInput.addEventListener('input', (e) => {
                    updateFillableTemplate(fillableContainer, input, fillableFields);
                });
                blankInput.addEventListener('keydown', (e) => {
                    // Prevent backspace from deleting the underline
                    if (e.key === 'Backspace' && blankInput.value === '') {
                        e.preventDefault();
                    }
                });
                fillableContainer.appendChild(blankInput);
                fillableFields.push(blankInput);
            } else if (part) {
                // This is regular text
                const textSpan = document.createElement('span');
                textSpan.textContent = part;
                textSpan.style.userSelect = 'none';
                fillableContainer.appendChild(textSpan);
            }
        });
        
        // Insert fillable container before the hidden textarea
        if (input.parentNode) {
            input.parentNode.insertBefore(fillableContainer, input);
        }
        
        // Store reference to fillable fields
        input.fillableContainer = fillableContainer;
        input.fillableFields = fillableFields;
        
        // Add a button to convert back to regular text
        const convertBtn = document.createElement('button');
        convertBtn.type = 'button';
        convertBtn.textContent = '📝 Convert to Regular Text';
        Object.assign(convertBtn.style, {
            marginTop: '8px',
            padding: '6px 12px',
            background: '#3498db',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: '600'
        });
        input.fillableConvertBtn = convertBtn;
        convertBtn.addEventListener('click', () => {
            const finalText = getFillableTemplateText(fillableFields);
            input.value = finalText;
            input.style.display = '';
            fillableContainer.remove();
            convertBtn.remove();
            input.fillableContainer = null;
            input.fillableFields = null;
            input.fillableConvertBtn = null;
            input.dispatchEvent(new Event('input'));
            input.dispatchEvent(new Event('change'));
        });
    }

    // Show a short visual confirmation when a note is quick-cleared.
    function showQuickClearConfirmation(row) {
        if (!row) return;
        const existingConfirmation = row.querySelector('.quick-clear-confirmation');
        if (existingConfirmation) {
            existingConfirmation.remove();
        }
        const confirmation = document.createElement('div');
        confirmation.className = 'quick-clear-confirmation';
        confirmation.setAttribute('role', 'status');
        confirmation.setAttribute('aria-live', 'polite');
        confirmation.textContent = '✓ Doctor\'s Order / Action cleared';
        row.appendChild(confirmation);
        window.setTimeout(() => {
            if (confirmation.isConnected) confirmation.remove();
        }, 1400);
    }

    function updateFillableTemplate(container, originalInput, fields) {
        // Keep the hidden textarea in sync so it can be saved / printed / restored
        const text = getFillableTemplateText(fields);
        originalInput.value = text;
        originalInput.dispatchEvent(new Event('input', { bubbles: true }));
        originalInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
    
    function getFillableTemplateText(fields) {
        // Reconstruct the template text with filled values
        let text = '';
        const container = fields[0]?.parentNode;
        if (!container) return '';
        
        const children = container.children;
        for (let i = 0; i < children.length; i++) {
            const child = children[i];
            if (child.tagName === 'INPUT' && child.classList.contains('fillable-blank')) {
                text += child.value || '_____';
            } else if (child.tagName === 'SPAN') {
                text += child.textContent;
            }
        }
        return text;
    }

    // Remove the fillable template view and bring the plain textarea back
    function removeFillableIfAny(input) {
        if (!input) return;
        if (input.fillableContainer) {
            input.fillableContainer.remove();
            input.fillableContainer = null;
            input.fillableFields = null;
        }
        if (input.fillableConvertBtn) {
            input.fillableConvertBtn.remove();
            input.fillableConvertBtn = null;
        }
        input.style.display = '';
    }

    // Set a course note as ordinary editable textarea text.
    function setCourseOrderValue(input, value) {
        if (!input) return;
        removeFillableIfAny(input);
        input.value = value == null ? '' : String(value);
        input.dataset.defaultTemplate = input.value === DOCTORS_NOTE_TEMPLATE ? 'true' : 'false';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        // Default/clear buttons are outside the form's delegated input listener.
        // Persisting here keeps their one-click behavior reliable.
        if (typeof saveFormData === 'function') saveFormData();
    }

    // Apply the default as normal textarea text. This keeps the template visible,
    // editable in place, and available to the existing save/load/PDF handlers.
    function applyDefaultDoctorsNoteTemplate(input) {
        if (!input) return;
        removeFillableIfAny(input);
        input.value = DOCTORS_NOTE_TEMPLATE;
        input.dataset.defaultTemplate = 'true';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        if (typeof saveFormData === 'function') saveFormData();
    }

    // The textarea is the source of truth. Keep a cleared row blank, but restore
    // the standard note when a new row is created or the whole form is cleared.
    function resetCourseRowsToDefault() {
        if (!courseInWardContainer) return;
        courseInWardContainer.innerHTML = '';
        courseInWardContainer.appendChild(createCourseRow());
    }

    // Preserve a deliberately cleared row. A missing value from an older draft
    // still receives the standard note so fresh/legacy forms are never empty.
    function setCourseOrderFromSavedData(input, value, hasSavedValue = false) {
        if (!input) return;
        if (!hasSavedValue) {
            setCourseOrderValue(input, DOCTORS_NOTE_TEMPLATE);
            return;
        }
        const savedValue = Array.isArray(value) ? value[0] : value;
        setCourseOrderValue(input, savedValue == null ? '' : String(savedValue));
    }

    // Apply to template fields
    document.querySelectorAll('#chiefComplaint, #admittingDiagnosis, #dischargeDiagnosis, #historyPresentIllness, #pertinentPastMedicalHistory').forEach(input => {
        createTemplateSelect(input);
    });

    // Doctor's Notes templates for course in ward rows - REMOVED per user request
    function getFormData() {
        const formData = new FormData(cf4Form); const data = {};
        for (const [key, value] of formData.entries()) {
            if (key.endsWith('[]')) { const cleanKey = key.slice(0, -2); if (!data[cleanKey]) data[cleanKey] = []; data[cleanKey].push(value); }
            else { data[key] = value; }
        }
        const checkboxGroups = ['symptom', 'heent', 'chestLungs', 'cvs', 'abdomen', 'gu', 'skinExtremities', 'neuroExam'];
        checkboxGroups.forEach(groupName => {
            const checkboxes = document.querySelectorAll(`input[name="${groupName}"]:checked`);
            data[groupName] = Array.from(checkboxes).map(cb => cb.value);
        });
        const radioGroups = ['patientSex', 'referredFromHci', 'generalSurvey', 'outcome'];
        radioGroups.forEach(groupName => {
            const radio = document.querySelector(`input[name="${groupName}"]:checked`);
            data[groupName] = radio ? radio.value : '';
        });
        return data;
    }
    function saveFormData() {
        if (!cf4Form) return;
        try {
            const data = getFormData();
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        } catch (error) {
            console.error('Unable to save CF4 form data:', error);
        }
    }
    function loadFormData() {
        if (!cf4Form) return;
        const saved = localStorage.getItem(STORAGE_KEY);
        if (!saved) return;
        try {
            const data = JSON.parse(saved);
            let courseRowsRestored = false;
            let drugRowsRestored = false;
            Object.keys(data).forEach(key => {
                // Skip HCI fields - they are handled by default settings.
                if (['hciName', 'hciBldgNo', 'hciStreet', 'hciBarangay', 'hciProvince', 'hciZipCode'].includes(key)) {
                    return;
                }
                if (key === 'courseDate' || key === 'courseTime' || key === 'courseOrder') {
                    if (!courseRowsRestored) {
                        restoreCourseRows(data);
                        courseRowsRestored = true;
                    }
                    return;
                }
                if (key === 'drugGenericName' || key === 'drugQuantity' || key === 'drugTotalCost') {
                    if (!drugRowsRestored) {
                        restoreDrugRows(data);
                        drugRowsRestored = true;
                    }
                    return;
                }
                if (Array.isArray(data[key])) {
                    if (['symptom', 'heent', 'chestLungs', 'cvs', 'abdomen', 'gu', 'skinExtremities', 'neuroExam'].includes(key)) {
                        data[key].forEach(value => {
                            const checkbox = document.querySelector(`input[name="${key}"][value="${value}"]`);
                            if (checkbox) checkbox.checked = true;
                        });
                    }
                } else {
                    const input = document.getElementById(key) || document.querySelector(`[name="${key}"]`);
                    if (input && input.type !== 'radio' && input.type !== 'checkbox') {
                        input.value = data[key];
                    } else if (input && input.type === 'radio' && input.value === data[key]) {
                        input.checked = true;
                    }
                }
            });
        } catch (error) {
            console.error('Unable to load CF4 form data:', error);
        }
    }
    function restoreCourseRows(data) {
        if (!courseInWardContainer) return;
        const dates = Array.isArray(data.courseDate) ? data.courseDate : [];
        const orders = Array.isArray(data.courseOrder) ? data.courseOrder : [];
        const times = Array.isArray(data.courseTime) ? data.courseTime : [];
        const maxLen = Math.max(dates.length, orders.length, times.length);
        if (!maxLen) {
            resetCourseRowsToDefault();
            return;
        }
        courseInWardContainer.innerHTML = '';
        for (let i = 0; i < maxLen; i++) {
            const row = createCourseRow();
            const dateInput = row.querySelector('input[name="courseDate[]"]');
            const timeInput = row.querySelector('input[name="courseTime[]"]');
            const orderInput = row.querySelector('textarea[name="courseOrder[]"]');
            if (dateInput) dateInput.value = dates[i] || '';
            if (timeInput) timeInput.value = times[i] || '';
            if (orderInput) setCourseOrderFromSavedData(orderInput, orders[i], i < orders.length);
            courseInWardContainer.appendChild(row);
        }
    }

    function restoreDrugRows(data) {
        if (!drugsContainer) return; if (!data.drugGenericName && !data.drugQuantity && !data.drugTotalCost) return;
        const names = data.drugGenericName || []; const quantities = data.drugQuantity || []; const costs = data.drugTotalCost || [];
        const maxLen = Math.max(names.length, quantities.length, costs.length);
        drugsContainer.innerHTML = '';
        for (let i = 0; i < maxLen; i++) {
            const row = createDrugRow(); const nameInput = row.querySelector('input[name="drugGenericName[]"]'); const qtyInput = row.querySelector('input[name="drugQuantity[]"]'); const costInput = row.querySelector('input[name="drugTotalCost[]"]');
            if (nameInput && names[i]) nameInput.value = names[i]; if (qtyInput && quantities[i]) qtyInput.value = quantities[i]; if (costInput && costs[i]) costInput.value = costs[i];
            drugsContainer.appendChild(row);
        }
        if (drugsContainer.children.length === 0) { drugsContainer.appendChild(createDrugRow()); }
    }

    if (cf4Form) {
        cf4Form.addEventListener('input', (e) => {
            if ((e.target.type === 'text' || e.target.tagName === 'TEXTAREA') && e.target.value) {
                const start = e.target.selectionStart; const end = e.target.selectionEnd;
                e.target.value = e.target.value.toUpperCase(); e.target.setSelectionRange(start, end);
            }
            saveFormData();
        });
        cf4Form.addEventListener('change', saveFormData);
    }
    loadFormData();
    
    // Apply the standard post-procedure note only to rows that are genuinely blank.
    // A blank row intentionally cleared by the doctor must stay blank after reload.
    
    // Re-apply HCI defaults after loading form data (in case it was cleared)
    if (document.getElementById('hciName')) { 
        document.getElementById('hciName').value = savedCf4Settings.cf4HciName || defaultHciSettings.hciName; 
    }
    if (document.getElementById('hciBldgNo')) { 
        document.getElementById('hciBldgNo').value = savedCf4Settings.cf4HciBldgNo || defaultHciSettings.hciBldgNo; 
    }
    if (document.getElementById('hciStreet')) { 
        document.getElementById('hciStreet').value = savedCf4Settings.cf4HciStreet || defaultHciSettings.hciStreet; 
    }
    if (document.getElementById('hciBarangay')) { 
        document.getElementById('hciBarangay').value = savedCf4Settings.cf4HciBarangay || defaultHciSettings.hciBarangay; 
    }
    if (document.getElementById('hciProvince')) { 
        document.getElementById('hciProvince').value = savedCf4Settings.cf4HciProvince || defaultHciSettings.hciProvince; 
    }
    if (document.getElementById('hciZipCode')) { 
        document.getElementById('hciZipCode').value = savedCf4Settings.cf4HciZipCode || defaultHciSettings.hciZipCode; 
    }
    
    // Auto-fill date and time after loading saved data
    setTimeout(autoFillExistingCourseRows, 100);

    // Shared blank-form routine. Used by "Clear Form" (same patient, start over) and
    // by "New Form" (blank form for the next patient) so both stay identical.
    function resetCf4FormToBlank() {
        if (cf4Form) {
            cf4Form.querySelectorAll('input[type="text"], input[type="number"], input[type="date"], input[type="time"], textarea, select').forEach(input => { input.value = ''; });
            cf4Form.querySelectorAll('input[type="checkbox"]').forEach(checkbox => { checkbox.checked = false; });
            const defaultRadios = { 'referredFromHci': 'No', 'generalSurvey': 'Awake and alert', 'outcome': 'IMPROVED' };
            Object.keys(defaultRadios).forEach(name => {
                const radios = document.querySelectorAll(`input[name="${name}"]`);
                radios.forEach(r => r.checked = false);
                if (defaultRadios[name]) { const defaultRadio = document.querySelector(`input[name="${name}"][value="${defaultRadios[name]}"]`); if (defaultRadio) defaultRadio.checked = true; }
            });
        }
        if (courseInWardContainer) {
            resetCourseRowsToDefault();
        }
        if (drugsContainer) {
            drugsContainer.innerHTML = '';
            drugsContainer.appendChild(createDrugRow());
        }
        localStorage.removeItem(STORAGE_KEY);
    }

    const clearFormBtn = document.getElementById('clearFormBtn');
    if (clearFormBtn) {
        clearFormBtn.addEventListener('click', () => {
            // The doctor explicitly clicked Clear Form; do not interrupt with a browser confirm.
            resetCf4FormToBlank();
            showCustomAlert('FORM CLEARED. A fresh Doctor\'s Order/Action template is ready.', 'CLEARED');
        });
    }

    // NEW FORM: prepares a blank CF4 form for the next patient.
    const newFormBtn = document.getElementById('newFormBtn');
    if (newFormBtn) {
        newFormBtn.addEventListener('click', () => {
            // The doctor explicitly clicked New Form; start blank without a browser confirm.
            resetCf4FormToBlank();
            showCustomAlert('NEW FORM READY. A blank CF4 form is prepared for the next patient.', 'NEW FORM');
        });
    }

    // Open PDF functionality
    const openPdfBtn = document.getElementById('openPdfBtn');
    const pdfFileInput = document.getElementById('pdfFileInput');
    
    if (openPdfBtn && pdfFileInput) {
        openPdfBtn.addEventListener('click', () => {
            // Create a file input that accepts both PDF and JSON
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json,.pdf';
            input.style.display = 'none';
            document.body.appendChild(input);
            
            input.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (!file) {
                    document.body.removeChild(input);
                    return;
                }
                
                const isJson = file.name.endsWith('.json');
                const isPdf = file.type === 'application/pdf';
                
                if (!isJson && !isPdf) {
                    showCustomAlert('⚠️ Invalid file type!\n\nPlease select a .json or .pdf file.', 'ERROR');
                    document.body.removeChild(input);
                    return;
                }
                
                if (loadingSpinner) loadingSpinner.style.display = 'flex';
                
                try {
                    if (isJson) {
                        // Load from JSON data file (100% reliable)
                        const text = await file.text();
                        const formData = JSON.parse(text);
                        restoreFormDataFromJSON(formData);
                        window.PatientRecords?.recordOpen('cf4', formData, { format: 'Draft', fileName: file.name });
                        showCustomAlert('✅ SUCCESS! Form data loaded from JSON file.\n\nAll fields have been restored perfectly!', 'SUCCESS');
                } else {
                    // User selected a PDF - try to extract text using PDF.js
                    if (loadingSpinner) loadingSpinner.style.display = 'flex';
                    
                    try {
                        const arrayBuffer = await file.arrayBuffer();
                        const formDataFromPdf = await extractFormDataFromPDF(arrayBuffer);
                        if (formDataFromPdf) {
                            restoreFormDataFromJSON(formDataFromPdf);
                            window.PatientRecords?.recordOpen('cf4', formDataFromPdf, { format: 'PDF', fileName: file.name });
                            showCustomAlert('✅ PDF data restored successfully from embedded form data! Your form is now editable.', 'SUCCESS');
                        } else {
                            showCustomAlert('📄 Extracting visible text from PDF...\n\nPlease wait...', 'INFO');
                            const pdfText = await extractTextFromPDF(arrayBuffer);
                            if (pdfText && pdfText.length > 50) {
                                // Try to restore from PDF text
                                restoreFormDataFromPDF(pdfText);
                                window.PatientRecords?.recordOpen('cf4', getFormData(), { format: 'PDF', fileName: file.name });
                                showCustomAlert('✅ PDF data restored successfully!\n\nNote: Some fields may not have been extracted. For best results, use the .json data file.', 'SUCCESS');
                            } else {
                                // PDF extraction failed
                                const jsonFileName = file.name.replace('.pdf', '_data.json');
                                showCustomAlert(
                                    '⚠️ Could not extract data from PDF.\n\n' +
                                    'This PDF may not contain extractable text or metadata.\n\n' +
                                    '💡 SOLUTION:\n' +
                                    'Use the accompanying .json file saved with the PDF:\n' +
                                    '   ' + jsonFileName + '\n\n' +
                                    'The .json file contains all the form data and loads perfectly!',
                                    'ERROR'
                                );
                            }
                        }
                    } catch (err) {
                        console.error('Error extracting PDF:', err);
                        showCustomAlert('❌ ERROR EXTRACTING PDF\n\n' + err.message + '\n\nPlease use the .json data file instead.', 'ERROR');
                    } finally {
                        if (loadingSpinner) loadingSpinner.style.display = 'none';
                    }
                }
                } catch (err) {
                    console.error('Error reading file:', err);
                    showCustomAlert('❌ ERROR READING FILE\n\n' + err.message, 'ERROR');
                } finally {
                    if (loadingSpinner) loadingSpinner.style.display = 'none';
                    document.body.removeChild(input);
                }
            });
            
            input.click();
        });
    }
    
    async function extractTextFromPDF(arrayBuffer) {
        // Try to use PDF.js library if available
        try {
            if (typeof pdfjsLib !== 'undefined') {
                const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                let fullText = '';
                
                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const textContent = await page.getTextContent();
                    const pageText = textContent.items.map(item => item.str).join(' ');
                    fullText += pageText + '\n';
                }
                
                return fullText;
            }
        } catch (e) {
            console.warn('PDF.js extraction failed:', e);
        }
        
        return null;
    }
    
    function restoreFormDataFromJSON(formData) {
        // Restore all form fields from JSON data (most reliable method)
        const fieldMappings = {
            // HCI Information
            'hciName': 'hciName',
            'accreditationNo': 'accreditationNo',
            'hciBldgNo': 'hciBldgNo',
            'hciStreet': 'hciStreet',
            'hciBarangay': 'hciBarangay',
            'hciProvince': 'hciProvince',
            'hciZipCode': 'hciZipCode',
            
            // Patient Information
            'patientLastName': 'patientLastName',
            'patientFirstName': 'patientFirstName',
            'patientMiddleName': 'patientMiddleName',
            'patientPin': 'patientPin',
            'patientAge': 'patientAge',
            'patientSex': 'patientSex',
            
            // Medical Information
            'chiefComplaint': 'chiefComplaint',
            'admittingDiagnosis': 'admittingDiagnosis',
            'dischargeDiagnosis': 'dischargeDiagnosis',
            'firstCaseRateCode': 'firstCaseRateCode',
            'secondCaseRateCode': 'secondCaseRateCode',
            'dateAdmitted': 'dateAdmitted',
            'timeAdmitted': 'timeAdmitted',
            'timeAdmittedAmPm': 'timeAdmittedAmPm',
            'dateDischarged': 'dateDischarged',
            'timeDischarged': 'timeDischarged',
            'timeDischargedAmPm': 'timeDischargedAmPm',
            
            // Reason for Admission
            'historyPresentIllness': 'historyPresentIllness',
            'pertinentPastMedicalHistory': 'pertinentPastMedicalHistory',
            'obGravida': 'obGravida',
            'obPara': 'obPara',
            'obDetails': 'obDetails',
            'obLmp': 'obLmp',
            'referredFromHci': 'referredFromHci',
            'referredReason': 'referredReason',
            'originatingHci': 'originatingHci',
            
            // Physical Examination
            'generalSurvey': 'generalSurvey',
            'alteredSensoriumDetail': 'alteredSensoriumDetail',
            'vitalBp': 'vitalBp',
            'vitalHr': 'vitalHr',
            'vitalRr': 'vitalRr',
            'vitalTemp': 'vitalTemp',
            'vitalWeight': 'vitalWeight',
            'vitalHeight': 'vitalHeight',
            
            // Checkboxes
            'symptom': 'symptom',
            'symptomOthers': 'symptomOthers',
            'painSite': 'painSite',
            'heent': 'heent',
            'heentOthers': 'heentOthers',
            'chestLungs': 'chestLungs',
            'chestLungsOthers': 'chestLungsOthers',
            'cvs': 'cvs',
            'cvsOthers': 'cvsOthers',
            'abdomen': 'abdomen',
            'abdomenOthers': 'abdomenOthers',
            'gu': 'gu',
            'guOthers': 'guOthers',
            'skinExtremities': 'skinExtremities',
            'skinExtremitiesOthers': 'skinExtremitiesOthers',
            'neuroExam': 'neuroExam',
            'neuroExamOthers': 'neuroExamOthers',
            
            // Course in Ward
            'surgicalProcedure': 'surgicalProcedure',
            'surgicalRvsCode': 'surgicalRvsCode',
            'courseDate': 'courseDate',
            'courseTime': 'courseTime',
            'courseOrder': 'courseOrder',
            
            // Drugs
            'drugGenericName': 'drugGenericName',
            'drugQuantity': 'drugQuantity',
            'drugTotalCost': 'drugTotalCost',
            
            // Outcome
            'outcome': 'outcome',
            
            // Certification
            'attendingHcpName': 'attendingHcpName',
            'dateSigned': 'dateSigned'
        };
        
        // Apply each field value
        Object.keys(fieldMappings).forEach(jsonKey => {
            const formFieldId = fieldMappings[jsonKey];
            const value = formData[jsonKey];
            
            if (value === undefined || value === null) return;
            
            const input = document.getElementById(formFieldId);
            if (!input) return;
            
            // Handle arrays (checkboxes, course rows, drugs)
            if (Array.isArray(value)) {
                if (input.type === 'checkbox') {
                    // This is a checkbox group - handled separately below
                    return;
                }
                // For other arrays, skip (they need special handling)
                return;
            }
            
            // Handle radio buttons
            if (input.type === 'radio') {
                const radio = document.querySelector(`input[name="${formFieldId}"][value="${value}"]`);
                if (radio) radio.checked = true;
                return;
            }
            
            // Handle checkboxes
            if (input.type === 'checkbox') {
                input.checked = value === true || value === 'true';
                return;
            }
            
            // Handle regular inputs
            input.value = value;
        });
        
        // Handle checkbox groups
        const checkboxGroups = ['symptom', 'heent', 'chestLungs', 'cvs', 'abdomen', 'gu', 'skinExtremities', 'neuroExam'];
        checkboxGroups.forEach(groupName => {
            const values = formData[groupName];
            if (Array.isArray(values)) {
                values.forEach(value => {
                    const checkbox = document.querySelector(`input[name="${groupName}"][value="${value}"]`);
                    if (checkbox) checkbox.checked = true;
                });
            }
        });
        
        // Handle course rows
        if (formData.courseDate && Array.isArray(formData.courseDate)) {
            const dates = formData.courseDate;
            const orders = formData.courseOrder || [];
            const times = formData.courseTime || [];
            
            // Clear existing rows
            courseInWardContainer.innerHTML = '';
            
            // Create rows for each entry
            for (let i = 0; i < dates.length; i++) {
                const row = createCourseRow();
                const dateInput = row.querySelector('input[name="courseDate[]"]');
                const timeInput = row.querySelector('input[name="courseTime[]"]');
                const orderInput = row.querySelector('textarea[name="courseOrder[]"]');
                
                if (dateInput && dates[i]) dateInput.value = dates[i];
                if (timeInput && times[i]) timeInput.value = times[i];
                setCourseOrderFromSavedData(orderInput, orders[i], i < orders.length);

                courseInWardContainer.appendChild(row);
            }
            
            if (dates.length === 0) {
                courseInWardContainer.appendChild(createCourseRow());
            }
        }
        
        // Handle drug rows
        if (formData.drugGenericName && Array.isArray(formData.drugGenericName)) {
            const names = formData.drugGenericName;
            const quantities = formData.drugQuantity || [];
            const costs = formData.drugTotalCost || [];
            
            // Clear existing rows
            drugsContainer.innerHTML = '';
            
            // Create rows for each entry
            for (let i = 0; i < names.length; i++) {
                const row = createDrugRow();
                const nameInput = row.querySelector('input[name="drugGenericName[]"]');
                const qtyInput = row.querySelector('input[name="drugQuantity[]"]');
                const costInput = row.querySelector('input[name="drugTotalCost[]"]');
                
                if (nameInput && names[i]) nameInput.value = names[i];
                if (qtyInput && quantities[i]) qtyInput.value = quantities[i];
                if (costInput && costs[i]) costInput.value = costs[i];
                
                drugsContainer.appendChild(row);
            }
            
            if (names.length === 0) {
                drugsContainer.appendChild(createDrugRow());
            }
        }
        
        // Trigger change event to save
        cf4Form.dispatchEvent(new Event('change'));
    }
    
    function restoreFormDataFromPDF(pdfText) {
        // Split text into lines and process each line
        const lines = pdfText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
        
        // Create a map of field labels to their values
        const fieldMap = {};
        
        // Process lines to find field-value pairs
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const upperLine = line.toUpperCase();
            
            // HCI Information
            if (upperLine.includes('NAME OF HCI') || upperLine.includes('HCI')) {
                const nextLine = lines[i + 1];
                if (nextLine && !nextLine.match(/^(ACCREDITATION|ADDRESS|BLDG)/)) {
                    fieldMap.hciName = fieldMap.hciName || nextLine;
                }
            }
            
            if (upperLine.includes('ACCREDITATION')) {
                const value = line.replace(/^.*?:\s*/, '').trim();
                if (value) fieldMap.accreditationNo = value;
            }
            
            if (upperLine.includes('BLDG') || upperLine.includes('BUILDING')) {
                const value = line.replace(/^.*?:\s*/, '').trim();
                if (value) fieldMap.hciBldgNo = value;
            }
            
            if (upperLine === 'STREET' || upperLine.includes('STREET:')) {
                const value = line.replace(/^.*?:\s*/, '').trim();
                if (value) fieldMap.hciStreet = value;
            }
            
            if (upperLine.includes('BARANGAY') || upperLine.includes('CITY')) {
                const value = line.replace(/^.*?:\s*/, '').trim();
                if (value) fieldMap.hciBarangay = value;
            }
            
            if (upperLine.includes('PROVINCE')) {
                const value = line.replace(/^.*?:\s*/, '').trim();
                if (value) fieldMap.hciProvince = value;
            }
            
            if (upperLine.includes('ZIP')) {
                const value = line.replace(/^.*?:\s*/, '').trim();
                if (value) fieldMap.hciZipCode = value;
            }
            
            // Patient Information
            if (upperLine.includes('LAST NAME') || upperLine === 'LAST') {
                const value = line.replace(/^.*?:\s*/, '').trim();
                if (value) fieldMap.patientLastName = value;
            }
            
            if (upperLine.includes('FIRST NAME') || upperLine === 'FIRST') {
                const value = line.replace(/^.*?:\s*/, '').trim();
                if (value) fieldMap.patientFirstName = value;
            }
            
            if (upperLine.includes('MIDDLE NAME') || upperLine === 'MIDDLE') {
                const value = line.replace(/^.*?:\s*/, '').trim();
                if (value) fieldMap.patientMiddleName = value;
            }
            
            if (upperLine.includes('PIN')) {
                const value = line.replace(/^.*?:\s*/, '').trim();
                if (value) fieldMap.patientPin = value;
            }
            
            if (upperLine.includes('AGE')) {
                const value = line.replace(/^.*?:\s*/, '').trim();
                const ageNum = value.match(/\d+/);
                if (ageNum) fieldMap.patientAge = ageNum[0];
            }
            
            if (upperLine.includes('SEX') && !upperLine.includes('SEXUAL')) {
                const value = line.replace(/^.*?:\s*/, '').trim();
                if (value.match(/^(MALE|FEMALE)/i)) fieldMap.patientSex = value.match(/^(MALE|FEMALE)/i)[0].toUpperCase();
            }
            
            // Medical Information
            if (upperLine.includes('CHIEF COMPLAINT')) {
                const value = line.replace(/^.*?:\s*/, '').trim();
                if (value && value.length > 3) fieldMap.chiefComplaint = value;
            }
            
            if (upperLine.includes('ADMITTING') && upperLine.includes('DX')) {
                const value = line.replace(/^.*?:\s*/, '').trim();
                if (value && value.length > 3) fieldMap.admittingDiagnosis = value;
            }
            
            if (upperLine.includes('DISCHARGE') && upperLine.includes('DX')) {
                const value = line.replace(/^.*?:\s*/, '').trim();
                if (value && value.length > 3) fieldMap.dischargeDiagnosis = value;
            }
            
            if (upperLine.includes('HISTORY OF PRESENT ILLNESS') || upperLine.includes('HPI')) {
                const value = line.replace(/^.*?:\s*/, '').trim();
                if (value && value.length > 5) fieldMap.historyPresentIllness = value;
            }
            
            if (upperLine.includes('PAST MEDICAL HISTORY') || upperLine.includes('PMH')) {
                const value = line.replace(/^.*?:\s*/, '').trim();
                if (value && value.length > 3) fieldMap.pertinentPastMedicalHistory = value;
            }
            
            // Dates
            if (upperLine.includes('DATE ADMITTED') || upperLine.includes('ADMISSION DATE')) {
                const dateMatch = line.match(/\d{4}-\d{2}-\d{2}/);
                if (dateMatch) fieldMap.dateAdmitted = dateMatch[0];
            }
            
            if (upperLine.includes('DATE DISCHARGED') || upperLine.includes('DISCHARGE DATE')) {
                const dateMatch = line.match(/\d{4}-\d{2}-\d{2}/);
                if (dateMatch) fieldMap.dateDischarged = dateMatch[0];
            }
        }
        
        // Apply values to form fields
        if (fieldMap.hciName && document.getElementById('hciName')) {
            document.getElementById('hciName').value = fieldMap.hciName;
        }
        if (fieldMap.accreditationNo && document.getElementById('accreditationNo')) {
            document.getElementById('accreditationNo').value = fieldMap.accreditationNo;
        }
        if (fieldMap.hciBldgNo && document.getElementById('hciBldgNo')) {
            document.getElementById('hciBldgNo').value = fieldMap.hciBldgNo;
        }
        if (fieldMap.hciStreet && document.getElementById('hciStreet')) {
            document.getElementById('hciStreet').value = fieldMap.hciStreet;
        }
        if (fieldMap.hciBarangay && document.getElementById('hciBarangay')) {
            document.getElementById('hciBarangay').value = fieldMap.hciBarangay;
        }
        if (fieldMap.hciProvince && document.getElementById('hciProvince')) {
            document.getElementById('hciProvince').value = fieldMap.hciProvince;
        }
        if (fieldMap.hciZipCode && document.getElementById('hciZipCode')) {
            document.getElementById('hciZipCode').value = fieldMap.hciZipCode;
        }
        
        if (fieldMap.patientLastName && document.getElementById('patientLastName')) {
            document.getElementById('patientLastName').value = fieldMap.patientLastName;
        }
        if (fieldMap.patientFirstName && document.getElementById('patientFirstName')) {
            document.getElementById('patientFirstName').value = fieldMap.patientFirstName;
        }
        if (fieldMap.patientMiddleName && document.getElementById('patientMiddleName')) {
            document.getElementById('patientMiddleName').value = fieldMap.patientMiddleName;
        }
        if (fieldMap.patientPin && document.getElementById('patientPin')) {
            document.getElementById('patientPin').value = fieldMap.patientPin;
        }
        if (fieldMap.patientAge && document.getElementById('patientAge')) {
            document.getElementById('patientAge').value = fieldMap.patientAge;
        }
        if (fieldMap.patientSex) {
            const sexRadio = document.querySelector(`input[name="patientSex"][value="${fieldMap.patientSex}"]`);
            if (sexRadio) sexRadio.checked = true;
        }
        
        if (fieldMap.chiefComplaint && document.getElementById('chiefComplaint')) {
            document.getElementById('chiefComplaint').value = fieldMap.chiefComplaint;
        }
        if (fieldMap.admittingDiagnosis && document.getElementById('admittingDiagnosis')) {
            document.getElementById('admittingDiagnosis').value = fieldMap.admittingDiagnosis;
        }
        if (fieldMap.dischargeDiagnosis && document.getElementById('dischargeDiagnosis')) {
            document.getElementById('dischargeDiagnosis').value = fieldMap.dischargeDiagnosis;
        }
        if (fieldMap.historyPresentIllness && document.getElementById('historyPresentIllness')) {
            document.getElementById('historyPresentIllness').value = fieldMap.historyPresentIllness;
        }
        if (fieldMap.pertinentPastMedicalHistory && document.getElementById('pertinentPastMedicalHistory')) {
            document.getElementById('pertinentPastMedicalHistory').value = fieldMap.pertinentPastMedicalHistory;
        }
        
        if (fieldMap.dateAdmitted && document.getElementById('dateAdmitted')) {
            document.getElementById('dateAdmitted').value = fieldMap.dateAdmitted;
        }
        if (fieldMap.dateDischarged && document.getElementById('dateDischarged')) {
            document.getElementById('dateDischarged').value = fieldMap.dateDischarged;
        }
        
        // Trigger save event
        cf4Form.dispatchEvent(new Event('change'));
    }

    function imageToBase64(url) {
        return new Promise((resolve) => {
            if (!url) {
                resolve('');
                return;
            }
            // Custom settings store logos as data URLs. Reuse them directly; trying
            // to draw a data URL through a cross-origin canvas can taint the canvas.
            if (/^data:image\//i.test(url)) {
                resolve(url);
                return;
            }

            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                const width = img.naturalWidth || img.width;
                const height = img.naturalHeight || img.height;
                if (!width || !height) {
                    resolve('');
                    return;
                }
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    resolve('');
                    return;
                }
                try {
                    ctx.drawImage(img, 0, 0);
                    resolve(canvas.toDataURL('image/png'));
                } catch (error) {
                    console.warn('Unable to embed CF4 logo for printing.', error);
                    resolve('');
                }
            };
            img.onerror = () => resolve('');
            img.src = url;
        });
    }

    function encodePdfFormData(formData) {
        try {
            const json = JSON.stringify(formData);
            return 'CF4_FORM_DATA:' + btoa(unescape(encodeURIComponent(json)));
        } catch (err) {
            console.warn('Failed to encode PDF form data:', err);
            return '';
        }
    }

    function decodePdfFormData(encodedSubject) {
        if (!encodedSubject || typeof encodedSubject !== 'string') return null;
        const marker = 'CF4_FORM_DATA:';
        if (!encodedSubject.startsWith(marker)) return null;
        try {
            const encoded = encodedSubject.slice(marker.length);
            const json = decodeURIComponent(escape(atob(encoded)));
            return JSON.parse(json);
        } catch (err) {
            console.warn('Failed to decode PDF metadata form data:', err);
            return null;
        }
    }

    function setPdfFormMetadata(pdf, formData) {
        if (!pdf || !formData) return;
        const encoded = encodePdfFormData(formData);
        if (!encoded) return;
        try {
            pdf.setProperties({ subject: encoded });
        } catch (err) {
            console.warn('Failed to write form data into PDF metadata:', err);
        }
    }

    async function extractFormDataFromPDF(arrayBuffer) {
        if (typeof pdfjsLib === 'undefined') return null;
        try {
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            const metadata = await pdf.getMetadata();
            const subject = metadata?.info?.Subject || (metadata?.metadata && typeof metadata.metadata.get === 'function' ? metadata.metadata.get('dc:subject') : null);
            const formData = decodePdfFormData(subject);
            if (formData) {
                return formData;
            }
        } catch (err) {
            console.warn('PDF metadata extraction failed:', err);
        }
        return null;
    }

    const printBtn = document.getElementById('printBtn');
    const savePdfBtn = document.getElementById('savePdfBtn');
    const previewPdfBtn = document.getElementById('previewPdfBtn');
    const printDiv = document.getElementById('printDiv');
    const loadingSpinner = document.getElementById('loadingSpinner');
    const pdfPreviewModal = document.getElementById('pdfPreviewModal');
    const pdfPreviewFrame = document.getElementById('pdfPreviewFrame');
    const closePdfPreviewBtn = document.getElementById('closePdfPreviewBtn');
    const cancelPdfBtn = document.getElementById('cancelPdfBtn');
    const savePdfFromPreviewBtn = document.getElementById('savePdfFromPreviewBtn');
    let generatedPdfBlob = null;

    // ALL CHECKBOX ITEMS FOR DISPLAY IN PDF
    const SYMPTOM_ITEMS = ['Altered mental sensorium','Abdominal cramp/pain','Anorexia','Bleeding gums','Body weakness','Blurring of vision','Chest pain/discomfort','Constipation','Cough','Diarrhea','Dizziness','Dysphagia','Dyspnea','Dysuria','Epistaxis','Fever','Frequency of urination','Headache','Hematemesis','Hematuria','Hemoptysis','Irritability','Jaundice','Lower extremity edema','Myalgia','Orthopnea','Pain','Palpitations','Seizures','Skin rashes','Stool, bloody/black tarry/mucoid','Sweating','Urgency','Vomiting','Weight loss'];
    const HEENT_ITEMS = ['Essentially normal','Abnormal pupillary reaction','Cervical lymphadenopathy','Dry mucous membrane','Icteric sclerae','Pale conjunctivae','Sunken eyeballs','Sunken fontanelle'];
    const CHEST_ITEMS = ['Essentially normal','Asymmetrical chest expansion','Decreased breath sounds','Wheezes','Lump/s over breast(s)','Rales/crackles/rhonchi','Intercostal rib/clavicular retraction'];
    const CVS_ITEMS = ['Essentially normal','Displaced apex beat','Heaves and/or thrills','Pericardial bulge','Irregular rhythm','Muffled heart sounds','Murmur'];
    const ABDOMEN_ITEMS = ['Essentially normal','Abdominal rigidity','Abdomen tenderness','Hyperactive bowel sounds','Palpable mass(es)','Tympanitic/dull abdomen','Uterine contraction'];
    const GU_ITEMS = ['Essentially normal','Blood stained in exam finger','Cervical dilatation','Presence of abnormal discharge'];
    const SKIN_ITEMS = ['Essentially normal','Clubbing','Cold clammy skin','Cyanosis/mottled skin','Edema/swelling','Decreased mobility','Pale nailbeds','Poor skin turgor','Rashes/petechiae','Weak pulses'];
    const NEURO_ITEMS = ['Essentially normal','Abnormal gait','Abnormal position sense','Abnormal/decreased sensation','Abnormal reflex(es)','Poor/altered memory','Poor muscle tone/strength','Poor coordination'];

    function buildCheckboxGrid(items, checkedValues, othersText = '') {
        let html = '<table style="width:100%;border-collapse:collapse;font-size:12px;">';
        let col = 0;
        items.forEach(item => {
            if (col === 0) { html += '<tr>'; }
            const isChecked = checkedValues && checkedValues.includes(item);
            // CSS-styled checkboxes that look like real paper form checkboxes - renders correctly in PDF
            const mark = isChecked 
                ? '<span style="display:inline-block;width:11px;height:11px;border:1px solid #444;vertical-align:middle;text-align:center;line-height:11px;font-size:10px;font-weight:bold;font-family:Arial,sans-serif;background:#fff;margin-right:3px;">X</span>'
                : '<span style="display:inline-block;width:11px;height:11px;border:1px solid #444;vertical-align:middle;background:#fff;margin-right:3px;">&nbsp;</span>';
            html += `<td style="padding:5px 10px;border:1px solid #bbb;text-align:left;width:33%;">${mark} ${item.toUpperCase()}</td>`;
            col++;
            if (col === 3) { html += '</tr>'; col = 0; }
        });
        if (col > 0) { while (col < 3) { html += '<td style="padding:5px 10px;border:1px solid #bbb;width:33%;">&nbsp;</td>'; col++; } html += '</tr>'; }
        if (othersText) {
            const otherMark = '<span style="display:inline-block;width:11px;height:11px;border:1px solid #444;vertical-align:middle;background:#fff;margin-right:3px;">&nbsp;</span>';
            html += `<tr><td colspan="3" style="padding:5px 10px;border:1px solid #bbb;text-align:left;font-weight:600;">${otherMark} OTHERS: ${othersText.toUpperCase()}</td></tr>`;
        }
        html += '</table>';
        return html;
    }

    async function getCf4PrintLogoSources() {
        const settings = readStoredJson('cf4Settings', {});
        const leftPath = settings.cf4LeftLogo || CF4_DEFAULT_LOGOS.left;
        const rightPath = settings.cf4RightLogo || CF4_DEFAULT_LOGOS.right;
        const [left, right] = await Promise.all([
            imageToBase64(leftPath),
            imageToBase64(rightPath)
        ]);

        // CF4 Print and Save PDF always use both configured logos. A failed
        // data-URL conversion still falls back to the browser-resolved path.
        return {
            left: left || leftPath,
            right: right || rightPath
        };
    }

    async function prepareCf4PrintContent() {
        if (!printDiv) return '';
        const logoSources = await getCf4PrintLogoSources();
        printDiv.style.cssText = 'display:block;width:794px;min-height:1123px;height:auto;box-sizing:border-box;background:#fff;color:#000;position:fixed;inset:0 auto auto 0;z-index:9999;overflow:visible;';
        printDiv.innerHTML = buildPrintContent(logoSources);
        const images = Array.from(printDiv.querySelectorAll('img'));
        await Promise.all(images.map(image => {
            if (image.complete) return Promise.resolve();
            return new Promise(resolve => {
                image.addEventListener('load', resolve, { once: true });
                image.addEventListener('error', resolve, { once: true });
            });
        }));
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        return printDiv.innerHTML;
    }

    function buildPrintContent(logoSources = {}) {
        const data = getFormData();
        const val = (v) => v ? v.toUpperCase() : '';
        const latestCf4Settings = readStoredJson('cf4Settings', {});
        const leftLogoSrc = logoSources.left || latestCf4Settings.cf4LeftLogo || CF4_DEFAULT_LOGOS.left;
        const rightLogoSrc = logoSources.right || latestCf4Settings.cf4RightLogo || CF4_DEFAULT_LOGOS.right;

        let courseRowsHtml = '';
        if (data.courseDate && data.courseDate.length > 0) {
            for (let i = 0; i < data.courseDate.length; i++) {
                if (data.courseDate[i] || (data.courseOrder && data.courseOrder[i])) {
        const dateVal = val(data.courseDate[i]);
        const timeVal = val(data.courseTime && data.courseTime[i]);
        const dateTimeDisplay = timeVal ? `${dateVal}<br>${timeVal}` : dateVal;
        courseRowsHtml += `<tr><td style="width:130px;padding:10px;border:1px solid #000;font-size:11px;vertical-align:top;font-weight:600;text-align:left;border-bottom:1px solid #000;height:100px;">${dateTimeDisplay}</td><td style="padding:10px;border:1px solid #000;font-size:11px;line-height:1.6;vertical-align:top;text-align:left;border-bottom:1px solid #000;height:100px;">${val(data.courseOrder && data.courseOrder[i])}</td></tr>`;
                }
            }
        }
        if (!courseRowsHtml) {
            courseRowsHtml = '<tr><td colspan="2" style="padding:10px;border:1px solid #000;text-align:left;font-style:italic;font-size:11px;border-bottom:1px solid #000;height:100px;">&nbsp;</td></tr>';
        }

        let drugsRowsHtml = '';
        if (data.drugGenericName && data.drugGenericName.length > 0) {
            for (let i = 0; i < data.drugGenericName.length; i++) {
                if (data.drugGenericName[i] || (data.drugQuantity && data.drugQuantity[i]) || (data.drugTotalCost && data.drugTotalCost[i])) {
                    drugsRowsHtml += `<tr><td style="padding:5px;border:1px solid #000;font-size:9px;font-weight:600;width:33%;text-align:left;border-bottom:1px solid #000;">${val(data.drugGenericName[i])}</td><td style="padding:5px;border:1px solid #000;font-size:9px;width:33%;text-align:left;border-bottom:1px solid #000;">${val(data.drugQuantity && data.drugQuantity[i])}</td><td style="padding:5px;border:1px solid #000;font-size:9px;text-align:left;width:34%;border-bottom:1px solid #000;">${val(data.drugTotalCost && data.drugTotalCost[i])}</td></tr>`;
                }
            }
        }
        if (!drugsRowsHtml) { drugsRowsHtml = '<tr><td colspan="3" style="padding:8px;border:1px solid #000;text-align:left;font-style:italic;font-size:9px;border-bottom:1px solid #000;">NO ENTRIES</td></tr>'; }

        // Build checkbox grids
        const symptomGrid = buildCheckboxGrid(SYMPTOM_ITEMS, data.symptom, data.symptomOthers);
        const heentGrid = buildCheckboxGrid(HEENT_ITEMS, data.heent, data.heentOthers);
        const chestGrid = buildCheckboxGrid(CHEST_ITEMS, data.chestLungs, data.chestLungsOthers);
        const cvsGrid = buildCheckboxGrid(CVS_ITEMS, data.cvs, data.cvsOthers);
        const abdomenGrid = buildCheckboxGrid(ABDOMEN_ITEMS, data.abdomen, data.abdomenOthers);
        const guGrid = buildCheckboxGrid(GU_ITEMS, data.gu, data.guOthers);
        const skinGrid = buildCheckboxGrid(SKIN_ITEMS, data.skinExtremities, data.skinExtremitiesOthers);
        const neuroGrid = buildCheckboxGrid(NEURO_ITEMS, data.neuroExam, data.neuroExamOthers);

        return `<div style="font-family:Arial,sans-serif;color:#000;font-size:10px;padding:15px;line-height:1.5;">
            <table class="cf4-print-logo-header" role="presentation" style="width:100%;border-collapse:collapse;margin:0 0 8px;table-layout:fixed;">
                <tr>
                    <td style="width:80px;padding:0;vertical-align:middle;text-align:left;">${leftLogoSrc ? `<img src="${leftLogoSrc}" alt="CF4 Left Logo" style="display:block;width:60px;height:60px;object-fit:contain;object-position:left center;" crossorigin="anonymous">` : ''}</td>
                    <td style="padding:0 4px;vertical-align:middle;text-align:center;"><div style="font-size:13px;font-weight:bold;letter-spacing:0.3px;margin-bottom:2px;">PhilHealth</div><div style="font-size:11px;letter-spacing:0.3px;margin-bottom:2px;">CF4 (Claim Form 4)</div><div style="font-size:9px;letter-spacing:0.2px;color:#666;">February 2020</div><div style="font-size:8px;color:#777;margin-top:2px;font-style:italic;">This form may be reproduced and is NOT FOR SALE</div></td>
                    <td style="width:80px;padding:0;vertical-align:middle;text-align:right;">${rightLogoSrc ? `<img src="${rightLogoSrc}" alt="CF4 Right Logo" style="display:block;width:60px;height:60px;margin-left:auto;object-fit:contain;object-position:right center;" crossorigin="anonymous">` : ''}</td>
                </tr>
            </table>

            <table style="width:100%;border-collapse:collapse;margin-bottom:8px;"><tr><td style="padding:8px;border:1px solid #000;background:#fff;font-size:9px;text-align:left;line-height:1.4;"><strong>IMPORTANT REMINDERS:</strong> PLEASE FILL OUT APPROPRIATE FIELDS. WRITE IN CAPITAL LETTERS AND CHECK THE APPROPRIATE BOXES. This form, together with other supporting documents, should be filed within sixty (60) calendar days from date of discharge. All information, fields and tick boxes in this form are necessary. Claim forms with incomplete information shall not be processed. <strong>FALSE/INCORRECT INFORMATION OR MISREPRESENTATION SHALL BE SUBJECT TO CRIMINAL, CIVIL OR ADMINISTRATIVE LIABILITIES.</strong></td></tr></table>

            <table style="width:100%;border-collapse:collapse;margin-bottom:8px;"><tr><td style="background:#2c3e50;color:white;padding:5px 10px;font-weight:bold;font-size:10px;border:1px solid #000;text-align:left;">I. HEALTH CARE INSTITUTION (HCI) INFORMATION</td></tr>
            <tr><td style="padding:6px;border:1px solid #000;background:#fff;">
            <table style="width:100%;border-collapse:collapse;">
            <tr><td style="width:50%;padding:4px;border:1px solid #000;vertical-align:top;text-align:left;"><strong style="color:#666;">1. Name of HCI</strong></td><td style="width:50%;padding:4px;border:1px solid #000;vertical-align:top;text-align:left;"><strong style="color:#666;">2. Accreditation Number</strong></td></tr>
            <tr><td style="padding:4px;border:1px solid #000;vertical-align:top;text-align:left;"><span style="font-size:10px;color:#000;font-weight:600;">${val(data.hciName)}</span></td><td style="padding:4px;border:1px solid #000;vertical-align:top;text-align:left;"><span style="font-size:10px;color:#000;font-weight:600;">${val(data.accreditationNo)}</span></td></tr>
            <tr><td colspan="2" style="padding:4px;border:1px solid #000;vertical-align:top;text-align:left;"><strong style="color:#666;">3. Address of HCI</strong></td></tr>
            <tr><td colspan="2" style="padding:3px;border:1px solid #000;vertical-align:top;text-align:left;"><div style="font-size:10px;margin-bottom:2px;"><strong style="color:#666;">Bldg No.:</strong> <span style="color:#000;font-weight:600;">${val(data.hciBldgNo)}</span></div></td></tr>
            <tr><td colspan="2" style="padding:3px;border:1px solid #000;vertical-align:top;text-align:left;"><div style="font-size:10px;margin-bottom:2px;"><strong style="color:#666;">Street:</strong> <span style="color:#000;font-weight:600;">${val(data.hciStreet)}</span></div></td></tr>
            <tr><td colspan="2" style="padding:3px;border:1px solid #000;vertical-align:top;text-align:left;"><div style="font-size:10px;margin-bottom:2px;"><strong style="color:#666;">Barangay/City:</strong> <span style="color:#000;font-weight:600;">${val(data.hciBarangay)}</span></div></td></tr>
            <tr><td style="padding:3px;border:1px solid #000;vertical-align:top;text-align:left;"><div style="font-size:10px;"><strong style="color:#666;">Province:</strong> <span style="color:#000;font-weight:600;">${val(data.hciProvince)}</span></div></td><td style="padding:3px;border:1px solid #000;vertical-align:top;text-align:left;"><div style="font-size:10px;"><strong style="color:#666;">Zip Code:</strong> <span style="color:#000;font-weight:600;">${val(data.hciZipCode)}</span></div></td></tr>
            </table></td></tr></table>

            <table style="width:100%;border-collapse:collapse;margin-bottom:8px;"><tr><td style="background:#2c3e50;color:white;padding:5px 10px;font-weight:bold;font-size:10px;border:1px solid #000;text-align:left;">II. PATIENT'S DATA</td></tr>
            <tr><td style="padding:6px;border:1px solid #000;background:#fff;">
            <table style="width:100%;border-collapse:collapse;">
            <tr><td colspan="4" style="padding:4px;border:1px solid #000;vertical-align:top;text-align:left;"><strong style="color:#666;">1. Name of Patient:</strong></td></tr>
            <tr><td style="padding:3px;border:1px solid #000;vertical-align:top;width:40%;text-align:left;"><div style="font-size:10px;"><strong style="color:#666;">Last:</strong> <span style="color:#000;font-weight:600;">${val(data.patientLastName)}</span></div></td><td style="padding:3px;border:1px solid #000;vertical-align:top;width:30%;text-align:left;"><div style="font-size:10px;"><strong style="color:#666;">First:</strong> <span style="color:#000;font-weight:600;">${val(data.patientFirstName)}</span></div></td><td style="padding:3px;border:1px solid #000;vertical-align:top;width:30%;text-align:left;"><div style="font-size:10px;"><strong style="color:#666;">Middle:</strong> <span style="color:#000;font-weight:600;">${val(data.patientMiddleName)}</span></div></td></tr>
            <tr><td style="padding:4px;border:1px solid #000;vertical-align:top;text-align:left;"><strong style="color:#666;">2. PIN:</strong><br><span style="font-size:10px;color:#000;font-weight:600;">${val(data.patientPin)}</span></td><td style="padding:4px;border:1px solid #000;vertical-align:top;text-align:left;"><strong style="color:#666;">3. Age:</strong><br><span style="font-size:10px;color:#000;font-weight:600;">${val(data.patientAge)}</span></td><td colspan="2" style="padding:4px;border:1px solid #000;vertical-align:top;text-align:left;"><strong style="color:#666;">4. Sex:</strong> <span style="font-size:10px;color:#000;font-weight:600;">${val(data.patientSex)}</span></td></tr>
            <tr><td colspan="4" style="padding:6px;border:1px solid #000;vertical-align:top;background:#f9f9f9;text-align:left;"><strong style="color:#333;font-size:11px;">5. Chief Complaint:</strong><div style="margin-top:3px;min-height:50px;padding:6px;background:#fff;border:1px solid #ccc;border-radius:2px;"><span style="font-size:11px;color:#000;font-weight:600;line-height:1.5;">${val(data.chiefComplaint)}</span></div></td></tr>
            <tr><td colspan="4" style="padding:6px;border:1px solid #000;vertical-align:top;background:#f9f9f9;text-align:left;"><strong style="color:#333;font-size:11px;">6. Admitting Diagnosis:</strong><div style="margin-top:3px;min-height:50px;padding:6px;background:#fff;border:1px solid #ccc;border-radius:2px;"><span style="font-size:11px;color:#000;font-weight:600;line-height:1.5;">${val(data.admittingDiagnosis)}</span></div></td></tr>
            <tr><td colspan="4" style="padding:6px;border:1px solid #000;vertical-align:top;background:#f9f9f9;text-align:left;"><strong style="color:#333;font-size:11px;">7. Discharge Diagnosis:</strong><div style="margin-top:3px;min-height:50px;padding:6px;background:#fff;border:1px solid #ccc;border-radius:2px;"><span style="font-size:11px;color:#000;font-weight:600;line-height:1.5;">${val(data.dischargeDiagnosis)}</span></div></td></tr>
            <tr><td colspan="4" style="padding:4px;border:1px solid #000;vertical-align:top;text-align:left;"><strong style="color:#666;">8. Case Rate Code/s:</strong> <span style="font-size:10px;color:#000;font-weight:600;">a. 1st: ${val(data.firstCaseRateCode)} | b. 2nd: ${val(data.secondCaseRateCode)}</span></td></tr>
            <tr><td style="padding:4px;border:1px solid #000;vertical-align:top;text-align:left;"><strong style="color:#666;">9. Date Admitted:</strong><br><span style="font-size:10px;color:#000;font-weight:600;">${val(data.dateAdmitted)}</span></td><td style="padding:4px;border:1px solid #000;vertical-align:top;text-align:left;"><strong style="color:#666;">Time:</strong><br><span style="font-size:10px;color:#000;font-weight:600;">${val(data.timeAdmitted)} ${val(data.timeAdmittedAmPm)}</span></td><td style="padding:4px;border:1px solid #000;vertical-align:top;text-align:left;"><strong style="color:#666;">10. Date Discharged:</strong><br><span style="font-size:10px;color:#000;font-weight:600;">${val(data.dateDischarged)}</span></td><td style="padding:4px;border:1px solid #000;vertical-align:top;text-align:left;"><strong style="color:#666;">Time:</strong><br><span style="font-size:10px;color:#000;font-weight:600;">${val(data.timeDischarged)} ${val(data.timeDischargedAmPm)}</span></td></tr>
            </table></td></tr></table>

            <table style="width:100%;border-collapse:collapse;margin-bottom:8px;"><tr><td style="background:#2c3e50;color:white;padding:5px 10px;font-weight:bold;font-size:10px;border:1px solid #000;text-align:left;">III. REASON FOR ADMISSION</td></tr>
            <tr><td style="padding:6px;border:1px solid #000;background:#fff;">
            <table style="width:100%;border-collapse:collapse;">
            <tr><td colspan="2" style="padding:6px;border:1px solid #000;vertical-align:top;background:#f9f9f9;text-align:left;"><strong style="color:#333;font-size:11px;">1. History of Present Illness:</strong><div style="margin-top:3px;min-height:60px;padding:6px;background:#fff;border:1px solid #ccc;border-radius:2px;"><span style="font-size:11px;color:#000;font-weight:600;line-height:1.5;">${val(data.historyPresentIllness)}</span></div></td></tr>
            <tr><td colspan="2" style="padding:6px;border:1px solid #000;vertical-align:top;background:#f9f9f9;text-align:left;"><strong style="color:#333;font-size:11px;">2. Pertinent Past Medical History:</strong><div style="margin-top:3px;min-height:50px;padding:6px;background:#fff;border:1px solid #ccc;border-radius:2px;"><span style="font-size:11px;color:#000;font-weight:600;line-height:1.5;">${val(data.pertinentPastMedicalHistory)}</span></div></td></tr>
            <tr><td style="padding:4px;border:1px solid #000;vertical-align:top;width:50%;text-align:left;"><strong style="color:#666;">2.b. OB/GYN History:</strong><br><span style="font-size:10px;color:#000;font-weight:600;">G: ${val(data.obGravida)} P: ${val(data.obPara)} (${val(data.obDetails)}) LMP: ${val(data.obLmp)}</span></td>
            <td style="padding:4px;border:1px solid #000;vertical-align:top;width:50%;text-align:left;"><strong style="color:#666;">3. Pertinent Signs and Symptoms on Admission:</strong></td></tr>
            <tr><td colspan="2" style="padding:4px;border:1px solid #000;vertical-align:top;text-align:left;">${symptomGrid}</td></tr>
            <tr><td colspan="2" style="padding:4px;border:1px solid #000;vertical-align:top;text-align:left;"><strong style="color:#666;">4. Referred from another HCI:</strong> ${val(data.referredFromHci)} ${data.referredReason ? '<br><strong style="color:#666;">Reason:</strong> ' + data.referredReason.toUpperCase() : ''} ${data.originatingHci ? '<br><strong style="color:#666;">Originating HCI:</strong> ' + data.originatingHci.toUpperCase() : ''}</td></tr>
            </table></td></tr></table>

            <table style="width:100%;border-collapse:collapse;margin-bottom:8px;"><tr><td style="background:#2c3e50;color:white;padding:5px 10px;font-weight:bold;font-size:10px;border:1px solid #000;text-align:left;">IV. PHYSICAL EXAMINATION ON ADMISSION (Pertinent Findings per System)</td></tr>
            <tr><td style="padding:6px;border:1px solid #000;background:#fff;">
            <table style="width:100%;border-collapse:collapse;">
            <tr><td style="padding:4px;border:1px solid #000;vertical-align:top;width:30%;text-align:left;"><strong style="color:#666;">General Survey</strong><br><span style="font-size:10px;color:#000;font-weight:600;">${val(data.generalSurvey)} ${data.alteredSensoriumDetail ? '- ' + data.alteredSensoriumDetail.toUpperCase() : ''}</span></td>
            <td style="padding:4px;border:1px solid #000;vertical-align:top;width:70%;text-align:left;"><strong style="color:#666;">Vital Signs:</strong><br><span style="font-size:10px;color:#000;font-weight:600;">BP: ${val(data.vitalBp)} | HR: ${val(data.vitalHr)} | RR: ${val(data.vitalRr)} | Temp: ${val(data.vitalTemp)} | Wt: ${val(data.vitalWeight)} kg | Ht: ${val(data.vitalHeight)} cm</span></td></tr>
            <tr><td colspan="2" style="padding:4px;border:1px solid #000;vertical-align:top;text-align:left;"><strong style="color:#666;">HEENT:</strong></td></tr>
            <tr><td colspan="2" style="padding:4px;border:1px solid #000;vertical-align:top;text-align:left;">${heentGrid}</td></tr>
            </table></td></tr></table>

            <table style="width:100%;border-collapse:collapse;margin-bottom:8px;"><tr><td style="background:#2c3e50;color:white;padding:5px 10px;font-weight:bold;font-size:10px;border:1px solid #000;text-align:left;">V. PHYSICAL EXAMINATION (Pertinent Findings per System)</td></tr>
            <tr><td style="padding:6px;border:1px solid #000;background:#fff;">
            <table style="width:100%;border-collapse:collapse;">
            <tr><td style="padding:4px;border:1px solid #000;vertical-align:top;text-align:left;"><strong style="color:#666;">CHEST/LUNGS:</strong></td></tr>
            <tr><td style="padding:4px;border:1px solid #000;vertical-align:top;text-align:left;">${chestGrid}</td></tr>
            <tr><td style="padding:4px;border:1px solid #000;vertical-align:top;text-align:left;"><strong style="color:#666;">CVS:</strong></td></tr>
            <tr><td style="padding:4px;border:1px solid #000;vertical-align:top;text-align:left;">${cvsGrid}</td></tr>
            <tr><td style="padding:4px;border:1px solid #000;vertical-align:top;text-align:left;"><strong style="color:#666;">ABDOMEN:</strong></td></tr>
            <tr><td style="padding:4px;border:1px solid #000;vertical-align:top;text-align:left;">${abdomenGrid}</td></tr>
            <tr><td style="padding:4px;border:1px solid #000;vertical-align:top;text-align:left;"><strong style="color:#666;">GU (IE):</strong></td></tr>
            <tr><td style="padding:4px;border:1px solid #000;vertical-align:top;text-align:left;">${guGrid}</td></tr>
            <tr><td style="padding:4px;border:1px solid #000;vertical-align:top;text-align:left;"><strong style="color:#666;">SKIN/EXTREMITIES:</strong></td></tr>
            <tr><td style="padding:4px;border:1px solid #000;vertical-align:top;text-align:left;">${skinGrid}</td></tr>
            <tr><td style="padding:4px;border:1px solid #000;vertical-align:top;text-align:left;"><strong style="color:#666;">NEURO-EXAM:</strong></td></tr>
            <tr><td style="padding:4px;border:1px solid #000;vertical-align:top;text-align:left;">${neuroGrid}</td></tr>
            </table></td></tr></table>

            <table style="width:100%;border-collapse:collapse;margin-bottom:8px;"><tr><td style="padding:8px;border:1px solid #000;background:#fff3cd;text-align:left;font-style:italic;font-size:10px;line-height:1.4;"><strong>I CERTIFY THAT THE ABOVE INFORMATION GIVEN IN THIS FORM, INCLUDING ALL ATTACHMENTS, ARE TRUE AND CORRECT.</strong></td></tr></table>

            <table style="width:100%;border-collapse:collapse;margin-bottom:8px;"><tr><td style="background:#2c3e50;color:white;padding:5px 10px;font-weight:bold;font-size:10px;border:1px solid #000;text-align:left;">VI. COURSE IN THE WARD (Attach photocopy of laboratory/Imaging results)</td></tr>
            <tr><td style="padding:6px;border:1px solid #000;background:#fff;">
            <table style="width:100%;border-collapse:collapse;margin-bottom:5px;"><tr><td style="padding:4px;border:1px solid #000;vertical-align:top;width:50%;text-align:left;"><strong style="color:#666;">SURGICAL PROCEDURE/RVS CODE</strong></td><td style="padding:4px;border:1px solid #000;vertical-align:top;width:50%;text-align:left;"><strong style="color:#666;">Date</strong></td></tr>
            <tr><td style="padding:4px;border:1px solid #000;vertical-align:top;text-align:left;"><span style="font-size:10px;color:#000;font-weight:600;">${val(data.surgicalProcedure)} ${data.surgicalRvsCode ? '(' + data.surgicalRvsCode.toUpperCase() + ')' : ''}</span></td><td style="padding:4px;border:1px solid #000;vertical-align:top;text-align:left;"><table style="width:100%;border-collapse:collapse;font-size:10px;"><tr><td style="padding:2px;border:1px solid #000;text-align:left;">month</td><td style="padding:2px;border:1px solid #000;text-align:left;">day</td><td style="padding:2px;border:1px solid #000;text-align:left;">year</td></tr><tr><td style="padding:2px;border:1px solid #000;height:15px;"></td><td style="padding:2px;border:1px solid #000;height:15px;"></td><td style="padding:2px;border:1px solid #000;height:15px;"></td></tr></table></td></tr></table>
            <table style="width:100%;border-collapse:collapse;"><thead><tr style="background:#f0f0f0;"><th style="width:120px;padding:8px;border:1px solid #000;text-align:left;font-weight:bold;font-size:10px;border-bottom:2px solid #000;">Date</th><th style="padding:8px;border:1px solid #000;text-align:left;font-weight:bold;font-size:11px;color:#333;border-bottom:2px solid #000;">DOCTOR'S ORDER/ACTION</th></tr></thead><tbody>${courseRowsHtml}</tbody></table></td></tr></table>

            <table style="width:100%;border-collapse:collapse;margin-bottom:8px;"><tr><td style="background:#2c3e50;color:white;padding:5px 10px;font-weight:bold;font-size:10px;border:1px solid #000;text-align:left;">VII. DRUGS/MEDICINES</td></tr>
            <tr><td style="padding:6px;border:1px solid #000;background:#fff;"><table style="width:100%;border-collapse:collapse;"><thead><tr style="background:#f0f0f0;"><th style="width:33%;padding:5px;border:1px solid #000;text-align:left;font-weight:bold;font-size:9px;border-bottom:2px solid #000;">GENERIC NAME</th><th style="width:33%;padding:5px;border:1px solid #000;text-align:left;font-weight:bold;font-size:9px;border-bottom:2px solid #000;">QUANTITY/DOSAGE/ROUTE</th><th style="width:34%;padding:5px;border:1px solid #000;text-align:left;font-weight:bold;font-size:9px;border-bottom:2px solid #000;">TOTAL COST</th></tr></thead><tbody>${drugsRowsHtml}</tbody></table></td></tr></table>

            <table style="width:100%;border-collapse:collapse;margin-bottom:8px;"><tr><td style="background:#2c3e50;color:white;padding:5px 10px;font-weight:bold;font-size:10px;border:1px solid #000;text-align:left;">VIII. OUTCOME OF TREATMENT</td></tr>
            <tr><td style="padding:8px;border:1px solid #000;background:#fff;"><table style="width:100%;border-collapse:collapse;font-size:10px;"><tr><td style="padding:4px;border:1px solid #000;text-align:left;"><span style="display:inline-block;width:11px;height:11px;border:1px solid #444;vertical-align:middle;background:#fff;margin-right:3px;">&nbsp;</span> IMPROVED</td><td style="padding:4px;border:1px solid #000;text-align:left;"><span style="display:inline-block;width:11px;height:11px;border:1px solid #444;vertical-align:middle;background:#fff;margin-right:3px;">&nbsp;</span> RECOVERED</td><td style="padding:4px;border:1px solid #000;text-align:left;"><span style="display:inline-block;width:11px;height:11px;border:1px solid #444;vertical-align:middle;background:#fff;margin-right:3px;">&nbsp;</span> HAMA</td><td style="padding:4px;border:1px solid #000;text-align:left;"><span style="display:inline-block;width:11px;height:11px;border:1px solid #444;vertical-align:middle;background:#fff;margin-right:3px;">&nbsp;</span> EXPIRED</td><td style="padding:4px;border:1px solid #000;text-align:left;"><span style="display:inline-block;width:11px;height:11px;border:1px solid #444;vertical-align:middle;background:#fff;margin-right:3px;">&nbsp;</span> ABSCONDED</td><td style="padding:4px;border:1px solid #000;text-align:left;"><span style="display:inline-block;width:11px;height:11px;border:1px solid #444;vertical-align:middle;background:#fff;margin-right:3px;">&nbsp;</span> TRANSFERRED</td></tr><tr><td colspan="6" style="padding:4px;border:1px solid #000;text-align:left;"><strong>Specify reason:</strong> <span style="font-size:10px;">${val(data.outcome)}</span></td></tr></table></td></tr></table>

            <table style="width:100%;border-collapse:collapse;margin-bottom:8px;"><tr><td style="background:#2c3e50;color:white;padding:5px 10px;font-weight:bold;font-size:10px;border:1px solid #000;text-align:left;">IX. CERTIFICATION OF HEALTH CARE PROFESSIONAL</td></tr>
            <tr><td style="padding:6px;border:1px solid #000;background:#fff;"><table style="width:100%;border-collapse:collapse;font-size:10px;"><tr><td style="padding:6px;border:1px solid #000;vertical-align:top;text-align:left;"><strong style="color:#666;">Certification of Attending HCP:</strong></td></tr><tr><td style="padding:6px;border:1px solid #000;text-align:left;font-style:italic;min-height:30px;vertical-align:middle;line-height:1.4;">I certify that the above information given in this form, including all attachments, are true and correct.</td></tr><tr><td style="padding:0;border:1px solid #000;vertical-align:top;"><table style="width:100%;border-collapse:collapse;"><tr><td style="width:70%;padding:8px;border:1px solid #000;vertical-align:bottom;height:40px;text-align:left;"><div style="border-bottom:1px solid #000;padding-bottom:2px;margin-bottom:3px;min-height:18px;font-size:10px;">${val(data.attendingHcpName)}</div><div style="font-size:8px;color:#666;">Signature over Printed Name of Attending HCP</div></td><td style="width:30%;padding:8px;border:1px solid #000;vertical-align:bottom;height:40px;text-align:left;"><table style="width:100%;border-collapse:collapse;font-size:10px;"><tr><td style="padding:2px;border:1px solid #000;text-align:left;">month</td><td style="padding:2px;border:1px solid #000;text-align:left;">day</td><td style="padding:2px;border:1px solid #000;text-align:left;">year</td></tr><tr><td style="padding:2px;border:1px solid #000;height:15px;"></td><td style="padding:2px;border:1px solid #000;height:15px;"></td><td style="padding:2px;border:1px solid #000;height:15px;"></td></tr></table><div style="font-size:8px;color:#666;margin-top:2px;">Date Signed</div></td></tr></table></td></tr></table></td></tr></table>
        </div>`;
    }

    async function waitForCf4PrintToFinish() {
        if ('onafterprint' in window) {
            await new Promise(resolve => {
                let settled = false;
                const finish = () => {
                    if (settled) return;
                    settled = true;
                    window.removeEventListener('afterprint', finish);
                    clearTimeout(fallbackTimer);
                    resolve();
                };
                const fallbackTimer = window.setTimeout(finish, 2000);
                window.addEventListener('afterprint', finish, { once: true });
                window.print();
            });
            return;
        }
        window.print();
        await new Promise(resolve => window.setTimeout(resolve, 500));
    }

    if (printBtn) {
        printBtn.addEventListener('click', async () => {
            if (!printDiv) {
                window.print();
                return;
            }
            if (loadingSpinner) loadingSpinner.style.display = 'flex';
            const formPanel = document.querySelector('.form-panel');
            const actionsContainer = document.getElementById('action-buttons-container');
            const breadcrumb = document.querySelector('.breadcrumb');
            const sectionNav = document.querySelector('.section-nav');
            try {
                await prepareCf4PrintContent();
                printDiv.style.display = 'block';
                document.body.classList.add('print-document-mode');
                [formPanel, actionsContainer, breadcrumb, sectionNav].forEach(element => {
                    if (element) element.style.display = 'none';
                });
                await waitForCf4PrintToFinish();
            } finally {
                document.body.classList.remove('print-document-mode');
                printDiv.style.display = 'none';
                printDiv.innerHTML = '';
                [formPanel, actionsContainer, breadcrumb, sectionNav].forEach(element => {
                    if (element) element.style.display = '';
                });
                if (loadingSpinner) loadingSpinner.style.display = 'none';
            }
        });
    }

    if (previewPdfBtn) {
        previewPdfBtn.addEventListener('click', async () => {
            if (loadingSpinner) loadingSpinner.style.display = 'flex';
            try {
                const printDiv = document.getElementById('printDiv');
                await prepareCf4PrintContent();
                const pdfPageWidthPx = 794;
                printDiv.style.cssText = `display: block; width: ${pdfPageWidthPx}px; min-height: 1123px; height: auto; box-sizing: border-box; background-color: #ffffff; color: #000000; position: fixed; top: 0; left: 0; z-index: 9999; overflow: visible;`;
                await new Promise(resolve => setTimeout(resolve, 500));
                const loadScript = (src) => { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); };
                // Load local copies first (fully offline), then fall back to CDN if the local file is missing.
                const loadLocalOrCdn = async (localSrc, cdnSrc) => {
                    try { await loadScript(localSrc); }
                    catch (err) {
                        console.warn('Local library missing (' + localSrc + '), trying CDN fallback...', err);
                        try { await loadScript(cdnSrc); } catch (err2) { console.error('CDN fallback failed:', err2); }
                    }
                };
                await loadLocalOrCdn('js/lib/html2canvas.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
                await loadLocalOrCdn('js/lib/jspdf.umd.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
                const jsPDF = (window.jspdf && window.jspdf.jsPDF) ? window.jspdf.jsPDF : window.jsPDF;
                if (!jsPDF) throw new Error("jsPDF not found");
                const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
                setPdfFormMetadata(pdf, getFormData());
                let pdfGenerated = false;
                try {
                    await pdf.html(printDiv, {
                        callback: function (pdf) {
                            const data = getFormData();
                            const safeName = data.patientLastName ? data.patientLastName.replace(/[^a-z0-9\s-]/gi, '').trim().replace(/\s+/g, '_') : 'CF4';
                            const firstName = data.patientFirstName ? data.patientFirstName.replace(/[^a-z0-9\s-]/gi, '').trim().replace(/\s+/g, '_') : '';
                            const pdfFilename = firstName ? `${safeName}, ${firstName}_CF4_Form.pdf` : `${safeName}_CF4_Form.pdf`;
                            const pdfOutput = pdf.output('blob');
                            generatedPdfBlob = { blob: pdfOutput, filename: pdfFilename };
                            const pdfUrl = URL.createObjectURL(pdfOutput);
                            pdfPreviewFrame.src = pdfUrl;
                            pdfPreviewModal.style.display = 'flex';
                            pdfGenerated = true;
                        }, x: 10, y: 10, width: 190, windowWidth: printDiv.scrollWidth
                    });
                } catch (htmlError) { console.warn('HTML method failed, using fallback:', htmlError); }
                if (!pdfGenerated) {
                    const canvas = await html2canvas(printDiv, { scale: 2, logging: false, useCORS: true, allowTaint: true });
                    const imgData = canvas.toDataURL('image/png');
                    const pdfWidth = pdf.internal.pageSize.getWidth();
                    const pdfHeight = pdf.internal.pageSize.getHeight();
                    const imgHeight = canvas.height * pdfWidth / canvas.width;
                    let heightLeft = imgHeight; let position = 0;
                    pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight);
                    heightLeft -= pdfHeight;
                    while (heightLeft > 0) { position = heightLeft - imgHeight; pdf.addPage('a4', 'p'); pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight); heightLeft -= pdfHeight; }
                    const data = getFormData();
                    const safeName = data.patientLastName ? data.patientLastName.replace(/[^a-z0-9\s-]/gi, '').trim().replace(/\s+/g, '_') : 'CF4';
                    const firstName = data.patientFirstName ? data.patientFirstName.replace(/[^a-z0-9\s-]/gi, '').trim().replace(/\s+/g, '_') : '';
                    const pdfFilename = firstName ? `${safeName}, ${firstName}_CF4_Form.pdf` : `${safeName}_CF4_Form.pdf`;
                    const pdfOutput = pdf.output('blob');
                    generatedPdfBlob = { blob: pdfOutput, filename: pdfFilename };
                    const pdfUrl = URL.createObjectURL(pdfOutput);
                    pdfPreviewFrame.src = pdfUrl;
                    pdfPreviewModal.style.display = 'flex';
                }
                printDiv.style.display = 'none';
                printDiv.innerHTML = '';
                if (loadingSpinner) loadingSpinner.style.display = 'none';
            } catch (err) {
                console.error("PDF Generation Error:", err);
                if (loadingSpinner) loadingSpinner.style.display = 'none';
                printDiv.style.display = 'none';
                printDiv.innerHTML = '';
                showCustomAlert('ERROR GENERATING PDF. PLEASE TRY AGAIN.', 'ERROR');
            }
        });
    }

    if (closePdfPreviewBtn) { closePdfPreviewBtn.addEventListener('click', () => { pdfPreviewModal.style.display = 'none'; if (pdfPreviewFrame.src) URL.revokeObjectURL(pdfPreviewFrame.src); generatedPdfBlob = null; }); }
    if (cancelPdfBtn) { cancelPdfBtn.addEventListener('click', () => { pdfPreviewModal.style.display = 'none'; if (pdfPreviewFrame.src) URL.revokeObjectURL(pdfPreviewFrame.src); generatedPdfBlob = null; }); }
    if (savePdfFromPreviewBtn) {
        savePdfFromPreviewBtn.addEventListener('click', () => {
            if (!generatedPdfBlob) return;
            const url = URL.createObjectURL(generatedPdfBlob.blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = generatedPdfBlob.filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            window.PatientRecords?.recordSave('cf4', getFormData(), { format: 'PDF', fileName: generatedPdfBlob.filename });
            pdfPreviewModal.style.display = 'none';
            if (pdfPreviewFrame.src) URL.revokeObjectURL(pdfPreviewFrame.src);
            generatedPdfBlob = null;
            showCustomAlert('PDF SAVED SUCCESSFULLY!', 'SUCCESS');
        });
    }

    if (savePdfBtn) {
        savePdfBtn.addEventListener('click', async () => {
            if (loadingSpinner) loadingSpinner.style.display = 'flex';
            try {
                await prepareCf4PrintContent();
                const pdfPageWidthPx = 794;
                printDiv.style.cssText = `display: block; width: ${pdfPageWidthPx}px; min-height: 1123px; height: auto; box-sizing: border-box; background-color: #ffffff; color: #000000; position: fixed; top: 0; left: 0; z-index: 9999; overflow: visible;`;
                await new Promise(resolve => setTimeout(resolve, 500));
                const loadScript = (src) => { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); };
                // Load local copies first (fully offline), then fall back to CDN if the local file is missing.
                const loadLocalOrCdn = async (localSrc, cdnSrc) => {
                    try { await loadScript(localSrc); }
                    catch (err) {
                        console.warn('Local library missing (' + localSrc + '), trying CDN fallback...', err);
                        try { await loadScript(cdnSrc); } catch (err2) { console.error('CDN fallback failed:', err2); }
                    }
                };
                await loadLocalOrCdn('js/lib/html2canvas.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
                await loadLocalOrCdn('js/lib/jspdf.umd.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
                const jsPDF = (window.jspdf && window.jspdf.jsPDF) ? window.jspdf.jsPDF : window.jsPDF;
                if (!jsPDF) throw new Error("jsPDF not found");
                const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
                setPdfFormMetadata(pdf, getFormData());
                let pdfSaved = false;
                let pdfFilename = '';
                try {
                    await pdf.html(printDiv, {
                        callback: function (pdf) {
                            const data = getFormData();
                            const safeName = data.patientLastName ? data.patientLastName.replace(/[^a-z0-9\s-]/gi, '').trim().replace(/\s+/g, '_') : 'CF4';
                            const firstName = data.patientFirstName ? data.patientFirstName.replace(/[^a-z0-9\s-]/gi, '').trim().replace(/\s+/g, '_') : '';
                            pdfFilename = firstName ? `${safeName}, ${firstName}_CF4_Form.pdf` : `${safeName}_CF4_Form.pdf`;
                            pdf.save(pdfFilename);
                            pdfSaved = true;
                        }, x: 10, y: 10, width: 190, windowWidth: printDiv.scrollWidth
                    });
                } catch (htmlError) { console.warn('HTML method failed, using fallback:', htmlError); }
                if (!pdfSaved) {
                    const canvas = await html2canvas(printDiv, { scale: 2, logging: false, useCORS: true, allowTaint: true });
                    const imgData = canvas.toDataURL('image/png');
                    const pdfWidth = pdf.internal.pageSize.getWidth();
                    const pdfHeight = pdf.internal.pageSize.getHeight();
                    const imgHeight = canvas.height * pdfWidth / canvas.width;
                    let heightLeft = imgHeight; let position = 0;
                    pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight);
                    heightLeft -= pdfHeight;
                    while (heightLeft > 0) { position = heightLeft - imgHeight; pdf.addPage('a4', 'p'); pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight); heightLeft -= pdfHeight; }
                    const data = getFormData();
                    const safeName = data.patientLastName ? data.patientLastName.replace(/[^a-z0-9\s-]/gi, '').trim().replace(/\s+/g, '_') : 'CF4';
                    const firstName = data.patientFirstName ? data.patientFirstName.replace(/[^a-z0-9\s-]/gi, '').trim().replace(/\s+/g, '_') : '';
                    pdfFilename = firstName ? `${safeName}, ${firstName}_CF4_Form.pdf` : `${safeName}_CF4_Form.pdf`;
                    pdf.save(pdfFilename);
                }
                
                printDiv.style.display = 'none';
                printDiv.innerHTML = '';
                printDiv.style.cssText = 'display:none;';
                if (loadingSpinner) loadingSpinner.style.display = 'none';
                window.PatientRecords?.recordSave('cf4', getFormData(), { format: 'PDF', fileName: pdfFilename });
                showCustomAlert('PDF SAVED SUCCESSFULLY!', 'SUCCESS');
            } catch (err) {
                console.error("PDF Generation Error:", err);
                if (loadingSpinner) loadingSpinner.style.display = 'none';
                printDiv.style.display = 'none';
                printDiv.innerHTML = '';
                printDiv.style.cssText = 'display:none;';
                showCustomAlert('ERROR GENERATING PDF. PLEASE TRY AGAIN.', 'ERROR');
            }
        });
    }

    // Save to Edit button - Save form data as JSON file
    const saveDataBtn = document.getElementById('saveDataBtn');
    if (saveDataBtn) {
        saveDataBtn.addEventListener('click', () => {
            try {
                const formData = getFormData();
                const dataStr = JSON.stringify(formData, null, 2);
                const safeName = formData.patientLastName ? formData.patientLastName.replace(/[^a-z0-9\s-]/gi, '').trim().replace(/\s+/g, '_') : 'CF4';
                const firstName = formData.patientFirstName ? formData.patientFirstName.replace(/[^a-z0-9\s-]/gi, '').trim().replace(/\s+/g, '_') : '';
                const filename = firstName ? `${safeName}, ${firstName}_CF4_Data.json` : `${safeName}_CF4_Data.json`;
                
                if (window.EntDrafts && typeof window.EntDrafts.saveAndOpen === 'function') {
                    // v28: Save Draft stores the draft on THIS DEVICE (localStorage),
                    // flashes "✓ Saved" on the button and shows a small "Draft saved"
                    // popup with Open it / All drafts / .json download actions.
                    window.EntDrafts.saveAndOpen('cf4', formData, filename);
                } else {
                    // Fallback: previous behavior - download the .json right away.
                    const blob = new Blob([dataStr], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = filename;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    URL.revokeObjectURL(url);
                }
                window.PatientRecords?.recordSave('cf4', formData, { format: 'Draft', fileName: filename });
                
                // v26: success feedback now appears inside the Saved Drafts popup.
            } catch (err) {
                console.error('Error saving data:', err);
                showCustomAlert('❌ ERROR SAVING DATA\n\n' + err.message, 'ERROR');
            }
        });
    }

    const copyTextBtn = document.getElementById('copyTextBtn');
    if (copyTextBtn) {
        copyTextBtn.addEventListener('click', () => {
            const data = getFormData();
            const val = (v) => v ? v.toUpperCase() : '';
            const checkedItems = (arr) => arr && arr.length > 0 ? arr.join(', ').toUpperCase() : 'NONE';
            let courseText = '';
            if (data.courseDate && data.courseDate.length > 0) {
                for (let i = 0; i < data.courseDate.length; i++) {
                    if (data.courseDate[i] || (data.courseOrder && data.courseOrder[i])) { courseText += `📅 ${val(data.courseDate[i])}\n   📝 ${val(data.courseOrder && data.courseOrder[i])}\n\n`; }
                }
            }
            let drugsText = '';
            if (data.drugGenericName && data.drugGenericName.length > 0) {
                for (let i = 0; i < data.drugGenericName.length; i++) {
                    if (data.drugGenericName[i] || (data.drugQuantity && data.drugQuantity[i])) { drugsText += `💊 ${val(data.drugGenericName[i])}\n   📦 ${val(data.drugQuantity && data.drugQuantity[i])} | 💰 ${val(data.drugTotalCost && data.drugTotalCost[i])}\n\n`; }
                }
            }
            const textContent = `╔═══════════════════════════════════════════════════════════╗\n║           CF4 FORM - CLAIM FORM FOR PHILHEALTH              ║\n╚═══════════════════════════════════════════════════════════╝\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🏥 I. HEALTH CARE INSTITUTION (HCI) INFORMATION\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n📋 Name of HCI: ${val(data.hciName)}\n🔖 Accreditation No: ${val(data.accreditationNo)}\n📍 Address: ${val(data.hciBldgNo)}, ${val(data.hciStreet)}, ${val(data.hciBarangay)}, ${val(data.hciProvince)}, ${val(data.hciZipCode)}\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n👤 II. PATIENT'S DATA\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n👤 Name: ${val(data.patientLastName)}, ${val(data.patientFirstName)} ${val(data.patientMiddleName)}\n🆔 PIN: ${val(data.patientPin)}\n🎂 Age: ${val(data.patientAge)}\n⚧ Sex: ${val(data.patientSex)}\n🩺 Chief Complaint: ${val(data.chiefComplaint)}\n🔍 Admitting DX: ${val(data.admittingDiagnosis)}\n🏥 Discharge DX: ${val(data.dischargeDiagnosis)}\n💳 1st Case Rate: ${val(data.firstCaseRateCode)}\n💳 2nd Case Rate: ${val(data.secondCaseRateCode)}\n📅 Date Admitted: ${val(data.dateAdmitted)} ${val(data.timeAdmitted)} ${val(data.timeAdmittedAmPm)}\n📅 Date Discharged: ${val(data.dateDischarged)} ${val(data.timeDischarged)} ${val(data.timeDischargedAmPm)}\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n📋 III. REASON FOR ADMISSION\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n📝 History of Present Illness:\n   ${val(data.historyPresentIllness)}\n\n🏥 Past Medical History:\n   ${val(data.pertinentPastMedicalHistory)}\n\n🤰 OB/GYN History: G: ${val(data.obGravida)} P: ${val(data.obPara)} (${val(data.obDetails)}) LMP: ${val(data.obLmp)}\n\n⚠️ Signs & Symptoms: ${checkedItems(data.symptom)}${data.symptomOthers ? '\n   📌 Others: ' + data.symptomOthers.toUpperCase() : ''}${data.painSite ? '\n   📍 Pain Site: ' + data.painSite.toUpperCase() : ''}\n\n🏥 Referred from HCI: ${val(data.referredFromHci)} ${data.referredReason ? '\n   💬 Reason: ' + data.referredReason.toUpperCase() : ''} ${data.originatingHci ? '\n   🏨 Originating HCI: ' + data.originatingHci.toUpperCase() : ''}\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🩺 IV. PHYSICAL EXAMINATION ON ADMISSION\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n👁️ General Survey: ${val(data.generalSurvey)} ${data.alteredSensoriumDetail ? '\n   📝 Detail: ' + data.alteredSensoriumDetail.toUpperCase() : ''}\n\n💓 Vital Signs: BP: ${val(data.vitalBp)} | HR: ${val(data.vitalHr)} | RR: ${val(data.vitalRr)} | Temp: ${val(data.vitalTemp)} | Wt: ${val(data.vitalWeight)} kg | Ht: ${val(data.vitalHeight)} cm\n\n👁️ HEENT: ${checkedItems(data.heent)}${data.heentOthers ? '\n   📌 Others: ' + data.heentOthers.toUpperCase() : ''}\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🩺 V. PHYSICAL EXAMINATION (CONTINUED)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🫁 CHEST/LUNGS: ${checkedItems(data.chestLungs)}${data.chestLungsOthers ? '\n   📌 Others: ' + data.chestLungsOthers.toUpperCase() : ''}\n\n❤️ CVS: ${checkedItems(data.cvs)}${data.cvsOthers ? '\n   📌 Others: ' + data.cvsOthers.toUpperCase() : ''}\n\n🫃 ABDOMEN: ${checkedItems(data.abdomen)}${data.abdomenOthers ? '\n   📌 Others: ' + data.abdomenOthers.toUpperCase() : ''}\n\n🚻 GU (IE): ${checkedItems(data.gu)}${data.guOthers ? '\n   📌 Others: ' + data.guOthers.toUpperCase() : ''}\n\n🦶 SKIN/EXTREMITIES: ${checkedItems(data.skinExtremities)}${data.skinExtremitiesOthers ? '\n   📌 Others: ' + data.skinExtremitiesOthers.toUpperCase() : ''}\n\n🧠 NEURO-EXAM: ${checkedItems(data.neuroExam)}${data.neuroExamOthers ? '\n   📌 Others: ' + data.neuroExamOthers.toUpperCase() : ''}\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n📋 VI. COURSE IN THE WARD\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🔪 Surgical Procedure: ${val(data.surgicalProcedure)} ${data.surgicalRvsCode ? '\n   💻 RVS Code: ' + data.surgicalRvsCode.toUpperCase() : ''}\n\n📋 Doctor's Orders:\n${courseText || '   ❌ NO ENTRIES'}\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n💊 VII. DRUGS/MEDICINES\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n${drugsText || '   ❌ NO ENTRIES'}\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n✅ VIII. OUTCOME OF TREATMENT\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n📊 Outcome: ${val(data.outcome)}\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n✍️ IX. CERTIFICATION OF HEALTH CARE PROFESSIONAL\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n📝 Signature: ${val(data.attendingHcpName)}\n📅 Date Signed: ${val(data.dateSigned)}\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
            navigator.clipboard.writeText(textContent).then(() => { showCustomAlert('✅ TEXT COPIED TO CLIPBOARD!\n\nYou can now paste it anywhere.', 'COPIED!'); }).catch(() => {
                const textarea = document.createElement('textarea');
                textarea.value = textContent;
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
                showCustomAlert('✅ TEXT COPIED TO CLIPBOARD!\n\nYou can now paste it anywhere.', 'COPIED!');
            });
        });
    }

    window.copySection = function(sectionId) {
        const section = document.getElementById(sectionId);
        if (!section) return;
        const sectionHeader = section.previousElementSibling;
        const sectionTitle = sectionHeader ? sectionHeader.textContent.replace('📋 COPY', '').trim() : sectionId;
        const sectionData = getFormData();
        const val = (v) => v ? v.toUpperCase() : '';
        const checkedItems = (arr) => arr && arr.length > 0 ? arr.join(', ').toUpperCase() : 'NONE';
        let sectionText = '';
        switch(sectionId) {
            case 'section1': sectionText = `I. HEALTH CARE INSTITUTION (HCI) INFORMATION\nNAME OF HCI: ${val(sectionData.hciName)}\nACCREDITATION NO: ${val(sectionData.accreditationNo)}\nADDRESS: ${val(sectionData.hciBldgNo)}, ${val(sectionData.hciStreet)}, ${val(sectionData.hciBarangay)}, ${val(sectionData.hciProvince)}, ${val(sectionData.hciZipCode)}`; break;
            case 'section2': sectionText = `II. PATIENT'S DATA\nNAME: ${val(sectionData.patientLastName)}, ${val(sectionData.patientFirstName)} ${val(sectionData.patientMiddleName)}\nPIN: ${val(sectionData.patientPin)}\nAGE: ${val(sectionData.patientAge)}\nSEX: ${val(sectionData.patientSex)}\nCHIEF COMPLAINT: ${val(sectionData.chiefComplaint)}\nADMITTING DX: ${val(sectionData.admittingDiagnosis)}\nDISCHARGE DX: ${val(sectionData.dischargeDiagnosis)}\n1ST CASE RATE: ${val(sectionData.firstCaseRateCode)}\n2ND CASE RATE: ${val(sectionData.secondCaseRateCode)}\nDATE ADMITTED: ${val(sectionData.dateAdmitted)} ${val(sectionData.timeAdmitted)} ${val(sectionData.timeAdmittedAmPm)}\nDATE DISCHARGED: ${val(sectionData.dateDischarged)} ${val(sectionData.timeDischarged)} ${val(sectionData.timeDischargedAmPm)}`; break;
            case 'section3': sectionText = `III. REASON FOR ADMISSION\nHISTORY OF PRESENT ILLNESS: ${val(sectionData.historyPresentIllness)}\nPAST MEDICAL HISTORY: ${val(sectionData.pertinentPastMedicalHistory)}\nOB/GYN HISTORY: G: ${val(sectionData.obGravida)} P: ${val(sectionData.obPara)} (${val(sectionData.obDetails)}) LMP: ${val(sectionData.obLmp)}\nSIGNS & SYMPTOMS: ${checkedItems(sectionData.symptom)}${sectionData.symptomOthers ? ' - ' + sectionData.symptomOthers.toUpperCase() : ''}${sectionData.painSite ? ' (SITE: ' + sectionData.painSite.toUpperCase() + ')' : ''}\nREFERRED FROM HCI: ${val(sectionData.referredFromHci)} ${sectionData.referredReason ? '- ' + sectionData.referredReason.toUpperCase() : ''} ${sectionData.originatingHci ? '(' + sectionData.originatingHci.toUpperCase() + ')' : ''}`; break;
            case 'section4': sectionText = `IV. PHYSICAL EXAMINATION ON ADMISSION\nGENERAL SURVEY: ${val(sectionData.generalSurvey)} ${sectionData.alteredSensoriumDetail ? '- ' + sectionData.alteredSensoriumDetail.toUpperCase() : ''}\nVITAL SIGNS: BP: ${val(sectionData.vitalBp)} | HR: ${val(sectionData.vitalHr)} | RR: ${val(sectionData.vitalRr)} | TEMP: ${val(sectionData.vitalTemp)} | WT: ${val(sectionData.vitalWeight)} KG | HT: ${val(sectionData.vitalHeight)} CM\nHEENT: ${checkedItems(sectionData.heent)}${sectionData.heentOthers ? ' - ' + sectionData.heentOthers.toUpperCase() : ''}`; break;
            case 'section5': sectionText = `V. PHYSICAL EXAMINATION (CONTINUED)\nCHEST/LUNGS: ${checkedItems(sectionData.chestLungs)}${sectionData.chestLungsOthers ? ' - ' + sectionData.chestLungsOthers.toUpperCase() : ''}\nCVS: ${checkedItems(sectionData.cvs)}${sectionData.cvsOthers ? ' - ' + sectionData.cvsOthers.toUpperCase() : ''}\nABDOMEN: ${checkedItems(sectionData.abdomen)}${sectionData.abdomenOthers ? ' - ' + sectionData.abdomenOthers.toUpperCase() : ''}\nGU (IE): ${checkedItems(sectionData.gu)}${sectionData.guOthers ? ' - ' + sectionData.guOthers.toUpperCase() : ''}\nSKIN/EXTREMITIES: ${checkedItems(sectionData.skinExtremities)}${sectionData.skinExtremitiesOthers ? ' - ' + sectionData.skinExtremitiesOthers.toUpperCase() : ''}\nNEURO-EXAM: ${checkedItems(sectionData.neuroExam)}${sectionData.neuroExamOthers ? ' - ' + sectionData.neuroExamOthers.toUpperCase() : ''}`; break;
            case 'section6': let courseText = ''; if (sectionData.courseDate && sectionData.courseDate.length > 0) { for (let i = 0; i < sectionData.courseDate.length; i++) { if (sectionData.courseDate[i] || (sectionData.courseOrder && sectionData.courseOrder[i])) { courseText += `${val(sectionData.courseDate[i])} - ${val(sectionData.courseOrder && sectionData.courseOrder[i])}\n`; } } } sectionText = `VI. COURSE IN THE WARD\nSURGICAL PROCEDURE/RVS CODE: ${val(sectionData.surgicalProcedure)} ${sectionData.surgicalRvsCode ? '(' + sectionData.surgicalRvsCode.toUpperCase() + ')' : ''}\nDOCTOR'S ORDERS:\n${courseText || 'NO ENTRIES'}`; break;
            case 'section7': let drugsText = ''; if (sectionData.drugGenericName && sectionData.drugGenericName.length > 0) { for (let i = 0; i < sectionData.drugGenericName.length; i++) { if (sectionData.drugGenericName[i] || (sectionData.drugQuantity && sectionData.drugQuantity[i])) { drugsText += `${val(sectionData.drugGenericName[i])} | ${val(sectionData.drugQuantity && sectionData.drugQuantity[i])} | ${val(sectionData.drugTotalCost && sectionData.drugTotalCost[i])}\n`; } } } sectionText = `VII. DRUGS/MEDICINES\n${drugsText || 'NO ENTRIES'}`; break;
            case 'section8': sectionText = `VIII. OUTCOME OF TREATMENT\n${val(sectionData.outcome)}`; break;
            case 'section9': sectionText = `IX. CERTIFICATION OF HEALTH CARE PROFESSIONAL\nSIGNATURE: ${val(sectionData.attendingHcpName)}\nDATE SIGNED: ${val(sectionData.dateSigned)}`; break;
            default: sectionText = section.innerText || section.textContent || '';
        }
        navigator.clipboard.writeText(sectionText).then(() => { showCustomAlert(`✅ ${sectionTitle.toUpperCase()} COPIED TO CLIPBOARD!`, 'COPIED!'); }).catch(() => {
            const textarea = document.createElement('textarea');
            textarea.value = sectionText;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            showCustomAlert(`✅ ${sectionTitle.toUpperCase()} COPIED TO CLIPBOARD!`, 'COPIED!');
        });
    };

    // Sticky header collapse on scroll - hide logos/title, show only buttons
    const reportHeader = document.querySelector('.report-header');
    if (reportHeader) {
        function handleHeaderScroll() {
            if (window.scrollY > 10) {
                reportHeader.classList.add('header-scrolled');
            } else {
                reportHeader.classList.remove('header-scrolled');
            }
        }
        window.addEventListener('scroll', handleHeaderScroll, { passive: true });
        handleHeaderScroll(); // Initial check
    }

    // ===================================================================================
    // SECTION NAVIGATION - Smooth scroll to sections
    // ===================================================================================
    const sectionNavBtns = document.querySelectorAll('.section-nav-btn');
    if (sectionNavBtns.length > 0) {
        sectionNavBtns.forEach(btn => {
            btn.addEventListener('click', function() {
                const targetId = this.getAttribute('data-target');
                const targetEl = document.getElementById(targetId);
                if (targetEl) {
                    // Remove active from all
                    sectionNavBtns.forEach(b => b.classList.remove('active'));
                    // Add active to clicked
                    this.classList.add('active');
                    
                    // Smooth scroll to section
                    targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    
                    // Highlight the section briefly
                    targetEl.style.transition = 'box-shadow 0.3s ease';
                    targetEl.style.boxShadow = '0 0 0 4px var(--primary-color), 0 4px 15px rgba(14, 165, 233, 0.3)';
                    setTimeout(() => {
                        targetEl.style.boxShadow = '';
                    }, 2000);
                }
            });
        });

        // Track scroll position to highlight active section
        const sections = document.querySelectorAll('.cf4-fieldset[id]');
        window.addEventListener('scroll', () => {
            let current = '';
            sections.forEach(section => {
                const sectionTop = section.offsetTop - 100;
                if (window.scrollY >= sectionTop) {
                    current = section.getAttribute('id');
                }
            });
            if (current) {
                sectionNavBtns.forEach(btn => {
                    btn.classList.toggle('active', btn.getAttribute('data-target') === current);
                });
            }
        }, { passive: true });
    }

    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('sw.js').then(reg => { console.log('Service worker registered successfully.'); }).catch(err => console.error('Service worker registration failed:', err));
        });
    }

    // Expose a small bridge so the shared database module (dbRecords.js) can
    // read the current CF4 payload and restore one pulled from Supabase.
    window.EntFormBridge = {
        reportType: 'cf4',
        getData: () => getFormData(),
        restore: (data) => {
            resetCf4FormToBlank();
            restoreFormDataFromJSON(data);
        },
        alert: showCustomAlert
    };
});
