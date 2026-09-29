/* =====================================================================
   SUPABASE CLIENT & CONFIGURATION
   ENT-HNS Endoscopy & CF4 Reporting System
   ===================================================================== */
(function (window) {
    'use strict';

    const CONFIG_KEY = 'ent_supabase_config_v1';

    // Default configuration with your configured Supabase credentials
    const defaultConfig = {
        supabaseUrl: 'https://enqrsewsydrsxvrocpjz.supabase.co',
        supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVucXJzZXdzeWRyc3h2cm9jcGp6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA2MzY2MzEsImV4cCI6MjEwNjIxMjYzMX0.vjht-WYC5KEp5sIeDuz1881OYEql52qb_040zA26eUU',
        clinicId: 'main_clinic', // Clinic room or branch identifier
        autoSync: true
    };

    function getConfig() {
        try {
            const saved = localStorage.getItem(CONFIG_KEY);
            if (saved) {
                return { ...defaultConfig, ...JSON.parse(saved) };
            }
        } catch (e) {
            console.warn('Could not read Supabase config from storage', e);
        }
        return { ...defaultConfig };
    }

    function saveConfig(newConfig) {
        try {
            const current = getConfig();
            const merged = { ...current, ...newConfig };
            localStorage.setItem(CONFIG_KEY, JSON.stringify(merged));
            window.dispatchEvent(new CustomEvent('supabase:configChanged', { detail: merged }));
            return merged;
        } catch (e) {
            console.error('Failed to save Supabase config', e);
            return null;
        }
    }

    function isConfigured() {
        const config = getConfig();
        return Boolean(config.supabaseUrl && config.supabaseAnonKey && config.supabaseUrl.startsWith('https://'));
    }

    // Direct fetch helper for Supabase REST API
    async function apiRequest(endpoint, options = {}) {
        const config = getConfig();
        if (!isConfigured()) {
            throw new Error('Supabase is not configured yet.');
        }

        const baseUrl = config.supabaseUrl.replace(/\/+$/, '').replace(/\/rest\/v1\/?$/, '');
        const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
        const url = `${baseUrl}/rest/v1${cleanEndpoint}`;

        const headers = {
            'apikey': config.supabaseAnonKey,
            'Authorization': `Bearer ${config.supabaseAnonKey}`,
            'Content-Type': 'application/json',
            ...(options.headers || {})
        };

        const response = await fetch(url, {
            ...options,
            headers
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Supabase API error (${response.status}): ${errorText}`);
        }

        // IMPORTANT: PostgREST answers INSERT/UPDATE/DELETE with an EMPTY body
        // (204 No Content, or 201 Created with 0 bytes) unless you explicitly ask
        // for `Prefer: return=representation`. Calling response.json() on an empty
        // body throws "Unexpected end of JSON input", which used to make every
        // "Save to Database" fail with "COULD NOT SAVE TO DATABASE" even though
        // the row WAS written. Always read the raw text first and only parse
        // when there is something to parse.
        const raw = await response.text();
        if (!raw) return null;
        try {
            return JSON.parse(raw);
        } catch (parseError) {
            return raw;
        }
    }

    window.EntSupabase = {
        getConfig,
        saveConfig,
        isConfigured,
        apiRequest
    };

})(window);

