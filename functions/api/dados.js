// functions/api/dados.js
//
// Tesouraria (incluindo o módulo "Agosto") é por terreiro. O terreiro padrão
// (bolhas-de-luz) continua usando as chaves KV planas de sempre — sem isso, a
// tesouraria que já existe hoje ficaria "presa" atrás de uma migração. Outros
// terreiros usam uma chave namespaced (`chave:terreiroId`) e começam do zero.
const TERREIRO_PADRAO = 'bolhas-de-luz';

function chaveKV(chave, terreiroId) {
  return terreiroId === TERREIRO_PADRAO ? chave : `${chave}:${terreiroId}`;
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const chave = url.searchParams.get('chave');
  const terreiroId = url.searchParams.get('terreiroId') || TERREIRO_PADRAO;

  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (request.method === 'OPTIONS') return new Response(null, { headers });

  const CHAVES_VALIDAS = ['lancamentos', 'ag_pgtos', 'ag_gastos', 'ag_cats', 'ag_catalogo', 'ag_pessoas', 'caixa', 'contas_fixas'];

  if (!chave || !CHAVES_VALIDAS.includes(chave)) {
    return new Response(JSON.stringify({ erro: 'Chave inválida' }), { status: 400, headers });
  }

  const chaveFinal = chaveKV(chave, terreiroId);

  if (request.method === 'GET') {
    const valor = await env.TESOURARIA_KV.get(chaveFinal);
    return new Response(valor || 'null', { headers });
  }

  if (request.method === 'POST') {
    const body = await request.text();
    try { JSON.parse(body); } catch {
      return new Response(JSON.stringify({ erro: 'JSON inválido' }), { status: 400, headers });
    }
    await env.TESOURARIA_KV.put(chaveFinal, body);
    return new Response(JSON.stringify({ ok: true }), { headers });
  }

  return new Response(JSON.stringify({ erro: 'Método não suportado' }), { status: 405, headers });
}
