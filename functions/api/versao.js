// Cloudflare Pages Function: /api/versao
// Devolve o hash do commit que está de fato rodando nessa Function — serve
// pra conferir se um deploy novo já propagou (ex.: depois de um merge, dá
// pra comparar o hash mostrado no rodapé do site com o hash do commit no
// GitHub, sem precisar acessar o painel do Cloudflare). O CF_PAGES_COMMIT_SHA
// é preenchido automaticamente pelo Cloudflare em todo deploy — não precisa
// configurar nada.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};

export async function onRequestGet(context) {
  const { env } = context;
  return new Response(JSON.stringify({
    sha: env.CF_PAGES_COMMIT_SHA || null,
    branch: env.CF_PAGES_BRANCH || null,
    // horário do servidor na hora dessa chamada (não é o horário do deploy
    // em si, o Cloudflare não expõe isso) — serve pra confirmar que a
    // resposta é "ao vivo" e não veio de algum cache
    horario: Date.now(),
  }), { headers: CORS });
}
