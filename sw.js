// Service worker mínimo — só existe pra habilitar "Instalar app" no Android/
// Chrome (exige um service worker registrado com handler de fetch) e deixar
// o site funcionar como app instalável. Não faz cache de nada de propósito:
// o site é cheio de dado ao vivo (sessões, pedidos, saldo...), cachear
// agressivamente arriscaria mostrar informação desatualizada pra admin.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
