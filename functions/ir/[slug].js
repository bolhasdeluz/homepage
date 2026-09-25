// Cloudflare Pages Function: /ir/:slug
// Link curto e permanente pra usar em QR codes impressos — o QR nunca
// muda, mas dá pra saber quantas vezes ele foi lido (cada acesso incrementa
// um contador no KV antes de redirecionar) e, no futuro, trocar o destino
// sem precisar gerar/reimprimir um QR novo.
//
// Reaproveita o KV MENU_DATA (mesmo de perfil.js, menu.js, rifa.js e
// cosme.js) — contagem fica em "qr:contagem:<slug>".

const DESTINOS = {
  cosmes: '/cosmes',
};

export async function onRequestGet(context) {
  const { params, env, request } = context;
  const slug = params.slug;
  const destino = DESTINOS[slug];
  if (!destino) return new Response('Link não encontrado.', { status: 404 });

  const KV = env.MENU_DATA;
  if (KV) {
    const chave = `qr:contagem:${slug}`;
    const atual = parseInt((await KV.get(chave)) || '0', 10);
    await KV.put(chave, String(atual + 1));
  }

  return Response.redirect(new URL(destino, request.url).toString(), 302);
}
