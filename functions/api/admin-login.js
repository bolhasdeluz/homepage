const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

// só confirma se a senha bate com a variável de ambiente — nunca devolve a
// senha de verdade pro cliente, só diz certo/errado
export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: CORS });

  let body;
  try { body = await request.json(); }
  catch (e) { return new Response(JSON.stringify({ ok: false }), { status: 400, headers: CORS }); }

  const senha = body.senha || '';
  const ok = !!env.ADMIN_PASSWORD && senha === env.ADMIN_PASSWORD;

  return new Response(JSON.stringify({ ok }), { status: 200, headers: CORS });
}
