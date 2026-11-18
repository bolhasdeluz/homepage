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

// mostra a notificação quando o push chega (payload = {title, body, url},
// montado em functions/api/push-send.js)
self.addEventListener('push', (event) => {
  let dados = { title: 'Bolhas de Luz', body: '' };
  try { if (event.data) dados = event.data.json(); } catch (e) {}
  event.waitUntil(
    self.registration.showNotification(dados.title || 'Bolhas de Luz', {
      body: dados.body || '',
      icon: '/assets/icon.png',
      badge: '/assets/icon.png',
      data: { url: dados.url || '/' },
    })
  );
});

// clicar na notificação abre (ou foca) a aba do site na URL indicada
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(url) && 'focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
