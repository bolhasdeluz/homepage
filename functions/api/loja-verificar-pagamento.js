/**
 * Cloudflare Pages Function: confere no próprio Mercado Pago se um pagamento
 * foi aprovado de verdade, antes do site marcar o pedido como pago.
 * -------------------------------------------------------------------------
 * Depois do Checkout Pro, o Mercado Pago redireciona a pessoa de volta com
 * ?payment_id=XXX&pedido=YYY na URL — mas nunca dá pra confiar direto nesses
 * parâmetros (qualquer um pode digitar uma URL parecida na barra de
 * endereço). Essa rota pega o payment_id, pergunta pro Mercado Pago (com o
 * Access Token, do lado do servidor) qual é o status de verdade desse
 * pagamento, e confere se o pedido (external_reference) bate com o que foi
 * informado — só então o loja.html marca o pedido como pago no Firestore.
 *
 * Precisa de env.MP_ACCESS_TOKEN (mesmo segredo usado em
 * loja-criar-pagamento.js).
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

export async function onRequestOptions() {
  return new Response(null, { headers: CORS });
}

export async function onRequestGet(context) {
  const { request, env } = context;

  if (!env.MP_ACCESS_TOKEN) {
    return new Response(JSON.stringify({ error: 'Pagamento ainda não configurado nesse site.' }), { status: 503, headers: CORS });
  }

  const url = new URL(request.url);
  const paymentId = url.searchParams.get('payment_id');
  const pedidoId = url.searchParams.get('pedido');
  if (!paymentId || !pedidoId) {
    return new Response(JSON.stringify({ error: 'Faltou payment_id ou pedido na consulta.' }), { status: 400, headers: CORS });
  }

  try {
    const resp = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, {
      headers: { 'Authorization': `Bearer ${env.MP_ACCESS_TOKEN}` },
    });
    if (!resp.ok) {
      return new Response(JSON.stringify({ ok: false, error: 'Não consegui confirmar esse pagamento no Mercado Pago.' }), { status: 502, headers: CORS });
    }
    const pagamento = await resp.json();
    const aprovado = pagamento.status === 'approved' && String(pagamento.external_reference) === String(pedidoId);
    return new Response(JSON.stringify({ ok: aprovado, status: pagamento.status }), { headers: CORS });
  } catch (e) {
    console.error('loja-verificar-pagamento:', e);
    return new Response(JSON.stringify({ ok: false, error: 'Erro inesperado ao confirmar o pagamento.' }), { status: 500, headers: CORS });
  }
}
