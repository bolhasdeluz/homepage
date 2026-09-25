// Cloudflare Pages Function: /api/qr-contagem
// Consulta as leituras dos links curtos de QR code (/ir/:slug), guardadas
// em "qr:leitura:<slug>:<timestamp>-<rand>" no KV MENU_DATA. Retorna, por
// slug, a lista de horários de leitura (mais recente primeiro) — a
// contagem é só o tamanho dessa lista. Só admin.

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
    const list = await KV.list({ prefix: 'qr:leitura:' });
    const porSlug = {};
    list.keys.forEach(k => {
      // formato da chave: qr:leitura:<slug>:<timestamp>-<rand>
      const resto = k.name.slice('qr:leitura:'.length);
      const doisPontos = resto.lastIndexOf(':');
      const slug = resto.slice(0, doisPontos);
      const timestamp = parseInt(resto.slice(doisPontos + 1).split('-')[0], 10);
      if (!porSlug[slug]) porSlug[slug] = [];
      if (!isNaN(timestamp)) porSlug[slug].push(timestamp);
    });
    Object.values(porSlug).forEach(arr => arr.sort((a, b) => b - a));
    return json(porSlug);
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}
