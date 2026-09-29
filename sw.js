const CACHE_NAME = 'ent-report-system-v28c-ui'; // v28c: CF4 header cleaned up (legacy !important colors + 36px clamp removed), Records button dropped, DB Records wears the sky chip
const FILES_TO_CACHE = [
    './',
    'index.html',
    'login.html',
    'admin.html',
    'manifest.json',
    'nasalEndoscopy.html',
    'laryngealEndoscopy.html',
    'cf4Form.html',
    'settings.html',
    'js/lib/jspdf.umd.min.js',
    'js/lib/html2canvas.min.js',
    'js/lib/cropper.min.js',
    'js/lib/pdf.min.js',
    'js/lib/pdf.worker.min.js',
    'css/lib/cropper.min.css',
    'style/auth.css',
    'function/auth.js',
    'function/admin.js',
    'function/supabaseClient.js',
    'function/syncEngine.js',
    'function/index.js',
    'function/cf4.js',
    'function/patientRecords.js',
    'function/dbRecords.js',
    'function/draftsBrowser.js',
    'style/index.css',
    'style/cf4.css',
    'style/patient-records.css',
    'image/ent-logo.webp',
    'image/rmci-logo.png',
    'image/cumc-logo.png',
    'image/philhealth-logo.webp'
];

// Install service worker: Caches all essential files
self.addEventListener('install', (evt) => {
    evt.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[ServiceWorker] Pre-caching offline pages');
            return cache.addAll(FILES_TO_CACHE);
        }).then(() => self.skipWaiting())
    );
});

// Activate service worker: Removes old caches and takes control immediately
self.addEventListener('activate', (evt) => {
    evt.waitUntil(
        caches.keys().then((keyList) => {
            return Promise.all(keyList.map((key) => {
                if (key !== CACHE_NAME) {
                    console.log('[ServiceWorker] Removing old cache', key);
                    return caches.delete(key);
                }
            }));
        }).then(() => self.clients.claim())
    );
});

// Fetch resources: Serves files from cache first (works offline).
// If a request is not cached, fall back to the network. If the network
// is unavailable and it is a page navigation, serve the cached home page.
self.addEventListener('fetch', (evt) => {
    if (evt.request.method !== 'GET') return;

    evt.respondWith(
        caches.match(evt.request).then((cached) => {
            if (cached) return cached;
            return fetch(evt.request).then((networkResponse) => {
                // Cache successful same-origin responses for future offline use
                if (networkResponse && networkResponse.status === 200 && evt.request.url.startsWith(self.location.origin)) {
                    const copy = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(evt.request, copy));
                }
                return networkResponse;
            }).catch(() => {
                // Offline fallback: navigation requests get the cached home page
                if (evt.request.mode === 'navigate') {
                    return caches.match('index.html');
                }
            });
        })
    );
});

// Listen for message to skip waiting (trigger update)
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});