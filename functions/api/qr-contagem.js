// Cloudflare Pages Function: /api/qr-contagem
// Consulta as contagens de leitura dos links curtos de QR code (/ir/:slug),
// guardadas em "qr:contagem:<slug>" no KV MENU_DATA. Só admin — os números
// em si não são segredo, mas não faz sentido expor publicamente.

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

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response('', { status: 200, headers: CORS });
  }
  if (request.method !== 'GET') {
    return json({ error: 'Método não suportado' }, 405);
  }
  if (request.headers.get('X-Admin-Password') !== ADMIN_PASSWORD) {
    return json({ error: 'Não autorizado' }, 403);
  }

  const KV = env.MENU_DATA;
  if (!KV) return json({ error: 'KV não configurado.' }, 500);

  try {
    const list = await KV.list({ prefix: 'qr:contagem:' });
    const contagens = {};
    await Promise.all(list.keys.map(async k => {
      const slug = k.name.replace('qr:contagem:', '');
      contagens[slug] = parseInt((await KV.get(k.name)) || '0', 10);
    }));
    return json(contagens);
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}
