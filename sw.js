const CACHE_NAME = 'gege-cache-v7'; // On passe en v7 pour forcer la mise à jour chez le navigateur
const urlsToCache = [
  './',
  './index.html',
  './style.css',
  './jsapp.js',
  './jsui.js',
  './jsgps.js',
  './manifest.json',
  './icon.png',
  // On ajoute les fichiers de la carte pour le mode hors-ligne !
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://unpkg.com/leaflet.heat/dist/leaflet-heat.js'
];

self.addEventListener('install', event => {
  self.skipWaiting(); 
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
        console.log('📦 Mise en cache des fichiers Gégé...');
        return cache.addAll(urlsToCache);
    })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            console.log('🧹 Ancien cache supprimé !');
            return caches.delete(cache);
          }
        })
      );
    })
  );
});

// Stratégie : Essayer le réseau d'abord, sinon utiliser le cache (Network First, falling back to cache)
self.addEventListener('fetch', event => {
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
