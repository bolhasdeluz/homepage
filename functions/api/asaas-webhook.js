/**
 * Recebe os avisos (webhook) do Asaas quando um PIX cai na conta.
 * -------------------------------------------------------------------------
 * Parte do sistema NOVO de mensalidade automática (futuro CNPJ) — não mexe
 * em nada da Tesouraria atual (dados.js, tesouraria.html, membros.js
 * continuam exatamente como estão). Chaves próprias na mesma KV
 * (TESOURARIA_KV), todas prefixadas com "pixcnpj_", pra nunca colidir com
 * as chaves da Tesouraria de hoje (lancamentos, ag_pgtos, etc.).
 *
 * Sempre guarda um log bruto de tudo que chega (debug). Quando o aviso é
 * autenticado (token bate) e é um evento de pagamento recebido/confirmado,
 * também processa de verdade: busca o cliente no Asaas (nome + CPF), casa
 * com alguém cadastrado em pixcnpj_membros e grava um registro em
 * pixcnpj_pagamentos — ver pixcnpj.js pro cadastro de CPF por pessoa.
 *
 * O Asaas manda o token configurado no painel (Integrações > Webhooks) no
 * header "asaas-access-token" — comparamos com ASAAS_WEBHOOK_TOKEN (Secret
 * do Cloudflare) pra confirmar que a chamada é legítima.
 */

const ADMIN_PASSWORD = 'admin';
const LOG_KEY = 'asaas_webhook_test_log';
const LOG_MAX = 20;
const MEMBROS_KEY = 'pixcnpj_membros';
const PAGAMENTOS_KEY = 'pixcnpj_pagamentos';
const EVENTOS_PAGAMENTO = ['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED'];

// só dígitos — pra comparar CPF não depender de pontuação (000.000.000-00
// vs 00000000000)
function soDigitos(s) { return String(s || '').replace(/\D/g, ''); }

async function buscarClienteAsaas(env, customerId) {
  const resp = await fetch(`https://api.asaas.com/v3/customers/${encodeURIComponent(customerId)}`, {
    headers: { access_token: env.ASAAS_API_KEY, 'User-Agent': 'BolhasDeLuz/1.0' },
  });
  if (!resp.ok) return null;
  return resp.json();
}

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

  // processamento de verdade — só com token batendo e evento de pagamento
  // recebido/confirmado, pra não gravar nada a partir de um aviso que não
  // veio realmente do Asaas
  const evento = corpo && typeof corpo === 'object' ? corpo.event : null;
  const payment = corpo && typeof corpo === 'object' ? corpo.payment : null;
  if (autenticado && EVENTOS_PAGAMENTO.includes(evento) && payment && payment.id) {
    try {
      const pagamentos = (await env.TESOURARIA_KV.get(PAGAMENTOS_KEY, { type: 'json' })) || [];
      const jaRegistrado = pagamentos.some(p => p.asaasPaymentId === payment.id);
      if (!jaRegistrado) {
        const cliente = payment.customer ? await buscarClienteAsaas(env, payment.customer) : null;
        const cpfCliente = soDigitos(cliente && cliente.cpfCnpj);
        const membros = (await env.TESOURARIA_KV.get(MEMBROS_KEY, { type: 'json' })) || [];
        const membro = membros.find(m => soDigitos(m.cpf) === cpfCliente && cpfCliente);
        pagamentos.unshift({
          registradoEm: new Date().toISOString(),
          asaasPaymentId: payment.id,
          asaasCustomerId: payment.customer || null,
          data: payment.paymentDate || payment.confirmedDate || null,
          valor: payment.value ?? null,
          nomeAsaas: (cliente && cliente.name) || null,
          cpf: cpfCliente || null,
          membro: membro ? membro.nome : null,
          identificado: !!membro,
        });
        await env.TESOURARIA_KV.put(PAGAMENTOS_KEY, JSON.stringify(pagamentos));
      }
    } catch (e) {
      console.error('asaas-webhook: falha ao processar pagamento', e);
    }
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
