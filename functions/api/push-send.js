// Cloudflare Pages Function: /api/push-send (admin only)
// Manda uma notificação push de verdade pras subscriptions guardadas.
// Precisa das variáveis de ambiente VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY
// (gerar um par novo e configurar como Secret no painel do Cloudflare Pages
// — nunca comitar a chave privada no repositório).
//
// Corpo esperado: { email, titulo, corpo, url? } manda só pra uma pessoa;
// { todos: true, titulo, corpo, url? } manda pra todo mundo que já ativou.
// Subscriptions que o navegador já descartou (404/410) são removidas da KV
// na hora, pra não ficar tentando mandar pra endpoint morto pra sempre.
import { enviarNotificacaoPush } from '../_lib/webpush.js';

const ADMIN_PASSWORD = 'admin';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Password',
  'Content-Type': 'application/json',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

async function listarTodosOsEmailsComSubscription(KV) {
  const emails = [];
  let cursor;
  do {
    const lista = await KV.list({ prefix: 'push:sub:', cursor });
    lista.keys.forEach(k => emails.push(k.name.slice('push:sub:'.length)));
    cursor = lista.cursor;
    if (lista.list_complete) break;
  } while (cursor);
  return emails;
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response('', { status: 200, headers: CORS });
  if (request.method !== 'POST') return json({ error: 'Método não suportado.' }, 405);
  if (request.headers.get('X-Admin-Password') !== ADMIN_PASSWORD) return json({ error: 'Não autorizado' }, 403);

  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
    return json({ error: 'VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY não configuradas nas variáveis de ambiente do Cloudflare Pages.' }, 500);
  }

  const body = await request.json().catch(() => ({}));
  const titulo = (body.titulo || 'Bolhas de Luz').trim();
  const corpo = (body.corpo || '').trim();
  if (!corpo) return json({ error: 'Escreva o corpo da notificação.' }, 400);
  const payload = { title: titulo, body: corpo, url: body.url || '/' };

  const emails = body.todos
    ? await listarTodosOsEmailsComSubscription(env.MENU_DATA)
    : [(body.email || '').trim().toLowerCase()].filter(Boolean);

  if (!emails.length) return json({ error: 'Nenhum destinatário.' }, 400);

  let enviadas = 0, falhas = 0, expiradasRemovidas = 0;
  for (const email of emails) {
    const key = 'push:sub:' + email;
    const subs = (await env.MENU_DATA.get(key, { type: 'json' })) || [];
    if (!subs.length) continue;
    const sobreviventes = [];
    for (const sub of subs) {
      try {
        const resultado = await enviarNotificacaoPush(sub, payload, env);
        if (resultado.ok) { enviadas++; sobreviventes.push(sub); }
        else if (resultado.expirada) { expiradasRemovidas++; }
        else { falhas++; sobreviventes.push(sub); }
      } catch (e) {
        falhas++; sobreviventes.push(sub);
      }
    }
    if (sobreviventes.length !== subs.length) await env.MENU_DATA.put(key, JSON.stringify(sobreviventes));
  }

  return json({ ok: true, destinatarios: emails.length, enviadas, falhas, expiradasRemovidas });
}
