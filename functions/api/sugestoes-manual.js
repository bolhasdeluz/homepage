// Cloudflare Pages Function: /api/sugestoes-manual
// -----------------------------------------------------------------------
// Mural de sugestões pro Manual de Boas-Vindas da casa — qualquer um
// escreve o que acha que devia estar no manual, e todo mundo vê a lista
// de sugestões de todo mundo, mas sem saber quem escreveu cada uma: o
// registro nunca guarda nome, e-mail ou qualquer outro dado de quem
// enviou, só o texto e a data. GET e POST são públicos (sem login); só
// apagar (moderação) exige o mesmo X-Admin-Password usado nos outros
// endpoints administrativos do site.
// Cada sugestão pode ganhar "complementos" — respostas penduradas nela
// (mesmo molde: só texto e data, nunca autor), pra funcionar tipo um
// fórum simples em vez de só uma lista solta de posts independentes.
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

    // POST — pública, qualquer um pode enviar uma sugestão ou, se mandar
    // sugestaoId, um complemento pendurado numa sugestão já existente
    if (method === 'POST') {
      const body = await request.json();
      const texto = String(body.texto || '').trim();
      if (!texto) return json({ error: 'Escreve o texto antes de enviar.' }, 400);
      if (texto.length > TEXTO_MAX) {
        return json({ error: `Texto muito longo (máximo ${TEXTO_MAX} caracteres).` }, 400);
      }

      const sugestaoId = body.sugestaoId ? String(body.sugestaoId) : null;
      if (sugestaoId) {
        const alvo = lista.find(s => s.id === sugestaoId);
        if (!alvo) return json({ error: 'Sugestão não encontrada.' }, 404);
        const novoComplemento = {
          id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
          texto,
          criadoEm: Date.now(),
        };
        if (!Array.isArray(alvo.complementos)) alvo.complementos = [];
        alvo.complementos.push(novoComplemento);
        await KV.put('sugestoes-manual:lista', JSON.stringify(lista));
        return json({ ok: true, complemento: novoComplemento });
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

    // DELETE — só a admin, pra moderação (ex: post ofensivo ou spam). Manda
    // complementoId pra apagar só um complemento; só id pra apagar a
    // sugestão inteira (e os complementos dela junto).
    if (method === 'DELETE') {
      if (request.headers.get('X-Admin-Password') !== ADMIN_PASSWORD) {
        return json({ error: 'Não autorizado' }, 403);
      }
      const body = await request.json();
      const id = String(body.id || '');
      if (!id) return json({ error: 'Informe o id da sugestão.' }, 400);

      const complementoId = body.complementoId ? String(body.complementoId) : null;
      if (complementoId) {
        const alvo = lista.find(s => s.id === id);
        if (!alvo) return json({ error: 'Sugestão não encontrada.' }, 404);
        alvo.complementos = (alvo.complementos || []).filter(c => c.id !== complementoId);
        await KV.put('sugestoes-manual:lista', JSON.stringify(lista));
        return json({ ok: true });
      }

      const restante = lista.filter(s => s.id !== id);
      await KV.put('sugestoes-manual:lista', JSON.stringify(restante));
      return json({ ok: true });
    }

    return json({ error: 'Método não suportado' }, 405);

  } catch (e) {
    return json({ error: e.message }, 500);
  }
}
