// Cloudflare Pages Function: /api/estoque
// -----------------------------------------------------------------------
// Lista de compras / controle de estoque anual de materiais — a Anna quer
// planejar quanto precisa comprar de cada material pro ano todo, separado
// do controle por sessão (ver /api/sessoes, campo "materiais", usado em
// materiais.html pra marcar o que foi gasto em cada sessão específica).
// Um registro por ano: { ano, materiais: { "Vela": 12, ... }, atualizadoEm }.
// GET é pública (só leitura, nada sensível); escrita exige o mesmo
// X-Admin-Password usado nos outros endpoints administrativos do site.

const ADMIN_PASSWORD = 'admin';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Password',
  'Content-Type': 'application/json',
};

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response('', { status: 200, headers: CORS });
  }

  const KV = env.MENU_DATA;
  if (!KV) return json({ error: 'KV não configurado.' }, 500);

  const url = new URL(request.url);
  const method = request.method;

  try {
    // GET ?ano=2026 — pública
    if (method === 'GET') {
      const ano = (url.searchParams.get('ano') || '').trim();
      if (!ano) return json({ error: 'Informe o ano.' }, 400);
      const dados = await KV.get(`estoque:${ano}`, { type: 'json' });
      return json(dados || { ano, materiais: {} });
    }

    if (request.headers.get('X-Admin-Password') !== ADMIN_PASSWORD) {
      return json({ error: 'Não autorizado' }, 403);
    }
    const body = await request.json();

    // PUT — substitui a lista de quantidades do ano inteiro (a página manda
    // o mapa completo a cada alteração, já que é só uma linha por material)
    if (method === 'PUT') {
      const ano = String(body.ano || '').trim();
      if (!ano) return json({ error: 'Informe o ano.' }, 400);
      const materiais = {};
      Object.entries(body.materiais || {}).forEach(([nome, qtd]) => {
        const n = parseInt(qtd, 10);
        if (n > 0) materiais[String(nome)] = n;
      });
      const registro = { ano, materiais, atualizadoEm: Date.now() };
      await KV.put(`estoque:${ano}`, JSON.stringify(registro));
      return json(registro);
    }

    return json({ error: 'Método não suportado' }, 405);

  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}
