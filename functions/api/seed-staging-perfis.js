// functions/api/seed-staging-perfis.js
// Importação dos perfis (perfil:<email>, dentro do MENU_DATA) filtrada por
// GRUPO — separada do /api/seed-staging genérico porque aqui precisa olhar
// dentro do JSON de cada perfil (campo "grupo"), não só copiar bytes.
//
//  - GET ?contar=1 → só LÊ (nunca escreve) e devolve quantos perfis existem
//    por grupo, de produção. Não gasta nada da cota diária de ESCRITA do
//    Cloudflare — só leitura, que tem uma cota bem mais folgada.
//  - POST ?grupo=filhas&cursor=... → copia só os perfis daquele grupo pro
//    MENU_DATA_STAGING, em lotes pequenos (mesma ideia do seed-staging.js —
//    evita um request só tentando copiar tudo de uma vez e estourando a
//    cota de escrita). Repete a chamada com o cursor devolvido até "terminou".
const ADMIN_PASSWORD = 'admin';
const LOTE = 20;
const GRUPOS_LEGADO_PARA_ASSISTENCIA = new Set(['tamboreiro', 'amigos', 'familia']);

function grupoEfetivo(p) {
  if (p && p.ativo === false) return 'visitante';
  const g = p?.grupo || 'visitante';
  return GRUPOS_LEGADO_PARA_ASSISTENCIA.has(g) ? 'assistencia' : g;
}

function json(dados, status = 200) {
  return new Response(JSON.stringify(dados), { status, headers: { 'Content-Type': 'application/json' } });
}

// o Worker free plan tem um teto de operações de KV por invocação (bem menor
// que o de escritas por dia) — por isso a contagem também é paginada em
// lotes, como a cópia: cada chamada processa só um pedaço e devolve o cursor
// pra continuar, em vez de tentar ler todos os perfis de uma vez só.
const LOTE_CONTAGEM = 150;

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  if (url.searchParams.get('contar') !== '1') {
    return json({ erro: 'use ?contar=1 pra contar os perfis por grupo' }, 400);
  }
  const origem = env.MENU_DATA;
  if (!origem) return json({ erro: 'binding MENU_DATA ausente' }, 500);

  const cursorIn = url.searchParams.get('cursor') || undefined;
  const lista = await origem.list({ prefix: 'perfil:', cursor: cursorIn, limit: LOTE_CONTAGEM });
  const porGrupoLote = {};
  let verificados = 0;
  for (const { name } of lista.keys) {
    if (name === 'perfil:_index') continue;
    const raw = await origem.get(name);
    if (!raw) continue;
    try {
      const p = JSON.parse(raw);
      const g = grupoEfetivo(p);
      porGrupoLote[g] = (porGrupoLote[g] || 0) + 1;
      verificados++;
    } catch {}
  }

  return json({
    verificados,
    porGrupoLote,
    terminou: lista.list_complete,
    proximoCursor: lista.list_complete ? null : lista.cursor,
  });
}

export async function onRequestPost({ request, env }) {
  if (request.headers.get('X-Admin-Password') !== ADMIN_PASSWORD) {
    return json({ erro: 'Não autorizado' }, 401);
  }
  const url = new URL(request.url);
  const grupoAlvo = url.searchParams.get('grupo');
  const cursorIn = url.searchParams.get('cursor') || undefined;
  if (!grupoAlvo) {
    return json({ erro: 'informe ?grupo=filhas (ou visitante / assistencia / admin)' }, 400);
  }

  const origem = env.MENU_DATA;
  const destino = env.MENU_DATA_STAGING;
  if (!origem || !destino) return json({ erro: 'binding MENU_DATA ou MENU_DATA_STAGING ausente' }, 500);

  const lista = await origem.list({ prefix: 'perfil:', cursor: cursorIn, limit: LOTE });
  let copiados = 0, verificados = 0;
  for (const { name } of lista.keys) {
    if (name === 'perfil:_index') continue;
    verificados++;
    const raw = await origem.get(name);
    if (!raw) continue;
    try {
      const p = JSON.parse(raw);
      if (grupoEfetivo(p) === grupoAlvo) {
        await destino.put(name, raw);
        copiados++;
      }
    } catch {}
  }

  return json({
    grupo: grupoAlvo,
    verificados,
    copiados,
    terminou: lista.list_complete,
    proximoCursor: lista.list_complete ? null : lista.cursor,
  });
}
