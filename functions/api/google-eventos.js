// Cloudflare Pages Function: /api/google-eventos
// Lista eventos existentes no Google Agenda (autenticando como a mesma
// conta de serviço usada em sessoes.js) num intervalo de datas — usado só
// pela tela de "vincular sessões antigas ao Google Agenda" no painel admin,
// pra evitar duplicar eventos que já foram criados por lá manualmente antes
// da sincronização automática existir. Endpoint todo protegido por senha de
// admin, já que expõe o conteúdo da agenda.

const ADMIN_PASSWORD = 'admin';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Password',
  'Content-Type': 'application/json',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

function gcalB64Url(str) {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function gcalToken(env) {
  const email = env.GOOGLE_SA_EMAIL;
  const chavePem = env.GOOGLE_SA_PRIVATE_KEY;
  if (!email || !chavePem) return null;

  const agora = Math.floor(Date.now() / 1000);
  const cabecalho = gcalB64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = gcalB64Url(JSON.stringify({
    iss: email,
    scope: 'https://www.googleapis.com/auth/calendar.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: agora,
    exp: agora + 3600,
  }));
  const entrada = `${cabecalho}.${claims}`;

  const pemLimpo = chavePem.replace(/\\n/g, '\n').replace(/-----BEGIN PRIVATE KEY-----/, '').replace(/-----END PRIVATE KEY-----/, '').replace(/\s/g, '');
  const der = Uint8Array.from(atob(pemLimpo), c => c.charCodeAt(0));
  const chave = await crypto.subtle.importKey('pkcs8', der.buffer, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const assinatura = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', chave, new TextEncoder().encode(entrada));
  const assinaturaB64 = btoa(String.fromCharCode(...new Uint8Array(assinatura))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const jwt = `${entrada}.${assinaturaB64}`;

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${encodeURIComponent(jwt)}`,
  });
  if (!resp.ok) return null;
  const dados = await resp.json();
  return dados.access_token || null;
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') return new Response('', { status: 200, headers: CORS });
  if (request.method !== 'GET') return json({ error: 'Método não suportado' }, 405);
  if (request.headers.get('X-Admin-Password') !== ADMIN_PASSWORD) return json({ error: 'Não autorizado' }, 403);

  const calendarId = env.GOOGLE_CALENDAR_ID;
  const token = await gcalToken(env);
  if (!token || !calendarId) return json({ error: 'Google Agenda não configurado.' }, 500);

  const url = new URL(request.url);
  const timeMin = url.searchParams.get('timeMin') || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const timeMax = url.searchParams.get('timeMax') || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

  try {
    const params = new URLSearchParams({ timeMin, timeMax, maxResults: '250', singleEvents: 'true', orderBy: 'startTime' });
    const resp = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!resp.ok) return json({ error: 'Não consegui consultar o Google Agenda.' }, 502);
    const dados = await resp.json();
    const eventos = (dados.items || []).map(ev => ({
      id: ev.id,
      summary: ev.summary || '(sem título)',
      data: (ev.start && (ev.start.date || (ev.start.dateTime || '').slice(0, 10))) || '',
      hora: (ev.start && ev.start.dateTime) ? ev.start.dateTime.slice(11, 16) : '',
    }));
    return json(eventos);
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}
