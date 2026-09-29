/* =====================================================================
   ENT CLINIC AUTHENTICATION & ROLE SCOPING
   ---------------------------------------------------------------------
   - 4 doctors / 4 secretaries / 1 admin (seeded in supabase_auth_schema.sql)
   - A SECRETARY only ever queries patient_records.doctor_id of the doctor
     she is assigned to, so she can never see another doctor's patients.
   - A DOCTOR only sees rows stamped with his/her own id.
   - An ADMIN sees everything and gets the Admin interface.
   - Live "active now" comes from user_sessions heartbeats (30s).
   Depends on: supabaseClient.js (window.EntSupabase)
   ===================================================================== */
(function (window) {
    'use strict';

    const SESSION_KEY = 'entSessionV1';
    const USERS_CACHE_KEY = 'entUsersCacheV1';
    const HEARTBEAT_MS = 30000;
    const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h absolute lifetime
    const PUBLIC_PAGES = ['login.html'];

    let heartbeatTimer = null;

    /* ------------------------------------------------------------------
       SHA-256 (pure JS) - password hashing.
       crypto.subtle only exists in secure contexts, and this app is also
       opened from file:// , so we ship our own implementation.
       hash = sha256( utf8( salt + password ) )  -> lowercase hex
       ------------------------------------------------------------------ */
    const SHA_K = [
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
        0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
        0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
        0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
        0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ];

    function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }

    function sha256Hex(input) {
        const bytes = window.TextEncoder ? new window.TextEncoder().encode(input) : utf8Fallback(input);
        const len = bytes.length;
        const blocks = Math.ceil((len + 9) / 64);
        const total = blocks * 64;
        const buf = new Uint8Array(total);
        buf.set(bytes);
        buf[len] = 0x80;
        const view = new DataView(buf.buffer);
        const bitLen = len * 8;
        view.setUint32(total - 8, Math.floor(bitLen / 4294967296));
        view.setUint32(total - 4, bitLen >>> 0);

        const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
        const w = new Uint32Array(64);

        for (let block = 0; block < total; block += 64) {
            for (let t = 0; t < 16; t++) w[t] = view.getUint32(block + t * 4);
            for (let t = 16; t < 64; t++) {
                const s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
                const s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
                w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
            }
            let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
            for (let t = 0; t < 64; t++) {
                const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
                const ch = (e & f) ^ (~e & g);
                const t1 = (h + S1 + ch + SHA_K[t] + w[t]) >>> 0;
                const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
                const maj = (a & b) ^ (a & c) ^ (b & c);
                const t2 = (S0 + maj) >>> 0;
                h = g; g = f; f = e; e = (d + t1) >>> 0;
                d = c; c = b; b = a; a = (t1 + t2) >>> 0;
            }
            H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
            H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
        }
        return H.map(v => (v >>> 0).toString(16).padStart(8, '0')).join('');
    }

    function utf8Fallback(str) {
        const out = [];
        for (let i = 0; i < str.length; i++) {
            let c = str.charCodeAt(i);
            if (c < 0x80) out.push(c);
            else if (c < 0x800) { out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f)); }
            else if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
                c = 0x10000 + ((c & 0x3ff) << 10) + (str.charCodeAt(++i) & 0x3ff);
                out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 0x3f), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
            } else { out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f)); }
        }
        return new Uint8Array(out);
    }

    function hashPassword(salt, password) { return sha256Hex(String(salt) + String(password)); }

    function randomHex(len) {
        const chars = '0123456789abcdef';
        const arr = new Uint8Array(len || 16);
        if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(arr);
        else for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
        return Array.from(arr).map(b => chars[b >> 4] + chars[b & 15]).join('');
    }

    function uuid() {
        if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
        const b = randomHex(32);
        return `${b.slice(0, 8)}-${b.slice(8, 12)}-4${b.slice(13, 16)}-8${b.slice(17, 20)}-${b.slice(20, 32)}`;
    }

    /* ------------------------------------------------------------------
       Low level helpers
       ------------------------------------------------------------------ */
    function api(endpoint, options) {
        if (!window.EntSupabase || typeof window.EntSupabase.apiRequest !== 'function') {
            return Promise.reject(new Error('Supabase client is not loaded.'));
        }
        return window.EntSupabase.apiRequest(endpoint, options);
    }

    function json(method, body, extraHeaders) {
        return {
            method,
            headers: Object.assign({ 'Content-Type': 'application/json' }, extraHeaders || {}),
            body: JSON.stringify(body)
        };
    }

    function getClinicId() {
        try {
            const cfg = window.EntSupabase && window.EntSupabase.getConfig();
            return (cfg && cfg.clinicId) || 'main_clinic';
        } catch (e) { return 'main_clinic'; }
    }

    function isNetworkError(error) {
        const msg = String((error && error.message) || '');
        return /Failed to fetch|NetworkError|Load failed|ERR_|timed? ?out|ECONN/i.test(msg);
    }

    function deviceLabel() {
        const ua = navigator.userAgent || '';
        if (/Android/i.test(ua)) return 'Android';
        if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS';
        if (/Windows/i.test(ua)) return 'Windows';
        if (/Mac OS X/i.test(ua)) return 'macOS';
        if (/Linux/i.test(ua)) return 'Linux';
        return 'Unknown device';
    }

    function currentPageName() {
        let path = window.location.pathname.split('/').pop() || '';
        if (!path) path = 'index.html';
        return path.toLowerCase();
    }

    /* ------------------------------------------------------------------
       Local session (localStorage) - keeps the user signed in and lets
       the app work offline.
       ------------------------------------------------------------------ */
    function readSession() {
        try {
            const raw = localStorage.getItem(SESSION_KEY);
            if (!raw) return null;
            const session = JSON.parse(raw);
            if (!session || !session.token || !session.user) return null;
            if (session.expiresAt && Date.now() > session.expiresAt) {
                localStorage.removeItem(SESSION_KEY);
                return null;
            }
            return session;
        } catch (e) { return null; }
    }

    function writeSession(session) {
        try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch (e) { /* ignore */ }
    }

    function clearSession() {
        try { localStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ }
    }

    function currentUser() {
        const session = readSession();
        return session ? session.user : null;
    }

    function isAdmin() {
        const user = currentUser();
        return !!user && user.role === 'admin';
    }

    /* ------------------------------------------------------------------
       ROLE SCOPE - the heart of "walang nagsas SHARE ng records".
       doctor    -> only rows whose doctor_id is his/her own user id
       secretary -> only rows whose doctor_id is HER assigned doctor's id
       admin     -> everything (seeAll = true)
       ------------------------------------------------------------------ */
    function scope() {
        const user = currentUser();
        if (!user) return { role: 'guest', doctorId: '', seeAll: false, label: 'Not signed in' };
        if (user.role === 'admin') {
            return {
                role: 'admin',
                doctorId: '',
                seeAll: true,
                label: user.full_name || user.username
            };
        }
        const doctorId = user.role === 'doctor' ? user.id : (user.assigned_doctor_id || '');
        return {
            role: user.role,
            doctorId: doctorId || '',
            seeAll: false,
            label: user.role === 'doctor'
                ? (user.full_name || user.username)
                : `${user.full_name || user.username} \u2192 Dr. ${user.assigned_doctor_name || 'assigned doctor'}`,
            assignedDoctorId: user.assigned_doctor_id || ''
        };
    }

    /* ------------------------------------------------------------------
       Users cache - lets people log in on a machine that is offline.
       ------------------------------------------------------------------ */
    function cacheUsers(users) {
        try {
            localStorage.setItem(USERS_CACHE_KEY, JSON.stringify({ at: Date.now(), users: users || [] }));
        } catch (e) { /* ignore */ }
    }

    function readUserCache() {
        try {
            const raw = JSON.parse(localStorage.getItem(USERS_CACHE_KEY) || 'null');
            return raw && Array.isArray(raw.users) ? raw.users : [];
        } catch (e) { return []; }
    }

    async function loadAllUsers(force) {
        if (!force) {
            const cached = readUserCache();
            if (cached.length) return cached;
        }
        const rows = await api('clinic_users?select=*&order=full_name.asc');
        const users = Array.isArray(rows) ? rows : [];
        if (users.length) cacheUsers(users);
        return users;
    }

    /* ------------------------------------------------------------------
       ACTIVITY LOG
       ------------------------------------------------------------------ */
    async function logActivity(action, detail) {
        const session = readSession();
        const user = session ? session.user : null;
        const row = {
            user_id: user ? user.id : null,
            username: user ? (user.username || '') : 'anonymous',
            role: user ? (user.role || '') : '',
            action: String(action || '').slice(0, 60),
            detail: String(detail || '').slice(0, 500),
            clinic_id: getClinicId()
        };
        try {
            await api('activity_logs', json('POST', row));
            return true;
        } catch (error) {
            console.warn('[EntAuth] Could not write activity log:', error.message);
            return false;
        }
    }

    /* ------------------------------------------------------------------
       HEARTBEAT - powers the admin "Active now" counter.
       ------------------------------------------------------------------ */
    async function beat() {
        const session = readSession();
        if (!session || !session.sessionId) return false;
        try {
            await api(`user_sessions?id=eq.${encodeURIComponent(session.sessionId)}`,
                json('PATCH', { last_seen_at: new Date().toISOString() }));
            session.lastBeatAt = Date.now();
            writeSession(session);
            return true;
        } catch (error) {
            return false;
        }
    }

    function startHeartbeat() {
        if (heartbeatTimer) return;
        beat();
        heartbeatTimer = setInterval(beat, HEARTBEAT_MS);
        document.addEventListener('visibilitychange', () => { if (!document.hidden) beat(); });
        window.addEventListener('online', () => beat());
    }

    /* ------------------------------------------------------------------
       LOGIN
       ------------------------------------------------------------------ */
    function verifyAgainst(user, password) {
        return hashPassword(user.salt || '', password) === user.password_hash;
    }

    async function fetchUserByUsername(username) {
        const rows = await api(`clinic_users?username=eq.${encodeURIComponent(username)}&select=*`);
        return Array.isArray(rows) ? (rows[0] || null) : null;
    }

    function buildSafeUser(user, users) {
        const safe = {
            id: user.id,
            username: user.username,
            full_name: user.full_name || user.username,
            role: user.role,
            specialty: user.specialty || '',
            license_no: user.license_no || '',
            assigned_doctor_id: user.assigned_doctor_id || null,
            assigned_doctor_name: null
        };
        if (safe.role === 'secretary' && safe.assigned_doctor_id) {
            const boss = (users || []).find(u => u.id === safe.assigned_doctor_id);
            safe.assigned_doctor_name = boss ? (boss.full_name || boss.username) : null;
        }
        return safe;
    }

    async function login(username, password) {
        const cleanName = String(username || '').trim().toLowerCase();
        if (!cleanName) return { success: false, error: 'Please enter your username.' };
        if (!password) return { success: false, error: 'Please enter your password.' };

        let user = null;
        let offline = false;
        let users = [];

        try {
            user = await fetchUserByUsername(cleanName);
            try { users = await loadAllUsers(true); } catch (e) { /* cosmetic */ }
        } catch (error) {
            if (!isNetworkError(error)) {
                return { success: false, error: error.message || 'Could not reach the user database.' };
            }
            // Offline: fall back to the credentials cached on this device.
            offline = true;
            users = readUserCache();
            user = users.find(u => String(u.username || '').toLowerCase() === cleanName) || null;
        }

        if (!user) return { success: false, error: 'Unknown username. Check with the clinic administrator.' };
        if (user.is_active === false) return { success: false, error: 'This account is deactivated. Contact the administrator.' };
        if (!verifyAgainst(user, password)) return { success: false, error: 'Incorrect password. Please try again.' };

        // A starter password (freshly created account or an admin reset) must be
        // replaced before the account may be used. Offline sign-in is still allowed
        // because the new hash cannot be pushed to the database without a connection.
        if (user.must_change_password === true && navigator.onLine !== false) {
            return {
                success: false,
                mustChangePassword: true,
                username: cleanName,
                error: 'This account still uses its starter password. Choose a new one to continue.'
            };
        }

        const now = Date.now();
        const sessionId = uuid();
        const token = randomHex(32);
        const session = {
            token,
            sessionId,
            user: buildSafeUser(user, users),
            loginAt: now,
            expiresAt: now + SESSION_TTL_MS,
            clinicId: getClinicId(),
            device: deviceLabel(),
            offline: offline
        };

        // Store the cloud session row (best effort - still sign in when offline).
        if (!offline) {
            try {
                await api('user_sessions', json('POST', {
                    id: sessionId,
                    token: token,
                    user_id: user.id,
                    username: user.username,
                    role: user.role,
                    device: session.device,
                    clinic_id: session.clinicId
                }));
                await api(`clinic_users?id=eq.${encodeURIComponent(user.id)}`,
                    json('PATCH', { last_login_at: new Date().toISOString() }));
            } catch (error) {
                console.warn('[EntAuth] Session row not stored:', error.message);
                session.offline = true;
            }
        }

        writeSession(session);
        startHeartbeat();
        if (!session.offline) logActivity('LOGIN', `Signed in from ${session.device}`);
        return { success: true, user: session.user, offline: session.offline };
    }

    /**
     * Replace a password. The current password is always re-checked server-side,
     * so this works both from the sign-in screen (forced starter-password change)
     * and later from inside the app.
     */
    async function setPassword(username, newPassword, currentPassword) {
        const cleanName = String(username || '').trim().toLowerCase();
        const pass = String(newPassword || '');
        if (!cleanName) return { success: false, error: 'Unknown account.' };
        if (pass.length < 6) return { success: false, error: 'The new password must be at least 6 characters.' };

        let user = null;
        try {
            user = await fetchUserByUsername(cleanName);
        } catch (error) {
            return { success: false, error: error.message || 'Could not reach the user database.' };
        }
        if (!user) return { success: false, error: 'Unknown username.' };
        if (currentPassword !== undefined && !verifyAgainst(user, currentPassword)) {
            return { success: false, error: 'The current password is not correct.' };
        }

        const salt = randomHex(16);
        try {
            await api(`clinic_users?id=eq.${encodeURIComponent(user.id)}`, json('PATCH', {
                salt: salt,
                password_hash: hashPassword(salt, pass),
                must_change_password: false,
                updated_at: new Date().toISOString()
            }));
        } catch (error) {
            return { success: false, error: error.message || 'The password could not be saved.' };
        }

        // Keep this device's offline sign-in cache in step with the new password.
        try {
            const cached = readUserCache();
            const hit = cached.find(u => String(u.username || '').toLowerCase() === cleanName);
            if (hit) { hit.salt = salt; hit.password_hash = hashPassword(salt, pass); hit.must_change_password = false; cacheUsers(cached); }
            else { await loadAllUsers(true); }
        } catch (e) { /* cache refresh is best effort */ }

        const session = readSession();
        const self = session && session.user && session.user.username === cleanName;
        logActivity('PASSWORD_RESET', self ? 'Changed own password' : `Password changed for ${cleanName}`);
        return { success: true };
    }

    async function logout() {
        const session = readSession();
        if (session) {
            try {
                await logActivity('LOGOUT', 'Signed out');
                if (session.sessionId) {
                    await api(`user_sessions?id=eq.${encodeURIComponent(session.sessionId)}`,
                        json('PATCH', { revoked: true, last_seen_at: new Date().toISOString() }));
                }
            } catch (e) { /* sign out locally regardless */ }
        }
        if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
        clearSession();
        window.location.href = 'login.html';
    }


    /* ------------------------------------------------------------------
       GUARD - every protected page calls this.
       ------------------------------------------------------------------ */
    function currentPageFile() {
        let path = (window.location.pathname || '').split('/').pop() || '';
        if (!path) return 'index.html';
        return decodeURIComponent(path).toLowerCase();
    }

    function guard(options) {
        const opts = options || {};
        const page = currentPageFile();
        if (PUBLIC_PAGES.indexOf(page) !== -1) return readSession();

        const session = readSession();
        if (!session) {
            const next = encodeURIComponent(window.location.pathname.split('/').pop() + window.location.search);
            window.location.replace(`login.html?next=${next}`);
            return null;
        }
        if (opts.roles && opts.roles.indexOf(session.user.role) === -1) {
            if (typeof opts.onDenied === 'function') return opts.onDenied(session);
            window.location.replace('index.html?denied=1');
            return null;
        }
        return session;
    }

    /* ------------------------------------------------------------------
       HEADER CHROME - who am I, whose records am I viewing, sign out.
       ------------------------------------------------------------------ */
    function initialsOf(name) {
        return String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2)
            .map(part => part[0].toUpperCase()).join('') || '?';
    }

    function escapeHtml(value) {
        return String(value == null ? '' : value).replace(/[&<>"']/g, c => (
            { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
        ));
    }

    function renderChrome() {
        const session = readSession();
        if (!session) return null;
        if (document.getElementById('entUserChip')) return document.getElementById('entUserChip');
        if (document.body.classList.contains('ent-login-page')) return null;

        const user = session.user;
        const scoped = scope();
        const chip = document.createElement('div');
        chip.id = 'entUserChip';
        chip.className = `ent-user-chip role-${user.role} no-print`;

        const viewing = user.role === 'admin'
            ? 'Viewing ALL doctors'
            : (user.role === 'doctor' ? 'Own patients only'
                : `Dr. ${escapeHtml(user.assigned_doctor_name || 'assigned')} only`);

        chip.innerHTML = `
            <span class="ent-user-avatar">${escapeHtml(initialsOf(user.full_name))}</span>
            <span class="ent-user-meta">
                <strong>${escapeHtml(user.full_name)}</strong>
                <small>${escapeHtml(user.role.toUpperCase())} &middot; ${viewing}</small>
            </span>
            ${user.role === 'admin' ? '<a class="ent-user-admin" href="admin.html" title="Open the admin console">&#9881; Admin</a>' : ''}
            <button type="button" class="ent-user-logout" title="Sign out of this device" aria-label="Sign out"><span class="ent-user-logout-icon" aria-hidden="true">&#9099;</span>Sign out</button>
        `;
        chip.querySelector('.ent-user-logout').addEventListener('click', () => logout());

        // Preferred landing spot: the dedicated slot in the header's status row.
        // Falling back to the old hosts keeps every page working.
        const host = document.querySelector('.header-user-slot')
            || document.querySelector('.header-content')
            || document.querySelector('.report-header')
            || document.querySelector('header')
            || document.body;
        host.appendChild(chip);

        // The chip is white-on-gradient inside the coloured (.header) bar, and
        // dark-on-light everywhere else (report headers, plain pages).
        chip.classList.toggle('is-on-dark', !!(host.closest && host.closest('.header')));


        if (session.offline && navigator.onLine === false) {
            chip.classList.add('is-offline');
        }
        return chip;
    }

    /* ------------------------------------------------------------------
       BOOT
       ------------------------------------------------------------------ */
    function boot() {
        const page = currentPageFile();
        if (PUBLIC_PAGES.indexOf(page) !== -1) return;
        const session = guard();
        if (!session) return;
        startHeartbeat();
        renderChrome();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot, { once: true });
    } else {
        boot();
    }

    /* ------------------------------------------------------------------
       PUBLIC API
       ------------------------------------------------------------------ */
    window.EntAuth = {
        login,
        logout,
        setPassword,
        guard,
        boot,
        scope,
        currentUser,
        isAdmin,
        readSession,
        clearSession,
        logActivity,
        beat,
        startHeartbeat,
        renderChrome,
        loadAllUsers,
        cacheUsers,
        readUserCache,
        hashPassword,
        sha256Hex,
        randomHex,
        uuid,
        deviceLabel,
        getClinicId,
        escapeHtml,
        HEARTBEAT_MS,
        ACTIVE_WINDOW_MS: 5 * 60 * 1000
    };

})(window);


