const CACHE_NAME = 'retroscore-cache-v1';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './manifest.json',
    'https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap'
];

// Installation : on met en cache tous les fichiers
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
        .then(cache => {
            console.log('Mise en cache des fichiers PWA terminée');
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
});

// Fetch : on sert les fichiers depuis le cache si on est hors-ligne
self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
        .then(response => {
            return response || fetch(event.request);
        })
    );
});
