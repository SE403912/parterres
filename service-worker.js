/* =============================================================================
 *  service-worker.js — MODE HORS-LIGNE
 *  Met en cache les fichiers de l'application pour qu'elle se lance et
 *  fonctionne SANS RÉSEAU sur le terrain. Les données, elles, sont gérées
 *  séparément par localStorage (storage.js) et synchronisées par sync.js.
 * ===========================================================================*/

// Changez ce numéro de version à chaque mise à jour pour forcer le rafraîchissement du cache.
var CACHE = 'parterres-v9';

// Fichiers indispensables au fonctionnement hors-ligne (l'app shell).
var FICHIERS = [
  './',
  './index.html',
  './css/styles.css',
  './js/config.js',
  './js/storage.js',
  './js/sync.js',
  './js/plantes.js',
  './js/drawing.js',
  './js/lib/jspdf.umd.min.js',
  './js/export.js',
  './js/kml.js',
  './js/app.js',
  './manifest.json'
];

// À l'installation : on met en cache l'app shell.
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FICHIERS); }));
  self.skipWaiting();
});

// À l'activation : on supprime les anciens caches.
self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (cles) {
      return Promise.all(cles.filter(function (k) { return k !== CACHE; })
        .map(function (k) { return caches.delete(k); }));
    })
  );
  self.clients.claim();
});

// À chaque requête : on sert d'abord le cache (rapide + hors-ligne),
// sinon on va sur le réseau. On NE met PAS en cache les appels à Apps Script
// (script.google.com) pour toujours avoir des données à jour.
self.addEventListener('fetch', function (e) {
  var url = e.request.url;
  if (url.indexOf('script.google.com') !== -1 || url.indexOf('script.googleusercontent') !== -1) {
    return; // laisse passer vers le réseau sans interception.
  }
  e.respondWith(
    caches.match(e.request).then(function (rep) {
      return rep || fetch(e.request);
    }).catch(function () {
      return caches.match('./index.html'); // repli si tout échoue.
    })
  );
});
