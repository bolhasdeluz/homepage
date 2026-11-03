// Cloudflare Pages Function: /api/versao
// Devolve o hash do commit que está de fato rodando nessa Function — serve
// pra conferir se um deploy novo já propagou (ex.: depois de um merge, dá
// pra comparar o hash mostrado no rodapé do site com o hash do commit no
// GitHub, sem precisar acessar o painel do Cloudflare). O CF_PAGES_COMMIT_SHA
// é preenchido automaticamente pelo Cloudflare em todo deploy — não precisa
// configurar nada.
//
// O Cloudflare não expõe o horário do deploy em si — então o horário do
// commit (via API pública do GitHub, repositório é público) serve de
// aproximação bem próxima, já que o deploy dispara automaticamente a cada
// push. Guardado em cache no KV por sha (o horário de um commit nunca muda),
// pra só bater na API do GitHub uma vez por deploy, não a cada carregada de
// página — evita esbarrar na cota de requisições sem autenticação do GitHub.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};
const GITHUB_REPO = 'bolhasdeluz/homepage';

async function horarioDoCommit(env, sha) {
  if (!sha) return null;
  const KV = env.MENU_DATA;
  const chaveCache = 'versao:commit-horario:' + sha;
  if (KV) {
    const cacheado = await KV.get(chaveCache).catch(() => null);
    if (cacheado) return cacheado;
  }
  try {
    const resp = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/commits/${sha}`, {
      headers: { 'User-Agent': 'bolhasdeluz-site', 'Accept': 'application/vnd.github+json' },
    });
    if (!resp.ok) return null;
    const dados = await resp.json();
    const data = dados?.commit?.committer?.date || dados?.commit?.author?.date || null;
    if (data && KV) await KV.put(chaveCache, data).catch(() => {});
    return data;
  } catch (e) {
    return null;
  }
}

export async function onRequestGet(context) {
  const { env } = context;
  const sha = env.CF_PAGES_COMMIT_SHA || null;
  const horarioCommit = await horarioDoCommit(env, sha);
  return new Response(JSON.stringify({
    sha,
    branch: env.CF_PAGES_BRANCH || null,
    // horário do commit (aproxima o do deploy) quando conseguiu buscar;
    // senão cai pro horário do servidor nessa chamada, só pra confirmar que
    // a resposta é "ao vivo" e não veio de algum cache
    horario: horarioCommit || Date.now(),
    horarioEhDoDeploy: !!horarioCommit,
  }), { headers: CORS });
}
