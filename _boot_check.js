/* Dev-only integration harness (not loaded by any page).
   Runs function/admin.js against a stub DOM seeded from the real admin.html
   ids plus fake EntAuth / EntSupabase layers, then boots the console and
   drives every control.

       node _boot_check.js                  -> SQL script applied (RPC path)
       $env:NO_RPC='1'; node _boot_check.js -> RPC missing, REST paging path
*/
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const dir = __dirname;
const html = fs.readFileSync(path.join(dir, 'admin.html'), 'utf8');
const src = fs.readFileSync(path.join(dir, 'function', 'admin.js'), 'utf8');

/* ------------------------------ fake DOM ------------------------------- */
function classList(node) {
    const set = new Set();
    return {
        add: function (c) { set.add(c); },
        remove: function (c) { set.delete(c); },
        contains: function (c) { return set.has(c); },
        toggle: function (c, on) {
            if (on === undefined) { if (set.has(c)) set.delete(c); else set.add(c); }
            else if (on) set.add(c); else set.delete(c);
            return set.has(c);
        },
        _set: set
    };
}
function el(id, tag) {
    const node = {
        id: id || '', tagName: (tag || 'div').toUpperCase(), value: '', checked: true,
        textContent: '', disabled: false, style: {}, dataset: {},
        options: [], children: [], listeners: {},
        addEventListener: function (t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); },
        removeEventListener: function () { },
        appendChild: function (child) {
            this.children.push(child);
            if (child.id) registry.set(child.id, child);
            if (child.tagName === 'OPTION') this.options.push(child);
            return child;
        },
        remove: function () { }, focus: function () { }, click: function () { },
        closest: function () { return null; },
        querySelectorAll: function () { return []; },
        querySelector: function () { return null; },
        insertAdjacentHTML: function (_pos, markup) { node.innerHTML += markup; },
        getAttribute: function () { return null; },
        setAttribute: function () { }
    };
    // innerHTML assignment registers any id="..." it contains, the way a
    // real DOM would after parsing the markup.
    let htmlValue = '';
    Object.defineProperty(node, 'innerHTML', {
        get: function () { return htmlValue; },
        set: function (v) {
            htmlValue = String(v);
            for (const m of String(v).matchAll(/id="([A-Za-z0-9_]+)"/g)) {
                if (!registry.has(m[1])) registry.set(m[1], el(m[1]));
            }
        }
    });
    node.classList = classList(node);
    return node;
}
const registry = new Map();
for (const m of html.matchAll(/id="([A-Za-z0-9_:-]+)"/g)) registry.set(m[1], el(m[1]));
['growthRange'].forEach(function (id) { if (registry.get(id)) registry.get(id).value = '90'; });
['clinicFilter', 'activityUser', 'activityPeriod', 'activityFilter', 'roleFilter',
    'activitySearch', 'userSearch'].forEach(function (id) {
        if (registry.get(id)) registry.get(id).value = '';
    });

const tabs = [...html.matchAll(/data-panel="([a-z]+)"/g)].map(function (m) {
    const b = el('', 'button'); b.dataset.panel = m[1]; return b;
});
const modeButtons = [...html.matchAll(/data-mode="([a-z]+)"/g)].map(function (m) {
    const b = el('', 'button'); b.dataset.mode = m[1]; return b;
});
if (registry.get('growthMode')) {
    registry.get('growthMode').querySelectorAll = function () { return modeButtons; };
}

const document = {
    readyState: 'loading', hidden: false, body: el('ent-body', 'body'),
    getElementById: function (id) { return registry.get(id) || null; },
    querySelectorAll: function (sel) {
        if (sel.indexOf('#adminTabs') === 0) return tabs;
        if (sel.indexOf('.ent-admin-panel') === 0) {
            return [...html.matchAll(/id="panel-([a-z]+)"/g)]
                .map(function (m) { return registry.get('panel-' + m[1]); });
        }
        if (sel.indexOf('#growthMode') === 0) return modeButtons;
        return [];
    },
    createElement: function (tag) { return el('', tag); },
    addEventListener: function () { },
    documentElement: el('html')
};
const store = {};
const localStorage = {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem: function (k, v) { store[k] = String(v); },
    removeItem: function (k) { delete store[k]; }
};
const navigator = { onLine: true, userAgent: 'node-harness' };
const pending = [];
const intervals = [];
const winListeners = {};
const window = {
    location: { replace: function (url) { throw new Error('redirected to ' + url); } },
    addEventListener: function (t, fn) { (winListeners[t] = winListeners[t] || []).push(fn); },
    dispatchEvent: function () { },
    localStorage: localStorage, navigator: navigator
};

/* --------------------------- fake data layer --------------------------- */
function iso(daysAgo, hour, minute) {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    d.setHours(hour === undefined ? 9 : hour, minute === undefined ? 5 : minute, 0, 0);
    return d.toISOString();
}
const users = [
    { id: 'u1', username: 'ana.admin', full_name: 'Dr. Ana Santos', role: 'admin', is_active: true, last_login_at: iso(0, 8) },
    { id: 'u2', username: 'juan.delacruz', full_name: 'Dr. Juan Cruz', role: 'doctor', is_active: true, last_login_at: iso(1, 10) },
    { id: 'u3', username: 'rosa.secretaria', full_name: 'Rosa Ruiz', role: 'secretary', is_active: true, assigned_doctor_id: 'u2', last_login_at: iso(2, 11) },
    { id: 'u4', username: 'old.staff', full_name: 'Old Staff', role: 'secretary', is_active: false }
];
const records = [];
for (let day = 0; day < 40; day++) {
    const perDay = (day % 7 === 0) ? 2 : 6;
    for (let i = 0; i < perDay; i++) {
        records.push({
            clinic_id: i % 3 === 0 ? 'main_clinic' : 'south_clinic',
            doctor_id: i % 2 ? 'juan.delacruz' : '',
            created_by: i % 2 ? 'juan.delacruz' : 'rosa.secretaria',
            report_type: i % 4 === 0 ? 'cf4' : 'endoscopy',
            created_at: iso(day, 8 + (i % 9), 10 + i),
            metadata: { note: 'x'.repeat(120) }
        });
    }
}
const activityLogs = [];
records.slice(0, 60).forEach(function (r, i) {
    activityLogs.push({ created_at: r.created_at, username: r.created_by, role: 'secretary', clinic_id: r.clinic_id, action: 'SAVE_RECORD', detail: 'Saved record ' + i });
});
for (let h = 6; h < 20; h += 2) {
    activityLogs.push({ created_at: iso(0, h, 15), username: 'ana.admin', role: 'admin', clinic_id: 'main_clinic', action: 'LOGIN', detail: 'Signed in' });
}
activityLogs.sort(function (a, b) { return a.created_at < b.created_at ? 1 : -1; });

const calls = [];
const audit = [];
const NO_RPC = !!process.env.NO_RPC;   // scenario: supabase_admin_insights.sql never applied
function apiRequest(endpoint, options) {
    calls.push(String(endpoint).split('?')[0]);
    audit.push(((options && options.method) || 'GET') + ' ' + String(endpoint).slice(0, 60));
    if (NO_RPC && String(endpoint).indexOf('rpc/') === 0) {
        return Promise.reject(new Error('Supabase API error (404): Could not find the function'));
    }
    if (String(endpoint).indexOf('rpc/admin_record_activity') === 0) {
        const agg = new Map();
        records.forEach(function (r) {
            const day = r.created_at.slice(0, 10);
            const key = [r.clinic_id, r.doctor_id, r.created_by, r.report_type, day].join('|');
            if (agg.has(key)) agg.get(key).n += 1;
            else agg.set(key, { clinic_id: r.clinic_id, doctor_id: r.doctor_id, created_by: r.created_by, report_type: r.report_type, day: day, n: 1 });
        });
        return Promise.resolve(Array.from(agg.values()));
    }
    if (String(endpoint).indexOf('rpc/admin_db_usage') === 0) {
        return Promise.resolve({
            exact: true, db_bytes: 12.4 * 1024 * 1024, app_bytes: 3.1 * 1024 * 1024,
            app_rows: records.length, avg_row_bytes: 2400, storage_bytes: 5.2 * 1024 * 1024,
            storage_files: 14, mau: 41, auth_users: 52, tables: [
                { table: 'patient_records', rows: records.length, table_bytes: 2.1e6, index_bytes: 8e5, total_bytes: 2.9e6 },
                { table: 'activity_logs', rows: activityLogs.length, table_bytes: 9e5, index_bytes: 2e5, total_bytes: 1.1e6 }
            ]
        });
    }
    if (String(endpoint).indexOf('patient_records?select=metadata') === 0) return Promise.resolve(records.slice(0, 10));
    if (String(endpoint).indexOf('patient_records') === 0) return Promise.resolve(records);
    if (String(endpoint).indexOf('activity_logs') === 0) return Promise.resolve(activityLogs);
    if (String(endpoint).indexOf('user_sessions') === 0) return Promise.resolve(sessions);
    if (String(endpoint).indexOf('clinic_users') === 0) return Promise.resolve(users);
    return Promise.resolve([]);
}
const Auth = {
    ACTIVE_WINDOW_MS: 300000,
    guard: function () { return { token: 'fake-token', user: users[0], expires_at: Date.now() + 36e5 }; },
    escapeHtml: function (v) {
        return String(v === null || v === undefined ? '' : v).replace(/[&<>"']/g, function (c) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
        });
    },
    loadAllUsers: async function () { return users; },
    randomHex: function (len) { return 'x'.repeat(len || 16); },
    hashPassword: function (salt, pw) { return 'sha256$' + salt + '$' + String(pw).length; },
    uuid: (function () { let n = 0; return function () { n += 1; return 'uuid-' + n; }; }()),
    cacheUsers: function () { },
    logActivity: async function () { return true; },
    getClinicId: function () { return 'main_clinic'; }
};
window.EntAuth = Auth;
window.EntSupabase = { apiRequest: apiRequest, isConfigured: function () { return true; } };

/* ------------------------------- run it -------------------------------- */
const sandbox = {
    window: window, document: document, localStorage: localStorage, navigator: navigator,
    console: console, Date: Date, Intl: Intl, JSON: JSON, Math: Math, Number: Number,
    Set: Set, Map: Map, Array: Array, Object: Object, Promise: Promise, String: String,
    RegExp: RegExp, Error: Error, Boolean: Boolean, Function: Function, Symbol: Symbol,
    isFinite: isFinite, isNaN: isNaN, encodeURIComponent: encodeURIComponent,
    parseInt: parseInt, parseFloat: parseFloat, Blob: function () { },
    URL: { createObjectURL: function () { return 'blob:x'; }, revokeObjectURL: function () { } },
    setTimeout: function (fn) { pending.push(fn); return 0; },
    confirm: function () { return true; },
    alert: function () { },
    clearTimeout: function () { },
    setInterval: function (fn, ms) { intervals.push({ fn: fn, ms: ms }); return intervals.length; },
    clearInterval: function () { }
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
process.on('unhandledRejection', function (e) { console.log('UNHANDLED REJECTION:', (e && e.stack) || e); });
vm.runInContext(src, sandbox, { filename: 'function/admin.js' });
const bootFn = (winListeners.DOMContentLoaded || [])[0];
if (!bootFn) { console.log('FAIL: admin.js never registered DOMContentLoaded'); process.exit(1); }

const sessions = [
    { id: 's1', user_id: 'u1', username: 'ana.admin', role: 'admin', device: 'Chrome / Windows', last_seen_at: new Date().toISOString(), revoked: false, created_at: iso(0, 7) },
    { id: 's2', user_id: 'u2', username: 'juan.delacruz', role: 'doctor', device: 'Safari / iPad', last_seen_at: iso(3, 9), revoked: false, created_at: iso(3, 9) }
];

/* ------------------------------- checks -------------------------------- */
const g = function (id) {
    const e = registry.get(id);
    return e ? (e.textContent || e.innerHTML) : '<<no element ' + id + '>>';
};
const rows = function (id) { return String(g(id)).split('<tr').length - 1; };
const cols = function (id) { return String(g(id)).split('ent-chart-col').length - 1; };
const fire = function (node, type, event) {
    (node.listeners[type] || []).forEach(function (fn) { fn(event || { target: node }); });
};

(async function () {
    await bootFn();
    await new Promise(function (r) { setTimeout(r, 40); });

    console.log('BOOT    : ok (no throw)');
    console.log('STATS   :', ['statActive', 'statUsers', 'statDoctors', 'statSecretaries',
        'statInactive', 'statLogins', 'statRecords', 'statWeek', 'statMonth', 'statTotal',
        'statClinics', 'statDb'].map(function (id) {
            return id + '=' + String(g(id)).replace(/\s+/g, ' ').slice(0, 14);
        }).join(' '));
    console.log('SNAPSHOT:', String(g('clinicSnapshot')).replace(/\s+/g, ' ').slice(0, 90));
    console.log('CARDS   :', String(g('clinicCards')).replace(/\s+/g, ' ').slice(0, 70));
    console.log('TABLES  : clinics=' + rows('clinicTable') + ' staff=' + rows('staffTable')
        + ' sessions=' + rows('sessionsTable') + ' users=' + rows('usersTable')
        + ' overview=' + rows('overviewSessions'));
    console.log('GROWTH  :', cols('growthChart'), 'cols |', String(g('growthCaption')).slice(0, 70));
    console.log('HOURLY  :', cols('hourlyChart'), 'cols |', String(g('hourlyCaption')).slice(0, 60));
    console.log('OVERVIEW:', cols('overviewChart'), 'cols |', String(g('weekTrendHint')).replace(/\s+/g, ' ').slice(0, 60));
    console.log('TYPEMIX :', String(g('typeMix')).replace(/\s+/g, ' ').slice(0, 70));
    console.log('ACTIVITY:', rows('activityTable'), 'rows | kpis=', String(g('activityKpis')).split('ent-stat"').length - 1);
    console.log('ACTFOOT :', String(g('activityFoot')).slice(0, 100));
    console.log('DB      : meters=' + (String(g('quotaCards')).split('ent-quota"').length - 1)
        + ' tables=' + rows('dbTable') + ' perclinic=' + rows('clinicUsageTable'));
    console.log('PLAN    :', String(g('planNote')).slice(0, 80));
    console.log('CONN    :', String(g('connText')));
    console.log('API     :', Array.from(new Set(calls)).join(' | '));

    console.log('--- interactions ---');
    fire(tabs[1], 'click');
    console.log('tab clinics ->', registry.get('panel-clinics').classList.contains('active'),
        '| overview off =', !registry.get('panel-overview').classList.contains('active'));
    fire(tabs[4], 'click');
    console.log('tab activity ->', registry.get('panel-activity').classList.contains('active'));

    fire(modeButtons[2], 'click');
    console.log('growth=month cols:', cols('growthChart'));
    registry.get('growthRange').value = '365';
    fire(registry.get('growthRange'), 'change');
    console.log('range=365 cols:', cols('growthChart'), '|', String(g('growthCaption')).slice(0, 60));

    registry.get('clinicFilter').value = 'south_clinic';
    fire(registry.get('clinicFilter'), 'change');
    console.log('filter south -> staff rows=' + rows('staffTable'), 'cards:',
        String(g('clinicCards')).replace(/\s+/g, ' ').slice(0, 50));
    registry.get('clinicFilter').value = '';
    fire(registry.get('clinicFilter'), 'change');

    registry.get('activityPeriod').value = '7';
    fire(registry.get('activityPeriod'), 'change');
    console.log('activity 7d rows:', rows('activityTable'), '|', String(g('activityFoot')).slice(0, 70));
    registry.get('activitySearch').value = 'zzz-nothing-matches';
    fire(registry.get('activitySearch'), 'input');
    console.log('activity empty state:', /ent-empty/.test(String(g('activityTable'))), '|',
        String(g('activityTable')).replace(/\s+/g, ' ').slice(0, 80));
    registry.get('activitySearch').value = '';
    fire(registry.get('activitySearch'), 'input');
    registry.get('activityUser').value = 'ana.admin';
    fire(registry.get('activityUser'), 'change');
    console.log('activity user=ana rows:', rows('activityTable'));
    registry.get('activityUser').value = '';
    fire(registry.get('activityUser'), 'change');

    fire(registry.get('clinicCards'), 'click', {
        target: { closest: function () { return { dataset: { id: 'south_clinic' } }; } }
    });
    const renameInput = registry.get('renameInput');
    if (!renameInput) console.log('RENAME  : modal NOT created');
    else {
        renameInput.value = '   ';
        fire(renameInput, 'keydown', { key: 'Enter', target: renameInput, preventDefault: function () { } });
        console.log('RENAME blank guard:', String(registry.get('renameHint').textContent).slice(0, 46));
        renameInput.value = 'South Endoscopy Suite';
        fire(renameInput, 'keydown', { key: 'Enter', target: renameInput, preventDefault: function () { } });
        console.log('RENAME  :', String(g('clinicSnapshot')).replace(/\s+/g, ' ').indexOf('South Endoscopy Suite') !== -1
            ? 'label applied everywhere' : 'label NOT applied -> ' + String(g('clinicSnapshot')).slice(0, 60));
        console.log('RENAME  : persisted =', store['ent_admin_clinic_labels_v1'],
            '| modal closed =', !registry.get('renameModal').classList.contains('open'));
        // second open must reuse the modal, and Save button must work too
        fire(registry.get('clinicTable'), 'click', {
            target: { closest: function () { return { dataset: { id: 'main_clinic' } }; } }
        });
        registry.get('renameInput').value = 'Main ENT Suite';
        fire(registry.get('renameSave'), 'click');
        console.log('RENAME  : second label =', String(g('clinicCards')).replace(/\s+/g, ' ').indexOf('Main ENT Suite') !== -1);
        console.log('RENAME  : persisted =', store['ent_admin_clinic_labels_v1']);
    }

    fire(registry.get('refreshClinicsBtn'), 'click');
    fire(registry.get('refreshDbBtn'), 'click');
    fire(registry.get('refreshUsersBtn'), 'click');
    await new Promise(function (r) { setTimeout(r, 60); });
    fire(registry.get('exportClinicsBtn'), 'click');
    fire(registry.get('exportActivityBtn'), 'click');
    console.log('EXPORT  : clicked both CSV buttons (blob/download stubbed)');

    console.log('TIMERS  : registered =', intervals.map(function (t) { return t.ms + 'ms'; }).join(', '));
    for (const t of intervals) { await t.fn(); }
    console.log('TICKS   : after live+analytics tick -> growth cols=' + cols('growthChart')
        + ' activity rows=' + rows('activityTable') + ' db tables=' + rows('dbTable'));

    console.log('--- user + session CRUD ---');
    // build an event that behaves like a real click on a row button
    const rowEvent = function (act, rowId, btnId) {
        const btn = el('', 'button');
        if (act) btn.dataset.act = act;
        if (btnId) btn.dataset.id = btnId;
        btn.closest = function (sel) {
            if (sel.indexOf('tr') === 0) {
                const row = el('', 'tr'); row.dataset.id = rowId; return row;
            }
            return btn;
        };
        return { target: btn };
    };
    fire(registry.get('usersTable'), 'click', rowEvent('edit', 'u3'));
    console.log('MODAL   : open =', registry.get('userModal').classList.contains('open'),
        '| title =', String(registry.get('userModalTitle').textContent),
        '| username field =', registry.get('fUsername').value, '(locked=', registry.get('fUsername').disabled + ')');
    registry.get('fFullName').value = 'Rosa M. Ruiz';
    registry.get('fPassword').value = 'newpass123';
    fire(registry.get('userModalSave'), 'click');
    await new Promise(function (r) { setTimeout(r, 30); });
    console.log('SAVE    : writes =', audit.filter(function (a) { return /^PATCH clinic_users/.test(a); }).join(' ;; ') || 'NONE',
        '| modal error =', JSON.stringify(String(registry.get('userModalError').textContent)),
        '| closed =', !registry.get('userModal').classList.contains('open'));
    // deactivate u4 through the row action
    fire(registry.get('usersTable'), 'click', rowEvent('toggle', 'u4'));
    await new Promise(function (r) { setTimeout(r, 30); });
    console.log('TOGGLE  : inactive stat =', String(g('statInactive')).trim());
    // revoke the stale session
    fire(registry.get('sessionsTable'), 'click', rowEvent('revoke', 's2'));
    await new Promise(function (r) { setTimeout(r, 30); });
    console.log('REVOKE  : session patch calls =', calls.filter(function (c) { return c === 'user_sessions'; }).length,
        '| sessions rows =', rows('sessionsTable'));
    // new-user modal must reset the form
    fire(registry.get('addUserBtn'), 'click');
    console.log('ADD     : title =', String(registry.get('userModalTitle').textContent),
        '| username empty =', registry.get('fUsername').value === '',
        '| doctor field hidden =', registry.get('assignedWrap').style.display === 'none');
    registry.get('fRole').value = 'secretary';
    fire(registry.get('fRole'), 'change');
    console.log('ADD     : secretary -> assigned-doctor field shown =', registry.get('assignedWrap').style.display === '');
    registry.get('fFullName').value = 'Maria Test';
    registry.get('fUsername').value = '  MARIA.TEST  ';
    registry.get('fPassword').value = 'secret123';
    fire(registry.get('fAssigned'), 'change');
    registry.get('fAssigned').value = 'u2';
    fire(registry.get('userModalSave'), 'click');
    await new Promise(function (r) { setTimeout(r, 30); });
    console.log('ADD     : writes =', audit.filter(function (a) { return /POST clinic_users/.test(a); }).join(' ;; ') || 'NONE',
        '| error =', JSON.stringify(String(registry.get('userModalError').textContent)),
        '| modal closed =', !registry.get('userModal').classList.contains('open'));
    fire(registry.get('userModalCancel'), 'click');
    console.log('ADD     : closed =', !registry.get('userModal').classList.contains('open'));

    console.log('AFTER REFRESH: records=' + String(g('statRecords')).trim()
        + ' total=' + String(g('statTotal')).trim() + ' db=' + String(g('statDb')).trim()
        + ' growthcols=' + cols('growthChart'));
    console.log('toast present:', registry.has('entToast'));
    console.log('DONE');
})().catch(function (e) {
    console.log('BOOT ERROR:', (e && e.stack) || e);
    process.exit(1);
});


