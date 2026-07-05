// functions/api/dados.js
export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const chave = url.searchParams.get('chave');

  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (request.method === 'OPTIONS') return new Response(null, { headers });

  const CHAVES_VALIDAS = ['lancamentos', 'ag_pgtos', 'ag_gastos', 'ag_cats', 'ag_catalogo', 'caixa'];

  if (!chave || !CHAVES_VALIDAS.includes(chave)) {
    return new Response(JSON.stringify({ erro: 'Chave inválida' }), { status: 400, headers });
  }

  if (request.method === 'GET') {
    const valor = await env.TESOURARIA_KV.get(chave);
    return new Response(valor || 'null', { headers });
  }

  if (request.method === 'POST') {
    const body = await request.text();
    try { JSON.parse(body); } catch {
      return new Response(JSON.stringify({ erro: 'JSON inválido' }), { status: 400, headers });
    }
    await env.TESOURARIA_KV.put(chave, body);
    return new Response(JSON.stringify({ ok: true }), { headers });
  }

  return new Response(JSON.stringify({ erro: 'Método não suportado' }), { status: 405, headers });
}
