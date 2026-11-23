/**
 * Recebe os avisos (webhook) do Asaas quando um PIX cai na conta.
 * -------------------------------------------------------------------------
 * Fase de teste: só guarda o que chegou (cabeçalhos + corpo) na KV, pra
 * inspecionar depois de mandar um PIX de teste pra conta e descobrir
 * exatamente que dado o Asaas manda sobre quem pagou (nome, CPF, etc.) —
 * ver conversa com a Anna sobre automatizar o controle de mensalidade.
 * Quando isso estiver confirmado, este arquivo passa a de fato processar o
 * pagamento (achar o membro, marcar como pago) em vez de só registrar.
 *
 * O Asaas manda o token configurado no painel (Integrações > Webhooks) no
 * header "asaas-access-token" — comparamos com ASAAS_WEBHOOK_TOKEN (Secret
 * do Cloudflare) pra confirmar que a chamada é legítima.
 */

const ADMIN_PASSWORD = 'admin';
const LOG_KEY = 'asaas_webhook_test_log';
const LOG_MAX = 20;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Password, asaas-access-token',
  'Content-Type': 'application/json',
};

export async function onRequestOptions() {
  return new Response(null, { headers: CORS });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  // .trim() — cópia/cola (principalmente pelo celular) às vezes gruda um
  // espaço ou quebra de linha invisível no valor, derrubando a comparação
  // mesmo com o token "certo"
  const tokenRecebido = (request.headers.get('asaas-access-token') || '').trim();
  const tokenEsperado = (env.ASAAS_WEBHOOK_TOKEN || '').trim();
  const autenticado = !!tokenEsperado && tokenRecebido === tokenEsperado;

  const textoBruto = await request.text();
  let corpo;
  try { corpo = JSON.parse(textoBruto); } catch { corpo = textoBruto; }

  const entrada = {
    recebidoEm: new Date().toISOString(),
    autenticado,
    // diagnóstico temporário pra achar a diferença entre os dois tokens sem
    // expor nenhum dos dois por completo no log — remover depois de resolvido
    debugToken: {
      recebidoLen: tokenRecebido.length,
      esperadoLen: tokenEsperado.length,
      recebidoPrefixo: tokenRecebido.slice(0, 8),
      esperadoPrefixo: tokenEsperado.slice(0, 8),
    },
    // só os headers relevantes pra depurar — não precisa do resto
    headers: {
      'asaas-access-token-presente': !!tokenRecebido,
      'content-type': request.headers.get('content-type') || '',
      'user-agent': request.headers.get('user-agent') || '',
    },
    corpo,
  };

  try {
    const atual = (await env.TESOURARIA_KV.get(LOG_KEY, { type: 'json' })) || [];
    atual.unshift(entrada);
    while (atual.length > LOG_MAX) atual.pop();
    await env.TESOURARIA_KV.put(LOG_KEY, JSON.stringify(atual));
  } catch (e) {
    console.error('asaas-webhook: falha ao gravar log', e);
  }

  // responde 200 rápido sempre — Asaas reenvia se não receber 2xx
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: CORS });
}

// consulta o que já chegou — só admin, pra eu/Anna inspecionarmos o
// formato real do payload antes de automatizar de verdade
export async function onRequestGet(context) {
  const { request, env } = context;
  if (request.headers.get('X-Admin-Password') !== ADMIN_PASSWORD) {
    return new Response(JSON.stringify({ error: 'Não autorizado' }), { status: 401, headers: CORS });
  }
  const log = (await env.TESOURARIA_KV.get(LOG_KEY, { type: 'json' })) || [];
  return new Response(JSON.stringify(log), { status: 200, headers: CORS });
}
