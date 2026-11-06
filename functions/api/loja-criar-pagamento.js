/**
 * Cloudflare Pages Function: cria um link de pagamento hospedado no
 * InfinitePay pra um pedido da loja Flora, e devolve a URL pra onde o
 * navegador redireciona a pessoa pra pagar.
 * -------------------------------------------------------------------------
 * Mesma conta/serviço já usado pela rifa e pela venda de camiseta — não
 * precisa de nenhum Secret novo no Cloudflare Pages, só o handle público da
 * conta (INFINITEPAY_HANDLE). Antes essa rota usava o Mercado Pago (exigia
 * env.MP_ACCESS_TOKEN) — se por qualquer motivo a chamada ao InfinitePay
 * falhar (API fora do ar, etc.), essa rota devolve erro e o loja.html cai no
 * fluxo manual (combina o pagamento por WhatsApp) — não trava a loja, só
 * adia a parte automática.
 *
 * Depois do pagamento, o InfinitePay redireciona a pessoa de volta pra
 * loja.html?pagamento=sucesso&pedido=ID (mais os parâmetros próprios dele,
 * como slug e transaction_nsu) — o loja.html então chama
 * /api/loja-verificar-pagamento pra confirmar de verdade (nunca confia só no
 * que vem pela URL) antes de marcar o pedido como pago no Firestore.
 */

const INFINITEPAY_HANDLE = 'bolhasdeluz';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

export async function onRequestOptions() {
  return new Response(null, { headers: CORS });
}

function formatarTelefoneE164(telefone) {
  const digitos = String(telefone || '').replace(/\D/g, '');
  if (!digitos) return undefined;
  return digitos.startsWith('55') && digitos.length >= 12 ? `+${digitos}` : `+55${digitos}`;
}

export async function onRequestPost(context) {
  const { request } = context;

  try {
    const body = await request.json();
    const { pedidoId, itens, taxaEntrega, cliente } = body;

    if (!pedidoId || !Array.isArray(itens) || !itens.length) {
      return new Response(JSON.stringify({ error: 'Dados do pedido incompletos.' }), { status: 400, headers: CORS });
    }

    const origem = new URL(request.url).origin;

    const items = itens.map(i => ({
      quantity: Math.max(1, parseInt(i.quantidade, 10) || 1),
      price: Math.round((Number(i.precoUnitario) || 0) * 100),
      description: [i.nome, i.tamanho, i.cor].filter(Boolean).join(' — ').slice(0, 250),
    }));
    if (Number(taxaEntrega) > 0) {
      items.push({ quantity: 1, price: Math.round(Number(taxaEntrega) * 100), description: 'Taxa de entrega' });
    }

    // order_nsu precisa ser único por tentativa de pagamento no InfinitePay —
    // reaproveita o próprio id do pedido no Firestore (já é único), igual o
    // Mercado Pago fazia com external_reference
    const resp = await fetch('https://api.checkout.infinitepay.io/links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        handle: INFINITEPAY_HANDLE,
        order_nsu: pedidoId,
        redirect_url: `${origem}/loja.html?pagamento=sucesso&pedido=${encodeURIComponent(pedidoId)}`,
        items,
        ...(cliente && cliente.nome ? { customer: { name: cliente.nome, phone_number: formatarTelefoneE164(cliente.telefone) } } : {}),
      }),
    });

    const textoResp = await resp.text().catch(() => '');
    if (!resp.ok) {
      console.error('loja-criar-pagamento: erro ao criar link InfinitePay', resp.status, textoResp);
      return new Response(JSON.stringify({ error: 'Não consegui criar o pagamento agora.' }), { status: 502, headers: CORS });
    }
    let dados;
    try { dados = JSON.parse(textoResp); } catch { dados = {}; }
    const url = dados.url || dados.checkout_url || dados.payment_url || dados.link || null;
    if (!url) {
      console.error('loja-criar-pagamento: resposta do InfinitePay sem url', textoResp);
      return new Response(JSON.stringify({ error: 'Não consegui criar o pagamento agora.' }), { status: 502, headers: CORS });
    }
    return new Response(JSON.stringify({ checkoutUrl: url }), { headers: CORS });
  } catch (e) {
    console.error('loja-criar-pagamento:', e);
    return new Response(JSON.stringify({ error: 'Erro inesperado ao criar o pagamento.' }), { status: 500, headers: CORS });
  }
}
