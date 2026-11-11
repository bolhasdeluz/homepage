// Cloudflare Pages Function: /ir/:slug
// Link curto e permanente pra usar em QR codes impressos — o QR nunca
// muda, mas cada leitura fica registrada com data e hora (não só um
// contador), e no futuro dá pra trocar o destino sem precisar
// gerar/reimprimir um QR novo.
//
// Reaproveita o KV MENU_DATA (mesmo de perfil.js, menu.js, rifa.js e
// cosme.js) — cada leitura vira uma chave própria
// "qr:leitura:<slug>:<timestamp>-<rand>", pra não ter que ler+escrever
// um contador único (evita leituras simultâneas pisarem uma na outra).

const DESTINOS = {
  cosmes: '/cosmes',
  rifa: '/rifa-digital',
  'rifa-presencial': '/rifa-presencial.html',
  // pra quem está vendendo rifa no local: escolhe quanto vendeu e mostra um
  // QR Code na hora, pra outro celular escanear e pagar (ver rifa-qrcode.html)
  'rifa-qrcode': '/rifa-qrcode.html',
  // a venda de camiseta mora dentro do site principal (pede login — ver
  // showPage('camiseta') no index.html), não é uma página solta como a rifa
  camiseta: '/#pagina=camiseta',
  site: '/',
  banner: '/proxima-sessao.html',
  materiais: '/materiais.html',
  sugestoes: '/sugestoes-manual.html',
};

export async function onRequestGet(context) {
  const { params, env, request } = context;
  const slug = params.slug;
  const KV = env.MENU_DATA;

  let destino = DESTINOS[slug];
  if (!destino && KV) {
    // slugs criados pela própria Anna no painel admin (ver /api/qr-slugs)
    const customizado = await KV.get(`qr:slug:${slug}`, { type: 'json' });
    if (customizado) destino = customizado.destino;
  }
  if (!destino) return new Response('Link não encontrado.', { status: 404 });

  if (KV) {
    const agora = Date.now();
    const chave = `qr:leitura:${slug}:${agora}-${Math.random().toString(36).slice(2, 7)}`;
    await KV.put(chave, String(agora));
  }

  return Response.redirect(new URL(destino, request.url).toString(), 302);
}
