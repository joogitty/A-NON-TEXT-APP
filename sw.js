/**
 * GhostChat Service Worker for 100% Offline Caching
 */

const CACHE_NAME = 'ghostchat-v1';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './src/crypto.js',
  './src/storage.js',
  './src/signaling.js',
  './src/audioFallback.js',
  './src/qrScanner.js',
  './src/webrtc.js',
  './src/sessionLock.js',
  './src/app.js',
  './manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[ServiceWorker] Caching App Shell Assets');
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[ServiceWorker] Removing Old Cache:', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).catch(() => {
        return caches.match('./index.html');
      });
    })
  );
});
