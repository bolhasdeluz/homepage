// Cloudflare Pages Function: /api/sessoes-linhas
// Lista de "linhas de trabalho" (Caboclo, Preto Velho, Exu, Cigano, Cosme,
// Desenvolvimento...) selecionáveis no campo Nome da sessão — começa com as
// linhas que a casa já trabalha hoje e cresce conforme a admin adiciona
// novas direto no formulário. Guardada como um array só no KV (SESSOES_KV),
// chave "linhas_trabalho".

const ADMIN_PASSWORD = 'admin';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Password',
  'Content-Type': 'application/json',
};
const CHAVE = 'linhas_trabalho';
const PADRAO = ['Caboclo', 'Preto Velho', 'Exu', 'Cigano', 'Cosme', 'Desenvolvimento'];

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') return new Response('', { status: 200, headers: CORS });

  const KV = env.SESSOES_KV;
  if (!KV) return json({ error: 'KV não configurado.' }, 500);

  try {
    if (request.method === 'GET') {
      const salvas = await KV.get(CHAVE, { type: 'json' });
      return json(Array.isArray(salvas) && salvas.length ? salvas : PADRAO);
    }

    if (request.headers.get('X-Admin-Password') !== ADMIN_PASSWORD) {
      return json({ error: 'Não autorizado' }, 403);
    }

    // POST — adiciona uma linha nova (ignora se já existir, comparando sem
    // diferenciar maiúsculas/minúsculas) e devolve a lista inteira atualizada
    if (request.method === 'POST') {
      const body = await request.json();
      const nova = String(body.nome || '').trim();
      if (!nova) return json({ error: 'nome obrigatório' }, 400);
      const atuais = (await KV.get(CHAVE, { type: 'json' })) || PADRAO;
      const jaExiste = atuais.some(l => l.toLowerCase() === nova.toLowerCase());
      const lista = jaExiste ? atuais : [...atuais, nova].sort((a, b) => a.localeCompare(b));
      await KV.put(CHAVE, JSON.stringify(lista));
      return json(lista);
    }

    return json({ error: 'Método não suportado' }, 405);
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}
