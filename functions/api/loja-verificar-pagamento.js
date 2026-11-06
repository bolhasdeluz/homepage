/**
 * Cloudflare Pages Function: confere no próprio InfinitePay se um pagamento
 * foi aprovado de verdade, antes do site marcar o pedido como pago.
 * -------------------------------------------------------------------------
 * Depois do checkout hospedado, o InfinitePay redireciona a pessoa de volta
 * com ?pedido=YYY (mais os parâmetros próprios dele, como slug e
 * transaction_nsu) — mas nunca dá pra confiar direto nesses parâmetros
 * (qualquer um pode digitar uma URL parecida na barra de endereço). Essa
 * rota pergunta pro próprio InfinitePay (payment_check) se esse pedido
 * (order_nsu) foi pago de verdade — só então o loja.html marca o pedido
 * como pago no Firestore.
 *
 * Mesma conta/serviço já usado pela rifa e pela venda de camiseta — não
 * precisa de nenhum Secret (antes essa rota usava o Mercado Pago e exigia
 * env.MP_ACCESS_TOKEN).
 */

const INFINITEPAY_HANDLE = 'bolhasdeluz';
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
  const { request } = context;
  const url = new URL(request.url);
  const pedidoId = url.searchParams.get('pedido');
  const slug = url.searchParams.get('slug') || '';
  const transactionNsu = url.searchParams.get('transactionNsu') || url.searchParams.get('transaction_nsu') || '';
  if (!pedidoId) {
    return new Response(JSON.stringify({ error: 'Faltou o pedido na consulta.' }), { status: 400, headers: CORS });
  }

  try {
    const resp = await fetch('https://api.checkout.infinitepay.io/payment_check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handle: INFINITEPAY_HANDLE, order_nsu: pedidoId, slug: slug || undefined, transaction_nsu: transactionNsu || undefined }),
    });
    const textoResp = await resp.text().catch(() => '');
    if (!resp.ok) {
      console.error('loja-verificar-pagamento: payment_check falhou', resp.status, textoResp);
      return new Response(JSON.stringify({ ok: false, debug: `HTTP ${resp.status}: ${textoResp.slice(0, 300)}` }), { status: 502, headers: CORS });
    }
    let dados;
    try { dados = JSON.parse(textoResp); } catch { dados = {}; }
    const aprovado = dados.paid === true || dados.is_paid === true || dados.status === 'paid' || dados.success === true;
    return new Response(JSON.stringify({ ok: aprovado, debug: aprovado ? '' : textoResp.slice(0, 300) }), { headers: CORS });
  } catch (e) {
    console.error('loja-verificar-pagamento:', e);
    return new Response(JSON.stringify({ ok: false, error: 'Erro inesperado ao confirmar o pagamento.' }), { status: 500, headers: CORS });
  }
}
