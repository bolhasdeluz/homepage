/**
 * Cloudflare Pages Function: gerenciar arquivos de assets/objetos/ no GitHub
 * -------------------------------------------------------------------------
 * Deixa o admin excluir ou renomear um arquivo de imagem direto do repositório,
 * sem precisar mexer no GitHub na mão. Usa a Contents API do GitHub com um
 * token de escrita (env.GITHUB_TOKEN — token pessoal com permissão de
 * escrita no repo, configurado como Secret no Cloudflare Pages).
 *
 * Protegido pela mesma senha simples usada em outras rotas administrativas
 * do site (X-Admin-Password), porque esse endpoint pode apagar arquivos de
 * verdade do repositório.
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Password',
  'Content-Type': 'application/json',
};

const ADMIN_PASSWORD = 'admin';
const REPO = 'bolhasdeluz/homepage';
const PASTA = 'assets/objetos';

export async function onRequestOptions() {
  return new Response(null, { headers: CORS });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    if (request.headers.get('X-Admin-Password') !== ADMIN_PASSWORD) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }), { status: 401, headers: CORS });
    }
    if (!env.GITHUB_TOKEN) {
      return new Response(JSON.stringify({ error: 'GITHUB_TOKEN não configurado no Cloudflare Pages' }), { status: 500, headers: CORS });
    }

    const body = await request.json();
    const { acao, caminho, novoNome } = body;
    if (!caminho || !caminho.startsWith(PASTA + '/') || caminho.includes('..')) {
      return new Response(JSON.stringify({ error: 'Caminho inválido' }), { status: 400, headers: CORS });
    }

    const headersGithub = {
      'Authorization': `token ${env.GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'bolhasdeluz-terreirinho',
    };

    const infoRes = await fetch(`https://api.github.com/repos/${REPO}/contents/${caminho}`, { headers: headersGithub });
    if (!infoRes.ok) {
      return new Response(JSON.stringify({ error: 'Não achei esse arquivo no GitHub' }), { status: 404, headers: CORS });
    }
    const info = await infoRes.json();

    if (acao === 'excluir') {
      const delRes = await fetch(`https://api.github.com/repos/${REPO}/contents/${caminho}`, {
        method: 'DELETE',
        headers: { ...headersGithub, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `Remove ${caminho} via admin da Terreirinha`, sha: info.sha, branch: 'main' }),
      });
      if (!delRes.ok) {
        console.error('erro excluir github:', await delRes.text());
        return new Response(JSON.stringify({ error: 'Não consegui excluir no GitHub' }), { status: 502, headers: CORS });
      }
      return new Response(JSON.stringify({ ok: true }), { headers: CORS });
    }

    if (acao === 'renomear') {
      if (!novoNome || /[\/\\]/.test(novoNome) || !novoNome.trim()) {
        return new Response(JSON.stringify({ error: 'Nome novo inválido' }), { status: 400, headers: CORS });
      }
      // mantém o arquivo na mesma (sub)pasta em que já estava — renomear não
      // deveria também mover ele pra pasta raiz sem querer
      const pastaAtual = caminho.substring(0, caminho.lastIndexOf('/'));
      const novoCaminho = `${pastaAtual}/${novoNome.trim()}`;
      const existeRes = await fetch(`https://api.github.com/repos/${REPO}/contents/${novoCaminho}`, { headers: headersGithub });
      if (existeRes.ok) {
        return new Response(JSON.stringify({ error: 'Já existe um arquivo com esse nome' }), { status: 409, headers: CORS });
      }

      const criarRes = await fetch(`https://api.github.com/repos/${REPO}/contents/${novoCaminho}`, {
        method: 'PUT',
        headers: { ...headersGithub, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `Renomeia ${caminho} -> ${novoCaminho} via admin da Terreirinha`, content: info.content, branch: 'main' }),
      });
      if (!criarRes.ok) {
        console.error('erro criar novo nome github:', await criarRes.text());
        return new Response(JSON.stringify({ error: 'Não consegui criar o arquivo com o nome novo' }), { status: 502, headers: CORS });
      }

      const delRes = await fetch(`https://api.github.com/repos/${REPO}/contents/${caminho}`, {
        method: 'DELETE',
        headers: { ...headersGithub, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `Remove ${caminho} (renomeado pra ${novoCaminho})`, sha: info.sha, branch: 'main' }),
      });
      if (!delRes.ok) {
        console.error('erro excluir arquivo antigo apos renomear:', await delRes.text());
        return new Response(JSON.stringify({ error: 'Criei o arquivo novo mas não consegui apagar o antigo — apaga ele na mão', novoCaminho }), { status: 502, headers: CORS });
      }
      return new Response(JSON.stringify({ ok: true, novoCaminho }), { headers: CORS });
    }

    return new Response(JSON.stringify({ error: 'Ação desconhecida' }), { status: 400, headers: CORS });
  } catch (e) {
    console.error('erro geral gerenciar-arquivo-github:', e);
    return new Response(JSON.stringify({ error: 'Erro interno' }), { status: 500, headers: CORS });
  }
}
