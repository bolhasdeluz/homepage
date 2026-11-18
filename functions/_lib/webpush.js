/**
 * Web Push — RFC 8291 (criptografia aes128gcm do payload) + RFC 8292 (VAPID)
 * implementado só com Web Crypto API (crypto.subtle), sem nenhuma dependência
 * de npm — roda direto no runtime do Cloudflare Pages Functions.
 *
 * Testado localmente com round-trip completo (criptografar → descriptografar
 * como o navegador faria do outro lado) antes de entrar em produção.
 */
const te = new TextEncoder();

function b64urlToBytes(s) {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
function bytesToB64url(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function concatBytes(...arrs) {
  const total = arrs.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrs) { out.set(a, off); off += a.length; }
  return out;
}

async function hmacSha256(keyBytes, dataBytes) {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, dataBytes));
}
async function hkdfExtract(salt, ikm) { return hmacSha256(salt, ikm); }
async function hkdfExpand(prk, info, len) {
  const out = await hmacSha256(prk, concatBytes(info, new Uint8Array([1])));
  return out.slice(0, len);
}

async function importVapidKeys(publicB64url, privateB64url) {
  const pubBytes = b64urlToBytes(publicB64url);
  const x = pubBytes.slice(1, 33), y = pubBytes.slice(33, 65);
  const privateKey = await crypto.subtle.importKey('jwk',
    { kty: 'EC', crv: 'P-256', x: bytesToB64url(x), y: bytesToB64url(y), d: privateB64url, ext: true },
    { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  return { privateKey, publicKeyBytes: pubBytes };
}

async function gerarVapidAuthorizationHeader(vapidKeys, audience, subjectMailto) {
  const header = { typ: 'JWT', alg: 'ES256' };
  const payload = { aud: audience, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subjectMailto };
  const unsigned = bytesToB64url(te.encode(JSON.stringify(header))) + '.' + bytesToB64url(te.encode(JSON.stringify(payload)));
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, vapidKeys.privateKey, te.encode(unsigned)));
  const jwt = unsigned + '.' + bytesToB64url(sig);
  return `vapid t=${jwt}, k=${bytesToB64url(vapidKeys.publicKeyBytes)}`;
}

// criptografa o payload pro formato aes128gcm usando a chave pública
// (p256dh) e o segredo de autenticação (auth) da subscription do navegador
async function criptografarPayload(payloadBytes, subscriberP256dhB64url, subscriberAuthB64url) {
  const uaPublicBytes = b64urlToBytes(subscriberP256dhB64url);
  const authSecret = b64urlToBytes(subscriberAuthB64url);

  const asKeyPair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublicBytes = new Uint8Array(await crypto.subtle.exportKey('raw', asKeyPair.publicKey));

  const uaPublicKey = await crypto.subtle.importKey('raw', uaPublicBytes, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaPublicKey }, asKeyPair.privateKey, 256));

  const salt = crypto.getRandomValues(new Uint8Array(16));

  const prkKey = await hkdfExtract(authSecret, ecdhSecret);
  const keyInfo = concatBytes(te.encode('WebPush: info'), new Uint8Array([0]), uaPublicBytes, asPublicBytes);
  const ikm = await hkdfExpand(prkKey, keyInfo, 32);

  const prk = await hkdfExtract(salt, ikm);
  const cekBytes = await hkdfExpand(prk, concatBytes(te.encode('Content-Encoding: aes128gcm'), new Uint8Array([0])), 16);
  const nonce = await hkdfExpand(prk, concatBytes(te.encode('Content-Encoding: nonce'), new Uint8Array([0])), 12);

  const cek = await crypto.subtle.importKey('raw', cekBytes, { name: 'AES-GCM' }, false, ['encrypt']);
  const plaintext = concatBytes(payloadBytes, new Uint8Array([2])); // delimitador de último registro (RFC 8188)
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, cek, plaintext));

  const recordSize = new Uint8Array(4);
  new DataView(recordSize.buffer).setUint32(0, 4096, false);
  const header = concatBytes(salt, recordSize, new Uint8Array([asPublicBytes.length]), asPublicBytes);

  return concatBytes(header, ciphertext);
}

// manda a notificação de verdade pro serviço de push do navegador
// (FCM/Chrome, Mozilla, Apple push web) — subscription é o objeto que o
// navegador devolveu em pushManager.subscribe(): {endpoint, keys:{p256dh,auth}}
export async function enviarNotificacaoPush(subscription, payloadObj, env) {
  const audience = new URL(subscription.endpoint).origin;
  const vapidKeys = await importVapidKeys(env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
  const authHeader = await gerarVapidAuthorizationHeader(vapidKeys, audience, 'mailto:bolhasdeluz@gmail.com');

  const corpo = await criptografarPayload(te.encode(JSON.stringify(payloadObj)), subscription.keys.p256dh, subscription.keys.auth);

  const res = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      'Authorization': authHeader,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      'TTL': '86400',
    },
    body: corpo,
  });
  return { ok: res.ok, status: res.status, expirada: res.status === 404 || res.status === 410 };
}
