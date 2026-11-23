/**
 * Consulta um "cliente" do Asaas pelo ID — usado na fase de teste da
 * automação de mensalidade via PIX, pra confirmar se o registro de cliente
 * que o Asaas cria automaticamente (quando chega um Pix espontâneo, sem
 * cobrança prévia) já vem com nome/CPF de quem pagou, ou se precisa de
 * outra consulta. Ver asaas-webhook.js.
 *
 * Só admin — não expõe isso pra ninguém de fora.
 */

const ADMIN_PASSWORD = 'admin';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Password',
  'Content-Type': 'application/json',
};

export async function onRequestOptions() {
  return new Response(null, { headers: CORS });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  if (request.headers.get('X-Admin-Password') !== ADMIN_PASSWORD) {
    return new Response(JSON.stringify({ error: 'Não autorizado' }), { status: 401, headers: CORS });
  }
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) {
    return new Response(JSON.stringify({ error: 'Falta o parâmetro id' }), { status: 400, headers: CORS });
  }
  if (!env.ASAAS_API_KEY) {
    return new Response(JSON.stringify({ error: 'ASAAS_API_KEY não configurada' }), { status: 500, headers: CORS });
  }
  try {
    const resp = await fetch(`https://api.asaas.com/v3/customers/${encodeURIComponent(id)}`, {
      headers: { access_token: env.ASAAS_API_KEY },
    });
    const texto = await resp.text();
    return new Response(texto, { status: resp.status, headers: CORS });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Erro ao consultar Asaas', detalhe: String(e) }), { status: 502, headers: CORS });
  }
}
