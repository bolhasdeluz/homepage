// Cloudflare Pages Function: /texto/:id
// Página "de empréstimo" pra compartilhar um Texto específico — serve um
// HTML mínimo com meta tags Open Graph (título, descrição, imagem) pra
// quando o link é colado no WhatsApp/Instagram/etc. gerar uma prévia com
// miniatura, já que o rastreador desses apps não executa JavaScript e por
// isso nunca veria o conteúdo renderizado pela Single Page Application.
// Quem realmente clica no link (navegador de verdade, com JS) é redirecionado
// na hora pro site normal, já abrindo o texto certo.

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function html(body, status = 200) {
  return new Response(body, { status, headers: { 'Content-Type': 'text/html; charset=UTF-8', 'Cache-Control': 'no-store' } });
}

export async function onRequestGet(context) {
  const { params, env, request } = context;
  const idParam = params.id;
  const origin = new URL(request.url).origin;

  const KV = env.MENU_DATA;
  const texto = KV ? await KV.get(`texto:${idParam}`, { type: 'json' }) : null;

  if (!texto) {
    return html(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<title>Texto não encontrado — Bolhas de Luz</title>
<meta http-equiv="refresh" content="0; url=${origin}/#pagina=textos">
<script>location.replace('${origin}/#pagina=textos');</script>
</head><body><p>Texto não encontrado. <a href="${origin}/#pagina=textos">Ir pra página de Textos</a></p></body></html>`, 404);
  }

  const titulo = escapeHtml(texto.titulo);
  const corpoPlano = String(texto.corpo || '').replace(/\s+/g, ' ').trim();
  const descricao = escapeHtml(corpoPlano.slice(0, 180) + (corpoPlano.length > 180 ? '…' : ''));
  const destino = `${origin}/#pagina=textos&texto=${encodeURIComponent(idParam)}`;
  const imagem = `${origin}/assets/icon.png`;

  return html(`<!DOCTYPE html><html lang="pt-BR"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${titulo} — Bolhas de Luz</title>
<meta name="description" content="${descricao}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Terreiro Bolhas de Luz">
<meta property="og:title" content="${titulo}">
<meta property="og:description" content="${descricao}">
<meta property="og:image" content="${imagem}">
<meta property="og:url" content="${origin}/texto/${encodeURIComponent(idParam)}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${titulo}">
<meta name="twitter:description" content="${descricao}">
<meta name="twitter:image" content="${imagem}">
<meta http-equiv="refresh" content="0; url=${destino}">
<script>location.replace('${destino}');</script>
</head><body>
<p>Abrindo <a href="${destino}">${titulo}</a>…</p>
</body></html>`);
}
