/* =====================================================================
   ADMIN CONSOLE  (admin.html)
   ---------------------------------------------------------------------
   Admin-only: user management (4 doctors / 4 secretaries / 1 admin by
   default), live session monitoring and the activity log.
   Depends on: supabaseClient.js (window.EntSupabase), auth.js (EntAuth)
   ===================================================================== */
(function (window) {
    'use strict';

    const Auth = window.EntAuth;
    if (!Auth) {
        document.body.insertAdjacentHTML('afterbegin',
            '<p style="padding:20px;color:#e74c3c;">auth.js failed to load - the admin console cannot run.</p>');
        return;
    }

    // Hard gate: only administrators may see this page.
    const session = Auth.guard({
        roles: ['admin'],
        onDenied: function () { window.location.replace('index.html?denied=1'); return null; }
    });
    if (!session) return;

    const LIVE_WINDOW_MS = Auth.ACTIVE_WINDOW_MS || 300000;
    const REFRESH_MS = 15000;

    let users = [];
    let sessions = [];
    let activity = [];
    let activityLoaded = false;  // the log is heavy - fetch it once per visit
    let activityError = '';
    let editingId = null;      // null = creating a new user
    let liveTimer = null;

    /* ------------------------------- utils --------------------------- */
    function byId(id) { return document.getElementById(id); }
    function esc(value) { return Auth.escapeHtml(value); }

    function api(endpoint, options) { return window.EntSupabase.apiRequest(endpoint, options); }

    function body(method, payload) {
        return {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        };
    }

    function fmtDateTime(iso) {
        if (!iso) return '\u2014';
        const d = new Date(iso);
        if (isNaN(d.getTime())) return '\u2014';
        return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
            + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    }

    function relTime(iso) {
        if (!iso) return 'never';
        const then = new Date(iso).getTime();
        if (isNaN(then)) return 'never';
        const secs = Math.round((Date.now() - then) / 1000);
        if (secs < 45) return 'just now';
        if (secs < 3600) return Math.round(secs / 60) + ' min ago';
        if (secs < 86400) return (Math.round(secs / 360) / 10) + ' h ago';
        return Math.round(secs / 86400) + ' d ago';
    }

    function isToday(iso) {
        if (!iso) return false;
        const d = new Date(iso), now = new Date();
        return d.getFullYear() === now.getFullYear()
            && d.getMonth() === now.getMonth()
            && d.getDate() === now.getDate();
    }

    function isActiveSession(row) {
        if (!row || row.revoked) return false;
        const seen = new Date(row.last_seen_at).getTime();
        if (isNaN(seen)) return false;
        return (Date.now() - seen) < LIVE_WINDOW_MS;
    }

    function userName(id) {
        const found = users.find(u => u.id === id);
        return found ? (found.full_name || found.username) : 'Unknown user';
    }

    function emptyRow(tbody, colspan, message) {
        byId(tbody).innerHTML = '<tr><td colspan="' + colspan + '" class="ent-empty">' + esc(message) + '</td></tr>';
    }

    /* ----------------------------- loading --------------------------- */
    async function loadUsers(force) {
        users = await Auth.loadAllUsers(force);
        Auth.cacheUsers(users);
    }

    async function loadSessions() {
        const rows = await api('user_sessions?select=*&order=last_seen_at.desc&limit=200');
        sessions = Array.isArray(rows) ? rows : [];
    }

    // 1000 rows keeps ~30 days of history on the clock chart and the
    // user / period filters without pulling the whole log down.
    async function loadActivity(force) {
        if (activityLoaded && !force) return;
        try {
            const rows = await api('activity_logs?select=*&order=created_at.desc&limit=1000');
            activity = Array.isArray(rows) ? rows : [];
            activityLoaded = true;
            activityError = '';
        } catch (error) {
            activityError = (error && error.message) || String(error);
        }
        populateActivityUsers();
        populateActivityActions();
        renderActivity();
        renderHourly();
    }

    function fail(tbodyId, colspan, error) {
        const message = (error && error.message) ? error.message : String(error);
        emptyRow(tbodyId, colspan, 'Could not load data: ' + message);
    }

    /* ----------------------------- render ---------------------------- */
    function renderStats() {
        const activeUserIds = new Set(
            sessions.filter(isActiveSession).map(s => s.user_id)
        );
        byId('statActive').textContent = activeUserIds.size;
        byId('statUsers').textContent = users.length;
        byId('statDoctors').textContent = users.filter(u => u.role === 'doctor').length;
        byId('statSecretaries').textContent = users.filter(u => u.role === 'secretary').length;
        byId('statInactive').textContent = users.filter(u => u.is_active === false).length;
        byId('statLogins').textContent = new Set(activity.filter(a =>
            a && a.action === 'LOGIN' && String(a.created_at || '').slice(0, 10) === dayKey(new Date())
        ).map(a => a.username || a.user_id || 'anonymous')).size;
        byId('lastRefresh').textContent = 'Updated ' + new Date().toLocaleTimeString();
        renderOverviewStats();
        renderOverviewChart();
    }

    function statusPill(active) {
        return active
            ? '<span class="ent-pill live"><span class="dot"></span>Active</span>'
            : '<span class="ent-pill idle">Idle</span>';
    }

    function rolePill(role) {
        return '<span class="ent-pill role-' + esc(role) + '">' + esc(role) + '</span>';
    }

    function renderOverviewSessions() {
        const live = sessions.filter(isActiveSession).slice(0, 8);
        if (!live.length) return emptyRow('overviewSessions', 5, 'Nobody is signed in right now.');
        byId('overviewSessions').innerHTML = live.map(s => `
            <tr>
                <td><strong>${esc(s.username)}</strong></td>
                <td>${rolePill(s.role)}</td>
                <td>${esc(s.device || '\u2014')}</td>
                <td>${esc(relTime(s.last_seen_at))}</td>
                <td>${statusPill(true)}</td>
            </tr>`).join('');
    }

    function renderUsers() {
        const needle = byId('userSearch').value.trim().toLowerCase();
        const role = byId('roleFilter').value;
        const rows = users.filter(u => {
            if (role && u.role !== role) return false;
            if (!needle) return true;
            return (u.full_name || '').toLowerCase().indexOf(needle) !== -1
                || (u.username || '').toLowerCase().indexOf(needle) !== -1;
        });

        if (!rows.length) return emptyRow('usersTable', 7, 'No user matches this filter.');

        byId('usersTable').innerHTML = rows.map(u => {
            const active = u.is_active !== false;
            const boss = u.role === 'secretary'
                ? esc(u.assigned_doctor_id ? userName(u.assigned_doctor_id) : 'NOT SET \u26a0')
                : '\u2014';
            return `<tr class="${active ? '' : 'inactive'}" data-id="${esc(u.id)}">
                <td><strong>${esc(u.full_name || u.username)}</strong></td>
                <td>${esc(u.username)}</td>
                <td>${rolePill(u.role)}</td>
                <td>${boss}</td>
                <td title="${esc(u.last_login_at || '')}">${esc(relTime(u.last_login_at))}</td>
                <td>${active ? '<span class="ent-pill live">Active</span>' : '<span class="ent-pill idle">Deactivated</span>'}</td>
                <td style="text-align:right;white-space:nowrap;">
                    <button type="button" class="ent-btn" data-act="edit">Edit</button>
                    <button type="button" class="ent-btn" data-act="password">Password</button>
                    <button type="button" class="ent-btn danger" data-act="toggle">${active ? 'Deactivate' : 'Activate'}</button>
                </td>
            </tr>`;
        }).join('');
    }

    function renderSessions() {
        const rows = sessions.slice(0, 60);
        if (!rows.length) return emptyRow('sessionsTable', 7, 'No sessions recorded yet.');
        byId('sessionsTable').innerHTML = rows.map(s => {
            const live = isActiveSession(s);
            const mine = s.user_id === session.user.id;
            return `<tr class="${s.revoked ? 'inactive' : ''}" data-id="${esc(s.id)}">
                <td><strong>${esc(s.username)}</strong>${mine ? ' <em style="font-size:.7rem;">(you)</em>' : ''}</td>
                <td>${rolePill(s.role)}</td>
                <td>${esc(s.device || '\u2014')}</td>
                <td>${esc(fmtDateTime(s.created_at))}</td>
                <td>${esc(relTime(s.last_seen_at))}</td>
                <td>${s.revoked ? '<span class="ent-pill idle">Revoked</span>' : statusPill(live)}</td>
                <td style="text-align:right;">
                    ${s.revoked ? '' : `<button type="button" class="ent-btn danger" data-act="revoke">Revoke</button>`}
                </td>
            </tr>`;
        }).join('');
    }

    function renderActivity() {
        const rows = filteredActivity();
        populateActivityUsers();
        renderActivityKpis(rows);
        const shown = rows.slice(0, 200);
        const foot = byId('activityFoot');
        if (!shown.length) {
            emptyRow('activityTable', 6, activityError
                ? 'Could not read the activity log: ' + activityError
                : (activity.length
                    ? 'No events match those filters \u2014 widen the period or clear the search.'
                    : 'No activity recorded yet.'));
            if (foot) foot.textContent = '';
            return;
        }
        byId('activityTable').innerHTML = shown.map(function (a) {
            const u = userByName(a.username);
            return '<tr>'
                + '<td style="white-space:nowrap;" title="' + esc(a.created_at) + '">'
                + esc(fmtDateTime(a.created_at)) + '<div class="ent-hint">'
                + esc(relTime(a.created_at)) + '</div></td>'
                + '<td><strong>' + esc((u && u.full_name) || a.username || '\u2014') + '</strong>'
                + '<div class="ent-hint">' + esc(a.username || '') + '</div></td>'
                + '<td>' + (a.role ? rolePill(a.role) : '\u2014') + '</td>'
                + '<td>' + esc(a.clinic_id ? clinicLabel(a.clinic_id) : '\u2014') + '</td>'
                + '<td>' + actionPill(a.action) + '</td>'
                + '<td>' + esc(a.detail || '') + '</td>'
                + '</tr>';
        }).join('');
        if (foot) {
            foot.textContent = fmtNum(rows.length) + ' event(s) inside the filter \u00b7 showing the newest '
                + shown.length + ' \u00b7 ' + fmtNum(activity.length)
                + ' loaded from activity_logs' + (activityError ? ' \u00b7 last error: ' + activityError : '');
        }
    }

    function toast(message, bad) {
        let box = byId('entToast');
        if (!box) {
            box = document.createElement('div');
            box.id = 'entToast';
            box.style.cssText = 'position:fixed;left:50%;bottom:26px;transform:translateX(-50%);'
                + 'padding:11px 18px;border-radius:10px;font-size:.84rem;z-index:9999;color:#fff;'
                + 'box-shadow:0 8px 24px rgba(0,0,0,.25);max-width:88vw;';
            document.body.appendChild(box);
        }
        box.style.background = bad ? '#c0392b' : '#1f9d55';
        box.textContent = message;
        clearTimeout(box._t);
        box._t = setTimeout(function () { if (box.parentNode) box.remove(); }, 4200);
    }

    /* --------------------------- user modal -------------------------- */
    function modalError(message) {
        const box = byId('userModalError');
        box.textContent = message || '';
        box.classList.toggle('show', !!message);
    }

    function populateDoctors(selectedId) {
        const docs = users.filter(u => u.role === 'doctor');
        const sel = byId('fAssigned');
        sel.innerHTML = docs.length
            ? docs.map(d => `<option value="${esc(d.id)}">${esc(d.full_name || d.username)} (${esc(d.username)})</option>`).join('')
            : '<option value="">No doctor accounts yet</option>';
        if (selectedId) sel.value = selectedId;
    }

    function syncRoleFields() {
        byId('assignedWrap').style.display = byId('fRole').value === 'secretary' ? '' : 'none';
    }

    function openUserModal(user, focusPassword) {
        editingId = user ? user.id : null;
        byId('userModalTitle').textContent = user ? 'Edit ' + (user.full_name || user.username) : 'Add user';
        byId('fFullName').value = user ? (user.full_name || '') : '';
        byId('fUsername').value = user ? user.username : '';
        byId('fUsername').disabled = !!user;
        byId('fRole').value = user ? user.role : 'doctor';
        byId('fSpecialty').value = user ? (user.specialty || '') : '';
        byId('fActive').checked = user ? user.is_active !== false : true;
        byId('fPassword').value = '';
        byId('passwordLabel').textContent = user ? 'New password (blank = keep current)' : 'Password';
        byId('passwordHint').textContent = user
            ? 'Fill this in only if you want to replace their password.'
            : 'At least 6 characters. Share it with the user.';
        populateDoctors(user ? user.assigned_doctor_id : '');
        syncRoleFields();
        modalError('');
        byId('userModal').classList.add('open');
        setTimeout(function () { (focusPassword ? byId('fPassword') : byId('fFullName')).focus(); }, 60);
    }

    function closeUserModal() {
        byId('userModal').classList.remove('open');
        editingId = null;
    }

    async function saveUser() {
        const fullName = byId('fFullName').value.trim();
        const username = byId('fUsername').value.trim().toLowerCase().replace(/\s+/g, '');
        const role = byId('fRole').value;
        const specialty = byId('fSpecialty').value.trim();
        const active = byId('fActive').checked;
        const password = byId('fPassword').value;
        const assigned = role === 'secretary' ? byId('fAssigned').value : '';

        if (!fullName) return modalError('Please enter the full name.');
        if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
            return modalError('Username: 3-32 characters, lowercase letters, numbers, dot, dash or underscore.');
        }
        if (password && password.length < 6) return modalError('Password must be at least 6 characters.');
        if (!editingId && !password) return modalError('A new user needs a starting password.');
        if (role === 'secretary' && !assigned) {
            return modalError('Assign this secretary to a doctor first (create a doctor account if none exists).');
        }

        const saving = byId('userModalSave');
        saving.disabled = true;
        saving.textContent = 'Saving\u2026';
        try {
            if (editingId) {
                const patch = {
                    full_name: fullName,
                    role: role,
                    assigned_doctor_id: assigned || null,
                    specialty: specialty,
                    is_active: active,
                    updated_at: new Date().toISOString()
                };
                if (password) {
                    const salt = 'ENTs4lt-' + Auth.randomHex(8);
                    patch.salt = salt;
                    patch.password_hash = Auth.hashPassword(salt, password);
                    patch.must_change_password = true;
                }
                await api('clinic_users?id=eq.' + editingId, body('PATCH', patch));
                if (password) await Auth.logActivity('PASSWORD_RESET', 'Password reset for ' + username);
                await Auth.logActivity('USER_UPDATED', 'Updated account ' + username + ' (' + role + ')');
                if (!active) await revokeSessionsOf(editingId, 'account deactivated');
                toast('Saved ' + username + '.');
            } else {
                if (users.some(u => (u.username || '').toLowerCase() === username)) {
                    return modalError('That username is already taken.');
                }
                const salt = 'ENTs4lt-' + Auth.randomHex(8);
                await api('clinic_users', body('POST', [{
                    id: Auth.uuid(),
                    username: username,
                    password_hash: Auth.hashPassword(salt, password),
                    salt: salt,
                    full_name: fullName,
                    role: role,
                    assigned_doctor_id: assigned || null,
                    specialty: specialty,
                    is_active: active,
                    must_change_password: true
                }]));
                await Auth.logActivity('USER_CREATED', 'Created ' + username + ' as ' + role);
                toast('Account ' + username + ' created.');
            }
            closeUserModal();
            await loadUsers(true);
            Auth.cacheUsers(users);
            renderStats();
            renderUsers();
        } catch (error) {
            modalError('Could not save: ' + error.message);
        } finally {
            saving.disabled = false;
            saving.textContent = 'Save';
        }
    }

    /* ----------------------------- actions --------------------------- */
    async function toggleActive(user) {
        const activate = user.is_active === false;
        const label = activate ? 'Activate' : 'Deactivate';
        const who = user.full_name || user.username;
        if (!confirm(label + ' ' + who + '?' + (activate ? '' : '\nThey will be signed out of every device.'))) return;
        try {
            await api('clinic_users?id=eq.' + user.id, body('PATCH', {
                is_active: activate,
                updated_at: new Date().toISOString()
            }));
            if (!activate) await revokeSessionsOf(user.id, 'account deactivated');
            await Auth.logActivity(activate ? 'USER_ACTIVATED' : 'USER_DEACTIVATED', label + ' ' + user.username);
            await loadUsers(true);
            Auth.cacheUsers(users);
            renderStats();
            renderUsers();
            toast(who + ' ' + (activate ? 'activated.' : 'deactivated.'));
        } catch (error) {
            toast('Could not ' + label.toLowerCase() + ': ' + error.message, true);
        }
    }

    async function revokeSessionsOf(userId, reason) {
        try {
            await api('user_sessions?user_id=eq.' + userId + '&revoked=eq.false', body('PATCH', { revoked: true }));
            await Auth.logActivity('SESSION_REVOKED', 'Revoked open sessions - ' + reason);
        } catch (error) {
            console.warn('Could not revoke sessions:', error);
        }
    }

    async function revokeSession(row) {
        if (!confirm('Sign ' + row.username + ' out of that device now?')) return;
        try {
            await api('user_sessions?id=eq.' + row.id, body('PATCH', { revoked: true }));
            await Auth.logActivity('SESSION_REVOKED', 'Revoked session of ' + row.username + ' (' + (row.device || '?') + ')');
            await loadSessions();
            renderStats();
            renderSessions();
            toast('Session revoked.');
        } catch (error) {
            toast('Could not revoke: ' + error.message, true);
        }
    }

    /* --------------------------- refreshing -------------------------- */
    async function refreshAll(loud) {
        const problems = [];
        try {
            await loadUsers(true);
        } catch (e) { problems.push('users: ' + e.message); fail('usersTable', 7, e); }
        try {
            await loadSessions();
        } catch (e) { problems.push('sessions: ' + e.message); fail('sessionsTable', 7, e); fail('overviewSessions', 5, e); }
        try {
            await loadActivity(loud);
        } catch (e) { problems.push('activity log: ' + e.message); fail('activityTable', 6, e); }

        renderStats();
        renderOverviewSessions();
        renderUsers();
        renderSessions();
        if (problems.length && loud) toast('Loaded only partly - ' + problems.join(' / '), true);
    }

    async function liveTick() {
        if (document.hidden) return;
        try {
            await loadSessions();
            renderStats();
            renderOverviewSessions();
            renderSessions();
        } catch (e) { /* keep the previous picture on a dropped request */ }
    }

    function setLive(on) {
        clearInterval(liveTimer);
        liveTimer = null;
        clearInterval(analyticsTimer);
        analyticsTimer = null;
        if (on) {
            liveTimer = setInterval(liveTick, REFRESH_MS);
            analyticsTimer = setInterval(analyticsTick, ANALYTICS_REFRESH_MS);
        }
    }

    /* ------------------------------ wiring --------------------------- */
    function selectPanel(name) {
        currentPanel = name;
        document.querySelectorAll('#adminTabs button[data-panel]').forEach(function (b) {
            b.classList.toggle('active', b.dataset.panel === name);
        });
        document.querySelectorAll('.ent-admin-panel').forEach(function (p) {
            p.classList.toggle('active', p.id === 'panel-' + name);
        });
    }

    function wire() {
        document.querySelectorAll('#adminTabs button[data-panel]').forEach(function (b) {
            b.addEventListener('click', function () { selectPanel(b.dataset.panel); });
        });

        byId('userSearch').addEventListener('input', renderUsers);
        byId('roleFilter').addEventListener('change', renderUsers);
        byId('activityFilter').addEventListener('change', renderActivity);

        byId('refreshUsersBtn').addEventListener('click', function () { refreshAll(true); });
        byId('refreshSessionsBtn').addEventListener('click', function () { refreshAll(true); });
        byId('refreshActivityBtn').addEventListener('click', function () { refreshAll(true); });

        byId('liveChk').addEventListener('change', function (e) { setLive(e.target.checked); });
        document.addEventListener('visibilitychange', function () { if (!document.hidden) liveTick(); });

        byId('addUserBtn').addEventListener('click', function () { openUserModal(null); });
        byId('userModalCancel').addEventListener('click', closeUserModal);
        byId('userModalSave').addEventListener('click', saveUser);
        byId('fRole').addEventListener('change', syncRoleFields);
        byId('userModal').addEventListener('click', function (e) {
            if (e.target === byId('userModal')) closeUserModal();
        });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && byId('userModal').classList.contains('open')) closeUserModal();
        });

        byId('usersTable').addEventListener('click', function (e) {
            const btn = e.target.closest('button[data-act]');
            if (!btn) return;
            const row = btn.closest('tr[data-id]');
            const user = users.find(u => u.id === row.dataset.id);
            if (!user) return;
            if (btn.dataset.act === 'edit') openUserModal(user);
            else if (btn.dataset.act === 'password') openUserModal(user, true);
            else if (btn.dataset.act === 'toggle') toggleActive(user);
        });

        byId('sessionsTable').addEventListener('click', function (e) {
            const btn = e.target.closest('button[data-act="revoke"]');
            if (!btn) return;
            const row = btn.closest('tr[data-id]');
            const row_ = sessions.find(s => s.id === row.dataset.id);
            if (row_) revokeSession(row_);
        });
    }

    /* ================================================================
       CLINIC GROWTH + DATABASE USAGE  (Clinics & growth / Database tabs)
       ================================================================ */
    const LABEL_KEY = 'ent_admin_clinic_labels_v1';
    const PAGE_SIZE = 1000;          // Supabase REST paging cap
    const MAX_PAGES = 25;            // ... and the hard stop (25 000 rows)
    const HISTORY_DAYS = 400;        // how far back we pull record counts
    const PALETTE = ['#0ea5e9', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444',
        '#06b6d4', '#ec4899', '#84cc16'];

    const FREE_DB = 500 * 1024 * 1024;
    const FREE_STORAGE = 1024 * 1024 * 1024;
    const FREE_MAU = 50000;
    const FREE_EGRESS = 5 * 1024 * 1024 * 1024;

    let buckets = [];            // {clinic, doctor, by, type, day:'YYYY-MM-DD', n}
    let bucketSource = '';       // 'rpc' | 'rest'
    let bucketTruncated = false;
    let bucketError = '';
    let usage = null;
    let usageError = '';
    let labels = readLabels();
    let growthMode = 'day';
    let currentPanel = 'overview';   // which tab is showing (skip idle work)

    /* ------------------------------ labels --------------------------- */
    function readLabels() {
        try { return JSON.parse(localStorage.getItem(LABEL_KEY) || '{}') || {}; }
        catch (e) { return {}; }
    }
    function saveLabels() {
        try { localStorage.setItem(LABEL_KEY, JSON.stringify(labels)); } catch (e) { /* ignore */ }
    }
    function clinicLabel(id) {
        const clean = id || 'main_clinic';
        if (labels[clean]) return labels[clean];
        const nice = String(clean)
            .replace(/[_-]+/g, ' ')
            .replace(/\b[a-z]/g, function (c) { return c.toUpperCase(); })
            .trim();
        return nice || 'Main clinic';
    }
    function clinicColor(id) {
        const s = String(id || '');
        let h = 0;
        for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 9973;
        return PALETTE[h % PALETTE.length];
    }

    /* ------------------------------- dates --------------------------- */
    function pad2(n) { return (n < 10 ? '0' : '') + n; }
    function dayKey(date) {
        return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate());
    }
    function parseDayKey(key) {
        const p = String(key || '').split('-');
        const d = new Date(Number(p[0]), (Number(p[1]) || 1) - 1, Number(p[2]) || 1);
        return isNaN(d.getTime()) ? null : d;
    }
    function addDays(date, n) {
        const d = new Date(date.getTime());
        d.setDate(d.getDate() + n);
        return d;
    }
    function weekStartOf(date) {          // Monday-based
        const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        return addDays(d, -(((d.getDay() + 6) % 7)));
    }
    function monthKeyOf(date) { return date.getFullYear() + '-' + pad2(date.getMonth() + 1); }
    function viewerTz() {
        try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; }
        catch (e) { return 'UTC'; }
    }
    function setText(id, value) {
        const el = byId(id);
        if (el) el.textContent = value;
    }
    function fmtBytes(bytes) {
        const n = Number(bytes);
        if (!isFinite(n) || n < 0) return '\u2014';
        if (n < 1024) return n + ' B';
        if (n < 1048576) return (n / 1024).toFixed(n < 10240 ? 1 : 0) + ' KB';
        if (n < 1073741824) return (n / 1048576).toFixed(n < 10485760 ? 1 : 0) + ' MB';
        return (n / 1073741824).toFixed(2) + ' GB';
    }
    function fmtNum(n) { return (Number(n) || 0).toLocaleString(); }
    function dayLabel(key) {
        const d = parseDayKey(key);
        return d ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '\u2014';
    }

    /* --------------------------- data loading ------------------------ */
    async function loadBuckets(force) {
        if (buckets.length && !force) return buckets;
        try {
            // PostgREST exposes SQL functions under /rpc/<name>; a POST with
            // a JSON body is the only form that reliably reaches them.
            const rows = await api('rpc/admin_record_activity',
                body('POST', { p_days: HISTORY_DAYS, p_tz: viewerTz() }));
            buckets = (Array.isArray(rows) ? rows : []).map(function (r) {
                return {
                    clinic: r.clinic_id || 'main_clinic',
                    doctor: r.doctor_id || '',
                    by: r.created_by || '',
                    type: r.report_type || 'other',
                    day: String(r.day || '').slice(0, 10),
                    n: Number(r.n) || 0
                };
            });
            bucketSource = 'rpc';
            bucketTruncated = false;
            bucketError = '';
            return buckets;
        } catch (rpcError) {
            buckets = await loadBucketsViaRest();
            bucketSource = 'rest';
            bucketError = (rpcError && rpcError.message) || String(rpcError);
            return buckets;
        }
    }

    // Fallback when supabase_admin_insights.sql was never applied: page
    // through patient_records asking only for the five small columns.
    async function loadBucketsViaRest() {
        const since = new Date(Date.now() - HISTORY_DAYS * 86400000).toISOString();
        const merged = new Map();
        let pages = 0;
        for (let page = 0; page < MAX_PAGES; page++) {
            const from = page * PAGE_SIZE;
            const rows = await api('patient_records?select=clinic_id,doctor_id,created_by,report_type,created_at'
                + '&created_at=gte.' + encodeURIComponent(since)
                + '&order=created_at.desc&limit=' + PAGE_SIZE + '&offset=' + from);
            if (!Array.isArray(rows) || !rows.length) break;
            pages++;
            rows.forEach(function (r) {
                const when = new Date(r.created_at);
                const item = {
                    clinic: r.clinic_id || 'main_clinic',
                    doctor: r.doctor_id || '',
                    by: r.created_by || '',
                    type: r.report_type || 'other',
                    day: isNaN(when.getTime()) ? dayKey(new Date()) : dayKey(when),
                    n: 1
                };
                const key = [item.clinic, item.doctor, item.by, item.type, item.day].join('|');
                const hit = merged.get(key);
                if (hit) hit.n += 1; else merged.set(key, item);
            });
            if (rows.length < PAGE_SIZE) break;
        }
        bucketTruncated = pages >= MAX_PAGES;
        return Array.from(merged.values());
    }

    async function loadUsage(force) {
        if (usage && !force) return usage;
        try {
            const raw = await api('rpc/admin_db_usage', body('POST', {}));
            if (!raw || typeof raw !== 'object') throw new Error('Empty usage payload.');
            usage = raw;
            usage.exact = raw.exact !== false;
            usageError = '';
        } catch (error) {
            usageError = (error && error.message) || String(error);
            usage = await estimateUsage();
        }
        renderDatabase();
        renderOverviewStats();
        return usage;
    }

    // No RPC available -> count the rows already held and sample a few
    // metadata payloads to guess the average row size.
    async function estimateUsage() {
        let avg = 3072;
        try {
            const sample = await api('patient_records?select=metadata&limit=60');
            if (Array.isArray(sample) && sample.length) {
                const bytes = sample.reduce(function (sum, row) {
                    return sum + JSON.stringify((row && row.metadata) || {}).length + 240;
                }, 0);
                avg = Math.max(256, Math.round(bytes / sample.length));
            }
        } catch (e) { /* keep the flat estimate */ }
        const rows = buckets.reduce(function (sum, b) { return sum + b.n; }, 0);
        return {
            exact: false,
            db_bytes: null,
            app_bytes: rows * avg,
            app_rows: rows,
            avg_row_bytes: avg,
            tables: [],
            storage_bytes: null,
            storage_files: null,
            mau: null,
            auth_users: null,
            db_limit_bytes: FREE_DB,
            storage_limit_bytes: FREE_STORAGE,
            mau_limit: FREE_MAU,
            egress_limit_bytes: FREE_EGRESS
        };
    }

    /* ---------------------------- aggregates ------------------------- */
    function clinicIds() {
        const set = new Set();
        buckets.forEach(function (b) { set.add(b.clinic); });
        Object.keys(labels).forEach(function (k) { set.add(k); });
        return Array.from(set).sort();
    }
    function scopeBuckets(clinicId) {
        return clinicId ? buckets.filter(function (b) { return b.clinic === clinicId; }) : buckets;
    }
    function selectedClinic() {
        const sel = byId('clinicFilter');
        return (sel && sel.value) || '';
    }
    // Today / yesterday, this week vs last week, this month vs last month
    function periodTotals(clinicId) {
        const now = new Date();
        const today = dayKey(now);
        const yesterday = dayKey(addDays(now, -1));
        const week = dayKey(weekStartOf(now));
        const prevWeek = dayKey(weekStartOf(addDays(now, -7)));
        const month = monthKeyOf(now);
        const prevMonth = monthKeyOf(new Date(now.getFullYear(), now.getMonth() - 1, 1));
        const out = {
            today: 0, yesterday: 0, week: 0, prevWeek: 0, month: 0, prevMonth: 0,
            total: 0, lastDay: '', days: {}, staff: {}, doctors: {}, types: {}
        };
        scopeBuckets(clinicId).forEach(function (b) {
            if (!b.n) return;
            out.total += b.n;
            out.days[b.day] = (out.days[b.day] || 0) + b.n;
            if (b.day === today) out.today += b.n;
            if (b.day === yesterday) out.yesterday += b.n;
            if (b.day >= week) out.week += b.n;
            else if (b.day >= prevWeek) out.prevWeek += b.n;
            const mk = String(b.day).slice(0, 7);
            if (mk === month) out.month += b.n;
            else if (mk === prevMonth) out.prevMonth += b.n;
            if (b.day > out.lastDay) out.lastDay = b.day;
            if (b.by) out.staff[b.by] = (out.staff[b.by] || 0) + b.n;
            if (b.doctor) out.doctors[b.doctor] = (out.doctors[b.doctor] || 0) + b.n;
            out.types[b.type] = (out.types[b.type] || 0) + b.n;
        });
        return out;
    }
    function trendPill(current, previous) {
        current = Number(current) || 0;
        previous = Number(previous) || 0;
        if (!previous && !current) return '<span class="ent-trend flat">&mdash;</span>';
        if (!previous) return '<span class="ent-trend fresh">&#9650; new</span>';
        const delta = current - previous;
        const pct = Math.abs(Math.round((delta / previous) * 100));
        if (delta > 0) return '<span class="ent-trend up">&#9650; ' + pct + '% (+)' + delta + '</span>';
        if (delta < 0) return '<span class="ent-trend down">&#9660; ' + pct + '% (' + delta + ')</span>';
        return '<span class="ent-trend flat">&#9644; steady</span>';
    }
    function miniCell(label, value, extra) {
        return '<div><span>' + esc(label) + '</span><b>' + fmtNum(value) + '</b>' + (extra || '') + '</div>';
    }
    function sparkline(days) {
        const keys = [];
        for (let i = 13; i >= 0; i--) keys.push(dayKey(addDays(new Date(), -i)));
        let max = 1;
        keys.forEach(function (k) { max = Math.max(max, days[k] || 0); });
        return '<div class="ent-spark">' + keys.map(function (k, i) {
            const v = days[k] || 0;
            return '<i class="' + (i === keys.length - 1 ? 'today' : '') + '"'
                + ' style="height:' + Math.max(2, Math.round((v / max) * 32)) + 'px"'
                + ' title="' + esc(dayLabel(k)) + ': ' + v + ' record' + (v === 1 ? '' : 's') + '"></i>';
        }).join('') + '</div>';
    }

    /* ------------------------------ series --------------------------- */
    function buildSeries(list, mode, count) {
        const now = new Date();
        const out = [];
        if (mode === 'month') {
            for (let i = count - 1; i >= 0; i--) {
                const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                out.push({
                    key: monthKeyOf(d),
                    label: d.toLocaleDateString(undefined, { month: 'short' }),
                    parts: new Map(), total: 0
                });
            }
        } else if (mode === 'week') {
            const first = weekStartOf(addDays(now, -7 * (count - 1)));
            for (let i = 0; i < count; i++) {
                const start = addDays(first, 7 * i);
                out.push({
                    key: dayKey(start),
                    label: (start.getMonth() + 1) + '/' + start.getDate(),
                    parts: new Map(), total: 0
                });
            }
        } else {
            for (let i = count - 1; i >= 0; i--) {
                const d = addDays(now, -i);
                out.push({
                    key: dayKey(d),
                    label: d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
                    parts: new Map(), total: 0
                });
            }
        }
        const index = new Map(out.map(function (b) { return [b.key, b]; }));
        list.forEach(function (b) {
            const d = parseDayKey(b.day);
            if (!d) return;
            const key = mode === 'month' ? monthKeyOf(d)
                : mode === 'week' ? dayKey(weekStartOf(d))
                    : b.day;
            const slot = index.get(key);
            if (!slot) return;
            slot.parts.set(b.clinic, (slot.parts.get(b.clinic) || 0) + b.n);
            slot.total += b.n;
        });
        return out;
    }
    function hourlySeries(days) {
        const out = [];
        for (let h = 0; h < 24; h++) {
            out.push({
                key: String(h), label: pad2(h) + ':00',
                tick: (h % 3 === 0) ? pad2(h) + ':00' : '',   // thin the axis
                parts: new Map(), total: 0
            });
        }
        const index = new Map(out.map(function (b) { return [b.key, b]; }));
        const from = dayKey(addDays(new Date(), -(days - 1)));
        activity.forEach(function (a) {
            if (!a || String(a.created_at || '').slice(0, 10) < from) return;
            const d = new Date(a.created_at);
            if (isNaN(d.getTime())) return;
            const slot = index.get(String(d.getHours()));
            if (slot) slot.total += 1;
        });
        return out;
    }
    function renderChart(chartEl, legendEl, series) {
        if (!chartEl) return;
        let max = 1;
        series.forEach(function (s) { max = Math.max(max, s.total); });
        const ids = clinicIds();
        chartEl.innerHTML = series.map(function (s) {
            const segs = [];
            ids.forEach(function (c) {
                const v = s.parts.get(c);
                if (!v) return;
                segs.push('<span class="ent-chart-seg" style="height:'
                    + Math.max(2, Math.round((v / max) * 150)) + 'px;background:' + clinicColor(c)
                    + '" title="' + esc(clinicLabel(c)) + ': ' + v + '"></span>');
            });
            const height = s.total ? Math.max(3, Math.round((s.total / max) * 150)) : 3;
            return '<div class="ent-chart-col" title="' + esc(s.label) + ' \u00b7 ' + s.total + ' records">'
                + '<span class="ent-chart-val">' + (s.total || '') + '</span>'
                + '<div class="ent-chart-stack" style="height:' + height + 'px">'
                + (segs.join('') || '<span class="ent-chart-seg" style="height:100%"></span>')
                + '</div>'
                + '<span class="ent-chart-x">'
                + esc(s.tick === undefined ? s.label : s.tick) + '</span></div>';
        }).join('');
        if (legendEl) {
            const used = ids.filter(function (c) {
                return series.some(function (s) { return s.parts.get(c); });
            });
            legendEl.innerHTML = used.length
                ? used.map(function (c) {
                    return '<span><i style="background:' + clinicColor(c) + '"></i>'
                        + esc(clinicLabel(c)) + '</span>';
                }).join('')
                : '<span>No clinic data inside this window</span>';
        }
    }
    function rangeDays() {
        const sel = byId('growthRange');
        return sel ? (Number(sel.value) || 30) : 30;
    }

    /* ------------------------------ panels --------------------------- */
    function renderGrowth() {
        const days = rangeDays();
        const counts = {
            day: Math.min(days, 45),
            week: Math.max(2, Math.min(Math.ceil(days / 7), 26)),
            month: Math.max(2, Math.min(Math.ceil(days / 30), 13))
        };
        const series = buildSeries(scopeBuckets(selectedClinic()), growthMode,
            counts[growthMode] || 30);
        renderChart(byId('growthChart'), byId('growthLegend'), series);
        const shown = series.reduce(function (s, b) { return s + b.total; }, 0);
        const totalAll = buckets.reduce(function (s, b) { return s + b.n; }, 0);
        setText('growthCaption', 'Showing ' + fmtNum(shown) + ' of ' + fmtNum(totalAll)
            + ' records \u00b7 ' + (bucketSource === 'rpc'
                ? 'daily buckets grouped in ' + viewerTz()
                : 'grouped in the browser (fallback mode)'));
        renderHourly();
    }
    // The peak-hour picture comes from activity_logs, not from the record
    // counts, so it is redrawn whenever either feed finishes.
    function renderHourly() {
        setText('hourlyCaption', activity.length
            ? fmtNum(activity.length) + ' logged events analysed \u00b7 peak hours come from the activity log'
            : 'No activity log rows loaded yet \u2014 this fills in as staff work.');
        renderChart(byId('hourlyChart'), null, hourlySeries(30));
    }
    function renderTypeMix() {
        const host = byId('typeMix');
        if (!host) return;
        const from = dayKey(addDays(new Date(), -29));
        const totals = {};
        let sum = 0;
        scopeBuckets(selectedClinic()).forEach(function (b) {
            if (String(b.day) < from || !b.n) return;
            totals[b.type] = (totals[b.type] || 0) + b.n;
            sum += b.n;
        });
        const entries = Object.keys(totals).map(function (k) { return [k, totals[k]]; })
            .sort(function (a, b) { return b[1] - a[1]; });
        if (!entries.length) {
            host.innerHTML = '<div class="ent-empty">No reports saved in the last 30 days.</div>';
            return;
        }
        host.innerHTML = entries.map(function (e) {
            const pct = sum ? Math.round((e[1] / sum) * 100) : 0;
            return '<div class="ent-mix-row"><b>' + esc(e[0]) + '</b>'
                + '<span class="ent-share"><span class="ent-share-bar"><span style="width:'
                + pct + '%"></span></span></span>'
                + '<em>' + fmtNum(e[1]) + ' &middot; ' + pct + '%</em></div>';
        }).join('');
    }
    function renderOverviewStats() {
        const has = buckets.length > 0;
        const all = periodTotals('');
        setText('statRecords', has ? fmtNum(all.today) : '\u2014');
        setText('statWeek', has ? fmtNum(all.week) : '\u2014');
        setText('statMonth', has ? fmtNum(all.month) : '\u2014');
        setText('statTotal', has ? fmtNum(all.total) : '\u2014');
        setText('statClinics', fmtNum(clinicIds().length));
        if (usage) {
            const used = Number(usage.db_bytes) || Number(usage.app_bytes) || 0;
            const limit = Number(usage.db_limit_bytes) || FREE_DB;
            const pct = limit ? (used / limit) * 100 : 0;
            const el = byId('statDb');
            if (el) {
                el.textContent = (pct < 10 ? pct.toFixed(1) : Math.round(pct)) + '%';
                el.title = fmtBytes(used) + ' of ' + fmtBytes(limit)
                    + (usage.exact ? ' (exact)' : ' (estimated)');
            }
        }
    }
    function renderSnapshot() {
        const host = byId('clinicSnapshot');
        if (!host) return;
        const ids = clinicIds();
        if (!ids.length) {
            host.innerHTML = '<div class="ent-empty">Nothing stored yet \u2014 saved reports '
                + 'appear here automatically.</div>';
            return;
        }
        host.innerHTML = ids.map(function (id) {
            const t = periodTotals(id);
            return '<div class="ent-snapshot" style="--accent:' + clinicColor(id) + '">'
                + '<b title="' + esc(id) + '">' + esc(clinicLabel(id)) + '</b>'
                + '<div class="ent-snapshot-n">' + fmtNum(t.today) + '</div>'
                + '<div class="ent-snapshot-foot"><span>today</span>'
                + trendPill(t.today, t.yesterday) + '</div></div>';
        }).join('');
    }
    function renderClinicCards() {
        const host = byId('clinicCards');
        if (!host) return;
        const ids = clinicIds();
        if (!ids.length) {
            host.innerHTML = '<div class="ent-empty">No clinic has saved a report yet. As soon as '
                + 'a device in a clinic saves one, its live counters appear here.</div>';
            return;
        }
        host.innerHTML = ids.map(function (id) {
            const t = periodTotals(id);
            return '<div class="ent-clinic-card" style="--accent:' + clinicColor(id) + '">'
                + '<h4>' + esc(clinicLabel(id)) + '</h4>'
                + '<div class="ent-clinic-sub">' + esc(id) + '</div>'
                + '<div class="ent-clinic-today"><strong>' + fmtNum(t.today) + '</strong>'
                + '<span>records today</span>' + trendPill(t.today, t.yesterday) + '</div>'
                + '<div class="ent-clinic-rows">'
                + miniCell('This week', t.week, trendPill(t.week, t.prevWeek))
                + miniCell('This month', t.month, trendPill(t.month, t.prevMonth))
                + miniCell('Records on file', t.total, '')
                + miniCell('Staff active (13 mo)', Object.keys(t.staff).length, '')
                + '</div>'
                + sparkline(t.days)
                + '<div class="ent-clinic-foot"><span>'
                + (t.lastDay ? 'Last record ' + esc(dayLabel(t.lastDay)) : 'No records yet')
                + '</span><button type="button" class="ent-btn ent-btn-sm" data-act="rename-clinic" '
                + 'data-id="' + esc(id) + '">Rename</button></div>'
                + '</div>';
        }).join('');
    }

    function renderOverviewChart() {
        const series = buildSeries(buckets, 'day', 7);
        renderChart(byId('overviewChart'), null, series);
        const thisWeek = series.reduce(function (s, b) { return s + b.total; }, 0);
        const prev = buildSeries(buckets, 'day', 14).slice(0, 7)
            .reduce(function (s, b) { return s + b.total; }, 0);
        const el = byId('weekTrendHint');
        if (el) el.innerHTML = thisWeek + ' records \u00b7 ' + trendPill(thisWeek, prev)
            + ' vs previous 7 days';
    }
    function renderClinicTable() {
        const bodyEl = byId('clinicTable');
        if (!bodyEl) return;
        const ids = clinicIds();
        if (!ids.length) return emptyRow('clinicTable', 10, 'No clinic has saved a record yet.');
        const rows = ids.map(function (id) { return { id: id, t: periodTotals(id) }; })
            .sort(function (a, b) { return (b.t.month - a.t.month) || (b.t.total - a.t.total); });
        bodyEl.innerHTML = rows.map(function (r) {
            const t = r.t;
            return '<tr style="--accent:' + clinicColor(r.id) + '">'
                + '<td><strong>' + esc(clinicLabel(r.id)) + '</strong>'
                + '<div class="ent-hint">' + esc(r.id) + '</div></td>'
                + '<td class="ent-num">' + fmtNum(t.today) + '</td>'
                + '<td>' + trendPill(t.today, t.yesterday) + '</td>'
                + '<td class="ent-num">' + fmtNum(t.week) + '</td>'
                + '<td>' + trendPill(t.week, t.prevWeek) + '</td>'
                + '<td class="ent-num">' + fmtNum(t.month) + '</td>'
                + '<td>' + trendPill(t.month, t.prevMonth) + '</td>'
                + '<td class="ent-num">' + fmtNum(t.total) + '</td>'
                + '<td class="ent-num">' + Object.keys(t.staff).length + '</td>'
                + '<td style="text-align:right;white-space:nowrap;">'
                + '<button type="button" class="ent-btn" data-act="rename-clinic" data-id="'
                + esc(r.id) + '">Rename</button></td></tr>';
        }).join('');
        setText('clinicsHint', 'Today vs yesterday, this week vs last week, this month vs last month'
            + ' \u00b7 ' + ids.length + ' clinic' + (ids.length === 1 ? '' : 's') + ' reporting');
    }

    function userByName(name) {
        const needle = String(name || '').toLowerCase();
        if (!needle) return null;
        return users.find(function (u) {
            return String(u.username || '').toLowerCase() === needle;
        }) || null;
    }
    function renderStaffTable() {
        const bodyEl = byId('staffTable');
        if (!bodyEl) return;
        const now = new Date();
        const today = dayKey(now);
        const week = dayKey(weekStartOf(now));
        const month = monthKeyOf(now);
        const loginFrom = Date.now() - 30 * 86400000;
        const map = new Map();
        function entry(name) {
            const key = String(name || '').toLowerCase();
            if (!map.has(key)) {
                map.set(key, {
                    name: key, user: userByName(key), today: 0, week: 0, month: 0,
                    total: 0, logins: 0, clinics: {}, lastDay: ''
                });
            }
            return map.get(key);
        }
        users.forEach(function (u) { if (u && u.username) entry(u.username); });
        scopeBuckets(selectedClinic()).forEach(function (b) {
            if (!b.by || !b.n) return;
            const e = entry(b.by);
            e.total += b.n;
            e.clinics[b.clinic] = (e.clinics[b.clinic] || 0) + b.n;
            if (b.day === today) e.today += b.n;
            if (b.day >= week) e.week += b.n;
            if (String(b.day).slice(0, 7) === month) e.month += b.n;
            if (b.day > e.lastDay) e.lastDay = b.day;
        });
        activity.forEach(function (a) {
            if (!a || !a.username || String(a.action).toUpperCase() !== 'LOGIN') return;
            if (!(Date.parse(a.created_at) >= loginFrom)) return;
            entry(a.username).logins += 1;
        });
        const rows = Array.from(map.values()).filter(function (e) {
            return e.user || e.total || e.logins;
        }).sort(function (a, b) {
            return (b.total - a.total) || (b.logins - a.logins);
        }).slice(0, 200);
        if (!rows.length) return emptyRow('staffTable', 10, 'No staff activity found yet.');
        bodyEl.innerHTML = rows.map(function (e) {
            const u = e.user;
            const ofClinic = Object.keys(e.clinics).sort(function (a, b) {
                return e.clinics[b] - e.clinics[a];
            });
            const clinic = ofClinic.length
                ? clinicLabel(ofClinic[0])
                : (u && u.clinic_id ? clinicLabel(u.clinic_id) : '\u2014');
            const lastSeen = (u && (u.last_login_at || u.last_sign_in_at))
                || (e.lastDay ? e.lastDay + 'T23:59:00' : '');
            const working = sessions.some(function (s) {
                return !s.revoked && String(s.username || '').toLowerCase() === e.name
                    && isActiveSession(s);
            });
            const state = (u && u.is_active === false)
                ? '<span class="ent-pill idle">Deactivated</span>'
                : (working ? statusPill(true) : '<span class="ent-pill idle">Offline</span>');
            return '<tr' + (u && u.is_active === false ? ' class="inactive"' : '') + '>'
                + '<td><strong>' + esc((u && (u.full_name || u.username)) || e.name) + '</strong>'
                + '<div class="ent-hint">' + esc(e.name) + '</div></td>'
                + '<td>' + (u ? rolePill(u.role) : '<span class="ent-pill idle">unknown</span>') + '</td>'
                + '<td>' + esc(clinic) + '</td>'
                + '<td class="ent-num">' + fmtNum(e.today) + '</td>'
                + '<td class="ent-num">' + fmtNum(e.week) + '</td>'
                + '<td class="ent-num">' + fmtNum(e.month) + '</td>'
                + '<td class="ent-num">' + fmtNum(e.total) + '</td>'
                + '<td class="ent-num">' + fmtNum(e.logins) + '</td>'
                + '<td title="' + esc(lastSeen) + '">' + esc(relTime(lastSeen)) + '</td>'
                + '<td>' + state + '</td></tr>';
        }).join('');
    }
    function populateClinicFilter() {
        const sel = byId('clinicFilter');
        if (!sel) return;
        const keep = sel.value;
        sel.innerHTML = '<option value="">All clinics</option>' + clinicIds().map(function (id) {
            return '<option value="' + esc(id) + '">' + esc(clinicLabel(id)) + '</option>';
        }).join('');
        if (keep && clinicIds().indexOf(keep) !== -1) sel.value = keep;
    }
    function populateActivityUsers() {
        const sel = byId('activityUser');
        if (!sel) return;
        const keep = sel.value;
        const names = new Set();
        activity.forEach(function (a) { if (a && a.username) names.add(String(a.username)); });
        users.forEach(function (u) { if (u && u.username) names.add(String(u.username)); });
        sel.innerHTML = '<option value="">Everyone</option>' + Array.from(names).sort().map(function (n) {
            const u = userByName(n);
            return '<option value="' + esc(n) + '">' + esc((u && u.full_name) || n) + '</option>';
        }).join('');
        if (keep && Array.from(names).indexOf(keep) !== -1) sel.value = keep;
    }

    /* ---------------------------- activity log ----------------------- */
    const ACTION_KINDS = {
        LOGIN: 'live', LOGOUT: 'idle', SAVE_RECORD: 'live', OPEN_RECORD: 'idle',
        USER_CREATED: 'role-admin', USER_UPDATED: 'role-admin',
        USER_ACTIVATED: 'live', USER_DEACTIVATED: 'idle',
        PASSWORD_RESET: 'role-secretary', SESSION_REVOKED: 'idle'
    };
    const ACTION_LABELS = {
        LOGIN: 'Login', LOGOUT: 'Logout', SAVE_RECORD: 'Record saved',
        OPEN_RECORD: 'Record opened', USER_CREATED: 'User created',
        USER_UPDATED: 'User updated', USER_ACTIVATED: 'User activated',
        USER_DEACTIVATED: 'User deactivated', PASSWORD_RESET: 'Password reset',
        SESSION_REVOKED: 'Session revoked'
    };
    function actionPill(action) {
        const key = String(action || '').toUpperCase();
        return '<span class="ent-pill ' + (ACTION_KINDS[key] || 'idle') + '">'
            + esc(ACTION_LABELS[key] || key || '\u2014') + '</span>';
    }
    function filteredActivity() {
        const search = byId('activitySearch');
        const userSel = byId('activityUser');
        const actionSel = byId('activityFilter');
        const periodSel = byId('activityPeriod');
        const needle = ((search && search.value) || '').trim().toLowerCase();
        const user = ((userSel && userSel.value) || '').toLowerCase();
        const action = (actionSel && actionSel.value) || '';
        const days = periodSel ? (Number(periodSel.value) || 0) : 0;
        const fromDay = days > 0 ? dayKey(addDays(new Date(), -(days - 1))) : '';
        return activity.filter(function (a) {
            if (!a) return false;
            if (user && String(a.username || '').toLowerCase() !== user) return false;
            if (action && a.action !== action) return false;
            if (fromDay && String(a.created_at || '').slice(0, 10) < fromDay) return false;
            if (needle) {
                const hay = [a.detail, a.username, a.role, a.clinic_id, a.action]
                    .join(' ').toLowerCase();
                if (hay.indexOf(needle) === -1) return false;
            }
            return true;
        });
    }
    function renderActivityKpis(rows) {
        const host = byId('activityKpis');
        if (!host) return;
        const today = dayKey(new Date());
        const weekFrom = dayKey(addDays(new Date(), -6));
        const peopleToday = new Set();
        const loginsToday = new Set();
        const perUser = {};
        let savesToday = 0;
        let savesWeek = 0;
        rows.forEach(function (a) {
            const day = String(a.created_at || '').slice(0, 10);
            const act = String(a.action || '').toUpperCase();
            if (day === today) {
                peopleToday.add(a.username || 'anonymous');
                if (act === 'LOGIN') loginsToday.add(a.username || 'anonymous');
                if (act === 'SAVE_RECORD') savesToday += 1;
            }
            if (day >= weekFrom && act === 'SAVE_RECORD') savesWeek += 1;
            if (act === 'SAVE_RECORD') {
                const who = a.username || 'anonymous';
                perUser[who] = (perUser[who] || 0) + 1;
            }
        });
        const busiest = Object.keys(perUser).sort(function (a, b) {
            return perUser[b] - perUser[a];
        })[0];
        const cards = [
            ['Events in filter', fmtNum(rows.length)],
            ['People active today', fmtNum(peopleToday.size)],
            ['Logins today', fmtNum(loginsToday.size)],
            ['Records saved today', fmtNum(savesToday)],
            ['Saved this week', fmtNum(savesWeek)],
            ['Busiest person', busiest ? perUser[busiest] + ' saves' : '\u2014']
        ];
        host.innerHTML = cards.map(function (c) {
            return '<div class="ent-stat"><div class="ent-stat-value">' + esc(c[1])
                + '</div><div class="ent-stat-label">' + esc(c[0]) + '</div></div>';
        }).join('');
    }
    function populateActivityActions() {
        const sel = byId('activityFilter');
        if (!sel) return;
        const known = Array.prototype.map.call(sel.options, function (o) { return o.value; });
        const extra = [];
        activity.forEach(function (a) {
            const key = String((a && a.action) || '').toUpperCase();
            if (key && known.indexOf(key) === -1 && extra.indexOf(key) === -1) extra.push(key);
        });
        extra.sort().forEach(function (key) {
            const opt = document.createElement('option');
            opt.value = key;
            opt.textContent = ACTION_LABELS[key] || key;
            sel.appendChild(opt);
        });
    }

    /* --------------------------- csv exports -------------------------- */
    function csvCell(value) {
        const s = (value === null || value === undefined) ? '' : String(value);
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }
    function downloadCsv(name, rows) {
        const csv = rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n');
        const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = name;
        document.body.appendChild(link);
        link.click();
        setTimeout(function () { URL.revokeObjectURL(url); link.remove(); }, 500);
        toast(name + ' downloaded');
    }
    function exportClinicsCsv() {
        const rows = [['Clinic id', 'Clinic name', 'Today', 'Yesterday', 'This week',
            'Last week', 'This month', 'Last month', 'Records on file', 'Active staff',
            'Last record']].concat(clinicIds().map(function (id) {
                const t = periodTotals(id);
                return [id, clinicLabel(id), t.today, t.yesterday, t.week, t.prevWeek,
                    t.month, t.prevMonth, t.total, Object.keys(t.staff).length, t.lastDay];
            }));
        downloadCsv('clinic-growth-' + dayKey(new Date()) + '.csv', rows);
    }
    function exportActivityCsv() {
        const rows = [['When', 'Who', 'Role', 'Clinic', 'Action', 'Detail']]
            .concat(filteredActivity().slice(0, 5000).map(function (a) {
                return [a.created_at, a.username, a.role, a.clinic_id, a.action, a.detail];
            }));
        downloadCsv('activity-log-' + dayKey(new Date()) + '.csv', rows);
    }

    /* -------------------------- clinic rename ------------------------- */
    let renameTarget = '';
    function applyRename() {
        const box = byId('renameModal');
        const input = byId('renameInput');
        const hint = byId('renameHint');
        if (!input || !renameTarget) return;
        const value = String(input.value || '').trim().slice(0, 60);
        if (!value) {
            if (hint) hint.textContent = 'Type a name first \u2014 or press Cancel to leave it as is.';
            return;
        }
        labels[renameTarget] = value;
        saveLabels();
        if (box) box.classList.remove('open');
        renderClinicViews();
        renderClinicUsage();
        toast('Clinic now shown as "' + value + '"');
    }
    function openRenameModal(clinicId) {
        let box = byId('renameModal');
        if (!box) {
            box = document.createElement('div');
            box.id = 'renameModal';
            box.className = 'ent-modal';
            box.innerHTML = '<div class="ent-modal-card" style="max-width:440px;">'
                + '<h3>Name this clinic</h3>'
                + '<div class="ent-field"><label for="renameInput">Display name</label>'
                + '<input type="text" id="renameInput" autocomplete="off" maxlength="60">'
                + '<div class="ent-hint" id="renameHint"></div></div>'
                + '<div class="ent-modal-actions">'
                + '<button type="button" class="ent-btn" id="renameCancel">Cancel</button>'
                + '<button type="button" class="ent-btn primary" id="renameSave">Save</button>'
                + '</div></div>';
            document.body.appendChild(box);
            box.addEventListener('click', function (e) {
                if (e.target === box) box.classList.remove('open');
            });
            byId('renameCancel').addEventListener('click', function () {
                box.classList.remove('open');
            });
            byId('renameSave').addEventListener('click', applyRename);
            byId('renameInput').addEventListener('keydown', function (e) {
                if (e.key === 'Enter') { e.preventDefault(); applyRename(); }
                else if (e.key === 'Escape') box.classList.remove('open');
            });
        }
        renameTarget = clinicId;
        byId('renameInput').value = labels[clinicId] || '';
        byId('renameHint').textContent = 'Technical id: ' + clinicId
            + '. The friendly name is remembered in this browser \u2014 nothing in Supabase changes.';
        box.classList.add('open');
        byId('renameInput').focus();
    }

    /* --------------------------- database usage ----------------------- */
    function quotaCard(title, usedText, limitText, pct, note, available) {
        const safe = Math.max(0, Math.min(100, Number(pct) || 0));
        const kind = safe >= 90 ? 'danger' : (safe >= 70 ? 'warn' : '');
        return '<div class="ent-quota"><div class="ent-quota-top"><strong>' + esc(title) + '</strong>'
            + '<span class="ent-quota-pct">'
            + (available ? (safe < 10 ? safe.toFixed(1) : Math.round(safe)) + '%' : 'n/a')
            + '</span></div>'
            + '<div class="ent-quota-nums">' + esc(usedText) + ' <small>/ ' + esc(limitText) + '</small></div>'
            + '<div class="ent-meter ' + kind + '"><span style="width:'
            + (available ? safe : 0) + '%"></span></div>'
            + '<small>' + esc(note) + '</small></div>';
    }
    function renderDatabase() {
        const host = byId('quotaCards');
        if (!host || !usage) return;
        const dbLimit = Number(usage.db_limit_bytes) || FREE_DB;
        const storageLimit = Number(usage.storage_limit_bytes) || FREE_STORAGE;
        const mauLimit = Number(usage.mau_limit) || FREE_MAU;
        const egressLimit = Number(usage.egress_limit_bytes) || FREE_EGRESS;
        const exact = usage.exact !== false;
        const dbUsed = Number(usage.db_bytes);
        const hasDb = isFinite(dbUsed) && dbUsed >= 0;
        const appUsed = Number(usage.app_bytes) || 0;
        const appRows = Number(usage.app_rows) || 0;
        const storageUsed = Number(usage.storage_bytes);
        const hasStorage = isFinite(storageUsed) && storageUsed >= 0;
        const mauRaw = (usage.mau === null || usage.mau === undefined) ? usage.auth_users : usage.mau;
        const mau = Number(mauRaw);
        const hasMau = isFinite(mau) && mau >= 0;
        host.innerHTML = [
            quotaCard('Database size', hasDb ? fmtBytes(dbUsed) : fmtBytes(appUsed),
                fmtBytes(dbLimit),
                hasDb ? (dbUsed / dbLimit) * 100 : (appUsed / dbLimit) * 100,
                hasDb
                    ? 'pg_database_size() \u2014 tables, indexes and free space together.'
                    : 'Estimated: ' + fmtNum(appRows) + ' records \u00d7 '
                        + fmtBytes(usage.avg_row_bytes || 0) + ' per row. Run the SQL script for exact bytes.',
                true),
            quotaCard('App data', fmtBytes(appUsed), fmtBytes(dbLimit), (appUsed / dbLimit) * 100,
                fmtNum(appRows) + ' rows across the public schema'
                + (bucketTruncated
                    ? ' \u00b7 listing capped at ' + fmtNum(MAX_PAGES * PAGE_SIZE) + ' rows' : ''),
                true),
            quotaCard('File storage', hasStorage ? fmtBytes(storageUsed) : '\u2014',
                fmtBytes(storageLimit),
                hasStorage ? (storageUsed / storageLimit) * 100 : 0,
                hasStorage
                    ? fmtNum(usage.storage_files) + ' file(s) in buckets \u00b7 free plan allows 1 GB'
                    : 'Needs the SQL script \u2014 bucket sizes come from storage.objects.',
                hasStorage),
            quotaCard('Monthly active users', hasMau ? fmtNum(mau) : '\u2014', fmtNum(mauLimit),
                hasMau ? (mau / mauLimit) * 100 : 0,
                hasMau
                    ? fmtNum(usage.auth_users) + ' sign-ups in total \u00b7 free plan allows 50 000 MAU'
                    : 'Needs the SQL script \u2014 MAU is counted from auth.users.',
                hasMau),
            quotaCard('Bandwidth (egress)', '\u2014', fmtBytes(egressLimit), 0,
                'Postgres cannot measure egress from the browser \u2014 see Project Settings \u2192 Usage.',
                false)
        ].join('');
        setText('dbSourceNote', exact
            ? 'Exact numbers read straight from Postgres \u00b7 refreshed ' + new Date().toLocaleTimeString()
            : 'Estimated through the REST API \u2014 run supabase_admin_insights.sql in the SQL editor for exact meters.');
        renderDbTables();
        renderClinicUsage();
        renderPlanNote();
    }

    function renderDbTables() {
        const bodyEl = byId('dbTable');
        if (!bodyEl || !usage) return;
        const tables = Array.isArray(usage.tables) ? usage.tables.slice(0, 25) : [];
        if (!tables.length) {
            return emptyRow('dbTable', 5,
                'Per-table sizes need supabase_admin_insights.sql (it reads pg_class).');
        }
        const max = tables.reduce(function (m, t) { return Math.max(m, Number(t.bytes) || 0); }, 1);
        bodyEl.innerHTML = tables.map(function (t) {
            const total = Number(t.bytes) || 0;
            return '<tr><td><strong>' + esc(t.name || t.table_name) + '</strong>'
                + '<div class="ent-share" style="margin-top:4px;"><span class="ent-share-bar"><span style="width:'
                + Math.round((total / max) * 100) + '%"></span></span></div></td>'
                + '<td class="ent-num">' + fmtNum(t.rows) + '</td>'
                + '<td class="ent-num">' + fmtBytes(t.table_bytes) + '</td>'
                + '<td class="ent-num">' + fmtBytes(t.index_bytes) + '</td>'
                + '<td class="ent-num"><strong>' + fmtBytes(total) + '</strong></td></tr>';
        }).join('');
        const sum = tables.reduce(function (s, t) { return s + (Number(t.bytes) || 0); }, 0);
        setText('dbTablesHint', fmtBytes(sum) + ' across ' + tables.length
            + ' table(s) in the public schema');
    }
    function renderClinicUsage() {
        const bodyEl = byId('clinicUsageTable');
        if (!bodyEl) return;
        const totals = clinicIds().map(function (id) {
            return { id: id, n: periodTotals(id).total };
        }).sort(function (a, b) { return b.n - a.n; });
        const sum = totals.reduce(function (s, r) { return s + r.n; }, 0);
        if (!totals.length || !sum) return emptyRow('clinicUsageTable', 3, 'No records stored yet.');
        const avg = Number(usage && usage.avg_row_bytes) || 0;
        bodyEl.innerHTML = totals.map(function (r) {
            const pct = Math.round((r.n / sum) * 100);
            return '<tr style="--accent:' + clinicColor(r.id) + '">'
                + '<td><strong>' + esc(clinicLabel(r.id)) + '</strong>'
                + '<div class="ent-hint">' + esc(r.id) + '</div></td>'
                + '<td class="ent-num">' + fmtNum(r.n) + '</td>'
                + '<td><div class="ent-share"><span class="ent-share-bar"><span style="width:'
                + pct + '%"></span></span></span><em>' + pct + '%'
                + (avg ? ' \u00b7 ' + fmtBytes(r.n * avg) : '') + '</em></div></td></tr>';
        }).join('');
    }
    function renderPlanNote() {
        const host = byId('planNote');
        if (!host || !usage) return;
        const note = usage.plan_note || ('Supabase Free plan: 500 MB database, 1 GB file storage, '
            + '50 000 monthly active users, 5 GB egress. Free projects pause after a week of inactivity.');
        let extra = '';
        if (usageError) extra = ' Usage function unavailable: ' + usageError;
        else if (bucketError) extra = ' Growth function unavailable (' + bucketError
            + ') \u2014 counts were paged through the REST API instead.';
        host.textContent = note + extra;
    }

    /* -------------------------- orchestration ------------------------- */
    function renderClinicViews() {
        populateClinicFilter();
        renderSnapshot();
        renderClinicCards();
        renderClinicTable();
        renderStaffTable();
        renderGrowth();
        renderTypeMix();
    }
    async function loadAnalytics(force) {
        try {
            await loadBuckets(force);
        } catch (error) {
            const message = (error && error.message) || String(error);
            if (byId('clinicCards')) {
                byId('clinicCards').innerHTML = '<div class="ent-empty">Could not read patient_records: '
                    + esc(message) + '</div>';
            }
            return;
        }
        renderClinicViews();
        renderOverviewStats();
        renderOverviewChart();
    }
    function renderConnPill() {
        const pill = byId('connPill');
        if (!pill) return;
        const configured = !!(window.EntSupabase
            && typeof window.EntSupabase.isConfigured === 'function'
            && window.EntSupabase.isConfigured());
        const online = navigator.onLine !== false;
        pill.classList.toggle('online', configured && online);
        pill.classList.toggle('offline', !(configured && online));
        const clinic = (typeof Auth.getClinicId === 'function' ? Auth.getClinicId() : '') || '';
        setText('connText', !configured
            ? 'Supabase not configured'
            : (online ? 'Live \u00b7 this device: ' + clinic : 'Offline \u2014 showing last numbers'));
    }

    /* --------------------------- event wiring ------------------------ */
    const ANALYTICS_REFRESH_MS = 60000;      // record counts / usage meters
    let analyticsTimer = null;

    function wireAnalytics() {
        // --- Clinics & growth panel -------------------------------------
        const growthRange = byId('growthRange');
        if (growthRange) growthRange.addEventListener('change', renderGrowth);

        const modeBar = byId('growthMode');
        if (modeBar) {
            modeBar.querySelectorAll('button[data-mode]').forEach(function (b) {
                b.addEventListener('click', function () {
                    growthMode = b.dataset.mode;
                    modeBar.querySelectorAll('button[data-mode]').forEach(function (x) {
                        x.classList.toggle('active', x === b);
                    });
                    renderGrowth();
                });
            });
        }

        const clinicSel = byId('clinicFilter');
        if (clinicSel) {
            clinicSel.addEventListener('change', function () {
                renderClinicViews();
                renderClinicUsage();
            });
        }

        const exportClinics = byId('exportClinicsBtn');
        if (exportClinics) exportClinics.addEventListener('click', exportClinicsCsv);

        const refreshClinics = byId('refreshClinicsBtn');
        if (refreshClinics) {
            refreshClinics.addEventListener('click', function () {
                toast('Refreshing clinic numbers\u2026');
                loadAnalytics(true);
            });
        }

        // --- activity log filters ---------------------------------------
        ['activityUser', 'activityPeriod'].forEach(function (id) {
            const el = byId(id);
            if (el) el.addEventListener('change', renderActivity);
        });
        const actSearch = byId('activitySearch');
        if (actSearch) actSearch.addEventListener('input', renderActivity);

        const exportActivity = byId('exportActivityBtn');
        if (exportActivity) exportActivity.addEventListener('click', exportActivityCsv);

        // --- database panel ----------------------------------------------
        const refreshDb = byId('refreshDbBtn');
        if (refreshDb) {
            refreshDb.addEventListener('click', function () {
                toast('Reading the usage meters\u2026');
                loadUsage(true);
            });
        }

        // --- clinic rename (event delegation on both clinic views) -------
        ['clinicCards', 'clinicTable'].forEach(function (id) {
            const host = byId(id);
            if (!host) return;
            host.addEventListener('click', function (e) {
                const btn = e.target.closest('button[data-act="rename-clinic"]');
                if (!btn) return;
                openRenameModal(btn.dataset.id);
            });
        });

        // --- connection pill ---------------------------------------------
        window.addEventListener('online', renderConnPill);
        window.addEventListener('offline', renderConnPill);
    }

    async function analyticsTick() {
        if (document.hidden) return;
        if (currentPanel === 'users' || currentPanel === 'sessions') return;
        try {
            await Promise.all([loadBuckets(true), loadActivity(true)]);
        } catch (e) { /* keep the previous picture on a dropped request */ }
        renderClinicViews();
        renderOverviewStats();
        renderOverviewChart();
        renderActivity();
        renderDatabase();
    }

    /* ------------------------------- boot ---------------------------- */
    async function boot() {
        wire();
        wireAnalytics();
        setLive(byId('liveChk').checked);
        renderConnPill();
        // Three independent feeds: the live console, the record counts and
        // the usage meters. None of them may hold up the others.
        await Promise.all([
            refreshAll(true).catch(function (e) {
                toast('Part of the live console failed: ' + ((e && e.message) || e), true);
            }),
            loadAnalytics(true),
            loadUsage(true)
        ]);
    }

    window.addEventListener('DOMContentLoaded', function () { boot(); });

})(window);











