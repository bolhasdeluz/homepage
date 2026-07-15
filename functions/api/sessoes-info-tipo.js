/**
 * Cloudflare Pages Function: /api/sessoes-info-tipo
 * ----------------------------------------------------------
 * Texto de "informações para visitantes" (endereço, horário de chegada, o que
 * trazer etc.) definido POR TIPO de sessão (Interna, Atendimento, Visita,
 * Familia, Reuniao), já que esse conteúdo se repete entre sessões do mesmo
 * tipo — a admin escreve uma vez por tipo e vale pra toda sessão futura desse
 * tipo (ver calAbrirInfo() no index.html, que consulta esse mapa).
 *
 * Guardado como um único valor no mesmo KV das sessões (SESSOES_KV), numa
 * chave separada ("config:info-tipo") que não colide com as chaves
 * "sessao:..." (a listagem de sessões usa KV.list({prefix:'sessao:'}), então
 * essa chave de config nunca aparece misturada nelas).
 */

const ADMIN_PASSWORD = 'admin';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Password',
  'Content-Type': 'application/json',
};

const CHAVE = 'config:info-tipo';
const TIPOS_VALIDOS = ['Interna', 'Atendimento', 'Visita', 'Familia', 'Reuniao'];

function padrao() {
  const cfg = {};
  TIPOS_VALIDOS.forEach(t => { cfg[t] = ''; });
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
    if (request.headers.get('X-Admin-Password') !== ADMIN_PASSWORD) {
      return json({ error: 'Não autorizado' }, 401);
    }
    const body = await request.json();
    // sanitiza — só aceita os tipos conhecidos, nunca confia cego no que veio
    const cfg = {};
    TIPOS_VALIDOS.forEach(t => { cfg[t] = typeof body[t] === 'string' ? body[t] : ''; });
    await KV.put(CHAVE, JSON.stringify(cfg));
    return json({ ok: true });
  }

  return json({ error: 'Método não suportado' }, 405);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}
