// Minta um Firebase Custom Token de curta duração pra logar automaticamente
// numa outra origem (ex: pontoscantados.pages.dev) que usa o MESMO projeto
// Firebase. Sem isso, a sessão do Firebase Auth não atravessa domínios
// diferentes sozinha — precisa desse passo assinado com a service account.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

// mesma apiKey já exposta no client (firebaseConfig do index.html) — não é segredo
const FIREBASE_API_KEY = 'AIzaSyDZ_vFMHZ7t7nyJWJPRfD280VZzagqY5Ws';
const TOKEN_TTL_SECONDS = 300; // 5 minutos — só o tempo de completar o redirecionamento

function base64url(bytes) {
  const bin = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToArrayBuffer(pem) {
  // remove tudo que não é base64 válido — cobre aspas coladas na hora de
  // copiar do .json, \r, cabeçalho PEM, espaços etc, sem depender de o
  // valor colado estar "limpo"
  const b64 = pem.replace(/-----BEGIN PRIVATE KEY-----/g, '').replace(/-----END PRIVATE KEY-----/g, '').replace(/[^A-Za-z0-9+/=]/g, '');
  if (!b64) throw new Error('FIREBASE_SA_PRIVATE_KEY vazia depois de limpar — confira o valor salvo no Cloudflare');
  let raw;
  try { raw = atob(b64); }
  catch (e) { throw new Error('FIREBASE_SA_PRIVATE_KEY não é uma chave PEM válida (base64 inválido depois de limpar)'); }
  const buf = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i);
  return buf.buffer;
}

async function verificarIdToken(idToken) {
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.users?.[0] || null;
}

async function mintarCustomToken(env, uid, claims) {
  const clientEmail = env.FIREBASE_SA_CLIENT_EMAIL;
  const privateKeyPem = env.FIREBASE_SA_PRIVATE_KEY;
  if (!clientEmail || !privateKeyPem) throw new Error('Service account do Firebase não configurada');

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: clientEmail,
    sub: clientEmail,
    aud: 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit',
    iat: now,
    exp: now + TOKEN_TTL_SECONDS,
    uid,
    claims,
  };

  const enc = new TextEncoder();
  const signingInput = `${base64url(enc.encode(JSON.stringify(header)))}.${base64url(enc.encode(JSON.stringify(payload)))}`;

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(privateKeyPem.replace(/\\n/g, '\n')),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(signingInput));

  return `${signingInput}.${base64url(signature)}`;
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: CORS });

  let body;
  try { body = await request.json(); }
  catch { return new Response(JSON.stringify({ error: 'JSON inválido' }), { status: 400, headers: CORS }); }

  const idToken = body.idToken || '';
  if (!idToken) return new Response(JSON.stringify({ error: 'idToken obrigatório' }), { status: 400, headers: CORS });

  const account = await verificarIdToken(idToken);
  if (!account) return new Response(JSON.stringify({ error: 'Sessão inválida' }), { status: 401, headers: CORS });

  try {
    const customToken = await mintarCustomToken(env, account.localId, { handoff: true, email: account.email || '' });
    return new Response(JSON.stringify({ customToken }), { status: 200, headers: CORS });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message || 'Não foi possível gerar o token' }), { status: 500, headers: CORS });
  }
}
