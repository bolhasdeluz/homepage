// functions/api/seed-staging.js
// Copia todo o conteúdo dos KV de produção pros seus pares "_STAGING" —
// usado pra popular (ou "resetar") o ambiente de teste com uma cópia real
// dos dados de produção. Só precisa rodar uma vez (ou de novo, sempre que
// quiser que o ambiente de teste volte a ficar igual à produção).
//
// Não depende do functions/_middleware.js (que troca os bindings quando o
// domínio é de preview): aqui os nomes de origem e destino são explícitos,
// então funciona igual não importa por qual domínio for chamado — e nunca
// escreve em nada de produção, só lê de lá.
const ADMIN_PASSWORD = 'admin';

const PARES = [
  ['MENU_DATA', 'MENU_DATA_STAGING'],
  ['TESOURARIA_KV', 'TESOURARIA_KV_STAGING'],
  ['LOJAS_KV', 'LOJAS_KV_STAGING'],
  ['SESSOES_KV', 'SESSOES_KV_STAGING'],
];

async function copiarNamespace(origem, destino) {
  let copiados = 0;
  let cursor;
  do {
    const lista = await origem.list(cursor ? { cursor } : {});
    for (const { name } of lista.keys) {
      const valor = await origem.get(name);
      if (valor !== null) {
        await destino.put(name, valor);
        copiados++;
      }
    }
    cursor = lista.list_complete ? null : lista.cursor;
  } while (cursor);
  return copiados;
}

export async function onRequestPost({ request, env }) {
  const headers = { 'Content-Type': 'application/json' };

  if (request.headers.get('X-Admin-Password') !== ADMIN_PASSWORD) {
    return new Response(JSON.stringify({ erro: 'Não autorizado' }), { status: 401, headers });
  }

  const resultado = {};
  for (const [nomeOrigem, nomeDestino] of PARES) {
    const origem = env[nomeOrigem];
    const destino = env[nomeDestino];
    if (!origem || !destino) { resultado[nomeOrigem] = 'binding ausente'; continue; }
    resultado[nomeOrigem] = await copiarNamespace(origem, destino);
  }

  return new Response(JSON.stringify(resultado), { headers });
}
