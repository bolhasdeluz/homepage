// functions/api/seed-staging.js
// Copia o conteúdo dos KV de produção pros seus pares "_STAGING" — usado
// pra popular (ou "resetar") o ambiente de teste com uma cópia real dos
// dados de produção. Só precisa rodar uma vez (ou de novo, sempre que
// quiser que o ambiente de teste volte a ficar igual à produção).
//
// Não depende do functions/_middleware.js (que troca os bindings quando o
// domínio é de preview): aqui os nomes de origem e destino são explícitos,
// então funciona igual não importa por qual domínio for chamado — e nunca
// escreve em nada de produção, só lê de lá.
//
// Copia em lotes pequenos (?par=NOME&cursor=...) em vez de tudo de uma vez,
// porque um namespace com muitas chaves (ex: SESSOES_KV) demora mais do que
// o tempo que o Cloudflare espera por uma resposta — cada chamada processa
// só um lote e devolve o cursor pra continuar na próxima.
const ADMIN_PASSWORD = 'admin';
const LOTE = 20;

const PARES = [
  ['MENU_DATA', 'MENU_DATA_STAGING'],
  ['TESOURARIA_KV', 'TESOURARIA_KV_STAGING'],
  ['LOJAS_KV', 'LOJAS_KV_STAGING'],
  ['SESSOES_KV', 'SESSOES_KV_STAGING'],
];

function json(dados, status = 200) {
  return new Response(JSON.stringify(dados), { status, headers: { 'Content-Type': 'application/json' } });
}

export async function onRequestPost({ request, env }) {
  if (request.headers.get('X-Admin-Password') !== ADMIN_PASSWORD) {
    return json({ erro: 'Não autorizado' }, 401);
  }

  const url = new URL(request.url);
  const par = url.searchParams.get('par');
  const cursorIn = url.searchParams.get('cursor') || undefined;

  if (!par) {
    return json({ pares: PARES.map(([nome]) => nome) });
  }

  const entrada = PARES.find(([nomeOrigem]) => nomeOrigem === par);
  if (!entrada) return json({ erro: 'par inválido', pares: PARES.map(([nome]) => nome) }, 400);

  const [nomeOrigem, nomeDestino] = entrada;
  const origem = env[nomeOrigem];
  const destino = env[nomeDestino];
  if (!origem || !destino) return json({ erro: `binding ausente para ${nomeOrigem} ou ${nomeDestino}` }, 500);

  const lista = await origem.list({ cursor: cursorIn, limit: LOTE });
  let copiados = 0;
  for (const { name } of lista.keys) {
    const valor = await origem.get(name);
    if (valor !== null) {
      await destino.put(name, valor);
      copiados++;
    }
  }

  return json({
    par,
    copiados,
    terminou: lista.list_complete,
    proximoCursor: lista.list_complete ? null : lista.cursor,
  });
}
