// Cloudflare Pages Function: /api/visita
// Contador simples de acessos diários ao site — toda vez que o index.html
// carrega, ele chama POST aqui, que soma 1 no contador do dia (UTC) no KV
// MENU_DATA (chave "visita:YYYY-MM-DD"). GET (só admin) devolve a contagem
// dos últimos dias, mais recente primeiro, pro painel de administração.

const ADMIN_PASSWORD = 'admin';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Password',
  'Content-Type': 'application/json',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

function diaUTC(data) {
  return data.toISOString().slice(0, 10); // YYYY-MM-DD
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response('', { status: 200, headers: CORS });
  }

  const KV = env.MENU_DATA;
  if (!KV) return json({ error: 'KV não configurado.' }, 500);

  if (request.method === 'POST') {
    const chave = `visita:${diaUTC(new Date())}`;
    const atual = parseInt(await KV.get(chave), 10) || 0;
    await KV.put(chave, String(atual + 1));
    return json({ ok: true });
  }

  if (request.method === 'GET') {
    if (request.headers.get('X-Admin-Password') !== ADMIN_PASSWORD) {
      return json({ error: 'Não autorizado' }, 403);
    }
    const url = new URL(request.url);
    const dias = Math.min(60, Math.max(1, parseInt(url.searchParams.get('dias'), 10) || 14));
    const agora = new Date();
    const datas = [];
    for (let i = 0; i < dias; i++) {
      datas.push(diaUTC(new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate() - i))));
    }
    const contagens = await Promise.all(datas.map(d => KV.get(`visita:${d}`)));
    const resultado = datas.map((dia, i) => ({ dia, contagem: parseInt(contagens[i], 10) || 0 }));
    return json({ dias: resultado });
  }

  return json({ error: 'Método não suportado' }, 405);
}
