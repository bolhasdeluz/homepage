const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

// senha separada da do admin — só libera o "Perfil Padrão", usado pra montar
// o terreirinho-modelo. Nunca devolve a senha de verdade pro cliente
export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: CORS });

  let body;
  try { body = await request.json(); }
  catch (e) { return new Response(JSON.stringify({ ok: false }), { status: 400, headers: CORS }); }

  const senha = body.senha || '';
  const ok = !!env.PADRAO_PASSWORD && senha === env.PADRAO_PASSWORD;

  return new Response(JSON.stringify({ ok }), { status: 200, headers: CORS });
}
