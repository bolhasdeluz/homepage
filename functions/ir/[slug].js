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
};

export async function onRequestGet(context) {
  const { params, env, request } = context;
  const slug = params.slug;
  const destino = DESTINOS[slug];
  if (!destino) return new Response('Link não encontrado.', { status: 404 });

  const KV = env.MENU_DATA;
  if (KV) {
    const agora = Date.now();
    const chave = `qr:leitura:${slug}:${agora}-${Math.random().toString(36).slice(2, 7)}`;
    await KV.put(chave, String(agora));
  }

  return Response.redirect(new URL(destino, request.url).toString(), 302);
}
