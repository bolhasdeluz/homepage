/**
 * Cloudflare Pages Function: cria uma preferência de pagamento no Mercado
 * Pago (Checkout Pro) pra um pedido da loja Flora, e devolve o link
 * (init_point) pra onde o navegador redireciona a pessoa pra pagar.
 * -------------------------------------------------------------------------
 * Precisa de env.MP_ACCESS_TOKEN configurado como Secret no Cloudflare Pages
 * (Settings > Environment variables) — o Access Token de uma conta do
 * Mercado Pago (developers.mercadopago.com.br > Suas integrações > sua
 * aplicação > Credenciais). Enquanto esse segredo não existir, essa rota
 * devolve 503 e o site cai no fluxo manual (combina o pagamento por
 * WhatsApp) — não trava a loja, só adia a parte automática.
 *
 * Depois do pagamento, o Mercado Pago redireciona a pessoa de volta pra
 * loja.html com ?pagamento=sucesso&pedido=ID&payment_id=XXX na URL — o
 * loja.html então chama /api/loja-verificar-pagamento pra confirmar de
 * verdade (nunca confia só no que vem pela URL) antes de marcar o pedido
 * como pago no Firestore.
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

export async function onRequestOptions() {
  return new Response(null, { headers: CORS });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.MP_ACCESS_TOKEN) {
    return new Response(JSON.stringify({ error: 'Pagamento ainda não configurado nesse site.' }), { status: 503, headers: CORS });
  }

  try {
    const body = await request.json();
    const { pedidoId, itens, cliente } = body;

    if (!pedidoId || !Array.isArray(itens) || !itens.length) {
      return new Response(JSON.stringify({ error: 'Dados do pedido incompletos.' }), { status: 400, headers: CORS });
    }

    const origem = new URL(request.url).origin;

    const items = itens.map(i => ({
      title: [i.nome, i.tamanho, i.cor].filter(Boolean).join(' — ').slice(0, 250),
      quantity: Math.max(1, parseInt(i.quantidade, 10) || 1),
      unit_price: Number(i.precoUnitario) || 0,
      currency_id: 'BRL',
    }));

    const preferencia = {
      items,
      payer: cliente && cliente.nome ? { name: cliente.nome } : undefined,
      back_urls: {
        success: `${origem}/loja.html?pagamento=sucesso&pedido=${encodeURIComponent(pedidoId)}`,
        failure: `${origem}/loja.html?pagamento=falhou&pedido=${encodeURIComponent(pedidoId)}`,
        pending: `${origem}/loja.html?pagamento=pendente&pedido=${encodeURIComponent(pedidoId)}`,
      },
      auto_return: 'approved',
      external_reference: pedidoId,
      statement_descriptor: 'FLORA BOLHAS DE LUZ',
    };

    const resp = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.MP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(preferencia),
    });

    if (!resp.ok) {
      console.error('erro mercado pago:', await resp.text());
      return new Response(JSON.stringify({ error: 'Não consegui criar o pagamento agora.' }), { status: 502, headers: CORS });
    }

    const dados = await resp.json();
    return new Response(JSON.stringify({ initPoint: dados.init_point || dados.sandbox_init_point }), { headers: CORS });
  } catch (e) {
    console.error('loja-criar-pagamento:', e);
    return new Response(JSON.stringify({ error: 'Erro inesperado ao criar o pagamento.' }), { status: 500, headers: CORS });
  }
}
