// Cloudflare Pages Function: /api/avisos
// Avisos/comunicados que a admin escreve e libera por grupo (mesmo padrão de
// visibilidade usado no menu e nas sessões). Guardado no KV do menu (MENU_DATA),
// sem precisar de um novo binding.

const ADMIN_PASSWORD = 'admin';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Password',
  'Content-Type': 'application/json',
};

const CHAVE = 'avisos';
const GRUPOS_VALIDOS = ['publico', 'visitante', 'filhas', 'tamboreiro', 'amigos', 'assistencia'];

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  if (request.method === 'GET') {
    const data = await env.MENU_DATA.get(CHAVE);
    return new Response(data || '[]', { status: 200, headers: CORS });
  }

  if (request.method === 'POST') {
    const password = request.headers.get('X-Admin-Password');
    if (password !== ADMIN_PASSWORD) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }), { status: 401, headers: CORS });
    }
    let body;
    try { body = await request.json(); }
    catch (e) { return new Response(JSON.stringify({ error: 'JSON inválido' }), { status: 400, headers: CORS }); }
    if (!Array.isArray(body)) {
      return new Response(JSON.stringify({ error: 'Esperado um array de avisos' }), { status: 400, headers: CORS });
    }
    // sanitiza — nunca confia cego no que veio do cliente
    const avisos = body
      .filter(a => a && typeof a.texto === 'string' && a.texto.trim())
      .map(a => ({
        id: a.id || `aviso:${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        texto: String(a.texto).slice(0, 2000),
        data: a.data || new Date().toISOString().slice(0, 10),
        grupos: Array.isArray(a.grupos) ? a.grupos.filter(g => GRUPOS_VALIDOS.includes(g)) : [],
      }));
    await env.MENU_DATA.put(CHAVE, JSON.stringify(avisos));
    return new Response(JSON.stringify({ ok: true, avisos }), { status: 200, headers: CORS });
  }

  return new Response('Method not allowed', { status: 405, headers: CORS });
}
