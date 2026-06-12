// Cloudflare Pages Function: /api/notes
// Lê e salva notas no Cloudflare KV (substitui Netlify Blobs)
// GET  /api/notes?key=p123_x_studio_caboclo  → { text: "..." }
// POST /api/notes  body: { key, text }        → { ok: true }

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json',
};

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response('', { status: 200, headers: CORS });
  }

  const kv = env.NOTAS_GUIAS;

  if (!kv) {
    return new Response(
      JSON.stringify({ error: 'KV binding não configurado.' }),
      { status: 500, headers: CORS }
    );
  }

  // ── GET ──────────────────────────────────────────────────────
  if (request.method === 'GET') {
    const url = new URL(request.url);
    const key = url.searchParams.get('key');

    if (!key) {
      return new Response(
        JSON.stringify({ error: 'Parâmetro "key" obrigatório.' }),
        { status: 400, headers: CORS }
      );
    }

    const text = await kv.get(key) ?? '';
    return new Response(JSON.stringify({ text }), { status: 200, headers: CORS });
  }

  // ── POST ─────────────────────────────────────────────────────
  if (request.method === 'POST') {
    let body;
    try {
      body = await request.json();
    } catch {
      return new Response(
        JSON.stringify({ error: 'Body JSON inválido.' }),
        { status: 400, headers: CORS }
      );
    }

    const { key, text } = body;

    if (!key) {
      return new Response(
        JSON.stringify({ error: 'Campo "key" obrigatório.' }),
        { status: 400, headers: CORS }
      );
    }

    await kv.put(key, text || '');
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: CORS });
  }

  return new Response('Method Not Allowed', { status: 405, headers: CORS });
}
