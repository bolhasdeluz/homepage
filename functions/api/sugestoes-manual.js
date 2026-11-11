// Cloudflare Pages Function: /api/sugestoes-manual
// -----------------------------------------------------------------------
// Mural de sugestões pro Manual de Boas-Vindas da casa — qualquer um
// escreve o que acha que devia estar no manual, e todo mundo vê a lista
// de sugestões de todo mundo, mas sem saber quem escreveu cada uma: o
// registro nunca guarda nome, e-mail ou qualquer outro dado de quem
// enviou, só o texto e a data. GET e POST são públicos (sem login); só
// apagar uma sugestão (moderação) exige o mesmo X-Admin-Password usado
// nos outros endpoints administrativos do site.
// Guardado como uma lista única em MENU_DATA (chave "sugestoes-manual:lista")
// — volume esperado é baixo (dezenas/poucas centenas de sugestões).

const ADMIN_PASSWORD = 'admin';
const TEXTO_MAX = 1000;
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
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

  const KV = env.MENU_DATA;
  if (!KV) return json({ error: 'KV não configurado.' }, 500);

  const method = request.method;

  try {
    const lista = (await KV.get('sugestoes-manual:lista', { type: 'json' })) || [];

    // GET — pública, lista completa (sem nenhum dado de quem enviou)
    if (method === 'GET') {
      const ordenada = lista.slice().sort((a, b) => (b.criadoEm || 0) - (a.criadoEm || 0));
      return json({ sugestoes: ordenada });
    }

    // POST — pública, qualquer um pode enviar uma sugestão
    if (method === 'POST') {
      const body = await request.json();
      const texto = String(body.texto || '').trim();
      if (!texto) return json({ error: 'Escreve a sugestão antes de enviar.' }, 400);
      if (texto.length > TEXTO_MAX) {
        return json({ error: `Sugestão muito longa (máximo ${TEXTO_MAX} caracteres).` }, 400);
      }
      const nova = {
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        texto,
        criadoEm: Date.now(),
      };
      lista.push(nova);
      await KV.put('sugestoes-manual:lista', JSON.stringify(lista));
      return json({ ok: true, sugestao: nova });
    }

    // DELETE — só a admin, pra moderação (ex: sugestão ofensiva ou spam)
    if (method === 'DELETE') {
      if (request.headers.get('X-Admin-Password') !== ADMIN_PASSWORD) {
        return json({ error: 'Não autorizado' }, 403);
      }
      const body = await request.json();
      const id = String(body.id || '');
      if (!id) return json({ error: 'Informe o id da sugestão.' }, 400);
      const restante = lista.filter(s => s.id !== id);
      await KV.put('sugestoes-manual:lista', JSON.stringify(restante));
      return json({ ok: true });
    }

    return json({ error: 'Método não suportado' }, 405);

  } catch (e) {
    return json({ error: e.message }, 500);
  }
}
