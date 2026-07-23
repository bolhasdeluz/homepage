/**
 * Cloudflare Pages Function: /api/sessoes-visibilidade-tipo
 * ----------------------------------------------------------
 * Configuração de visibilidade do calendário POR TIPO de sessão (Interna,
 * Atendimento, Visita, Familia, Reuniao), em vez de marcar grupo por grupo em
 * cada evento — a admin define uma vez "quem vê sessões do tipo X" e isso
 * vale pra toda sessão desse tipo, dali em diante, sem precisar mexer em cada
 * evento (ver calSessaoVisivel() no index.html, que consulta esse mapa).
 *
 * Guardado como um único valor no mesmo KV das sessões (SESSOES_KV), numa
 * chave separada ("config:visibilidade-tipo") que não colide com as chaves
 * "sessao:..." (a listagem de sessões usa KV.list({prefix:'sessao:'}), então
 * essa chave de config nunca aparece misturada nelas).
 *
 * Escrita aceita tanto o X-Admin-Password (padrão usado pelo index.html)
 * quanto um token de admin do Firebase Auth (padrão usado pelo
 * calendario.html) — os dois liberam a mesma ação, sem quebrar quem já usava
 * a senha.
 */

import { requireAdmin } from './_lib/auth.js';

const ADMIN_PASSWORD = 'admin';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Password, Authorization, X-Firebase-Api-Key',
  'Content-Type': 'application/json',
};

const CHAVE = 'config:visibilidade-tipo';
const TIPOS_VALIDOS = ['Interna', 'Atendimento', 'Visita', 'Familia', 'Reuniao'];
const GRUPOS_VALIDOS = ['publico', 'visitante', 'filhas', 'tamboreiro', 'amigos', 'assistencia'];

function padrao() {
  const cfg = {};
  TIPOS_VALIDOS.forEach(t => {
    cfg[t] = { grupos: ['publico', 'visitante', 'filhas', 'tamboreiro'], parcial: [] };
  });
  return cfg;
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response('', { status: 200, headers: CORS });
  }

  const KV = env.SESSOES_KV;
  if (!KV) return json({ error: 'KV não configurado.' }, 500);

  if (request.method === 'GET') {
    const salvo = await KV.get(CHAVE, { type: 'json' });
    return json({ ...padrao(), ...(salvo || {}) });
  }

  if (request.method === 'POST') {
    const senhaOk = request.headers.get('X-Admin-Password') === ADMIN_PASSWORD;
    if (!senhaOk && !(await requireAdmin(request, env))) {
      return json({ error: 'Não autorizado' }, 401);
    }
    const body = await request.json();
    // sanitiza — só aceita os tipos/grupos conhecidos, nunca confia cego no que veio
    const cfg = {};
    TIPOS_VALIDOS.forEach(t => {
      const item = body[t] || {};
      cfg[t] = {
        grupos: Array.isArray(item.grupos) ? item.grupos.filter(g => GRUPOS_VALIDOS.includes(g)) : [],
        parcial: Array.isArray(item.parcial) ? item.parcial.filter(g => GRUPOS_VALIDOS.includes(g)) : [],
      };
    });
    await KV.put(CHAVE, JSON.stringify(cfg));
    return json({ ok: true });
  }

  return json({ error: 'Método não suportado' }, 405);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}
