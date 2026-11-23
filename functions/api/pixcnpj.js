/**
 * Sistema NOVO de mensalidade automática via PIX (Asaas), dedicado ao que
 * será usado no futuro com o CNPJ da casa — separado de propósito da
 * Tesouraria de hoje (dados.js, tesouraria.html, membros.js não são
 * tocados). Chaves próprias na mesma KV (TESOURARIA_KV), prefixadas com
 * "pixcnpj_".
 *
 * ?recurso=membros
 *   GET  — lista [{ nome, cpf, ativo }] (admin)
 *   POST — substitui a lista inteira (admin) — mesmo padrão de dados.js
 * ?recurso=pagamentos
 *   GET  — lista os pagamentos detectados automaticamente pelo webhook
 *          (ver asaas-webhook.js), mais recentes primeiro (admin)
 */

const ADMIN_PASSWORD = 'admin';
const CHAVES = {
  membros: 'pixcnpj_membros',
  pagamentos: 'pixcnpj_pagamentos',
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Password',
  'Content-Type': 'application/json',
};

export async function onRequestOptions() {
  return new Response(null, { headers: CORS });
}

function autorizado(request) {
  return request.headers.get('X-Admin-Password') === ADMIN_PASSWORD;
}

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!autorizado(request)) {
    return new Response(JSON.stringify({ error: 'Não autorizado' }), { status: 401, headers: CORS });
  }
  const url = new URL(request.url);
  const recurso = url.searchParams.get('recurso');
  const chave = CHAVES[recurso];
  if (!chave) {
    return new Response(JSON.stringify({ error: 'Recurso inválido. Use recurso=membros ou recurso=pagamentos' }), { status: 400, headers: CORS });
  }
  const dados = (await env.TESOURARIA_KV.get(chave, { type: 'json' })) || [];
  return new Response(JSON.stringify(dados), { status: 200, headers: CORS });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!autorizado(request)) {
    return new Response(JSON.stringify({ error: 'Não autorizado' }), { status: 401, headers: CORS });
  }
  const url = new URL(request.url);
  const recurso = url.searchParams.get('recurso');
  if (recurso !== 'membros') {
    return new Response(JSON.stringify({ error: 'Só recurso=membros aceita escrita por aqui' }), { status: 400, headers: CORS });
  }
  let body;
  try { body = await request.json(); } catch { return new Response(JSON.stringify({ error: 'JSON inválido' }), { status: 400, headers: CORS }); }
  if (!Array.isArray(body)) {
    return new Response(JSON.stringify({ error: 'Array esperado: [{ nome, cpf, ativo }]' }), { status: 400, headers: CORS });
  }
  const limpo = body.map(m => ({
    nome: String(m.nome || '').slice(0, 80),
    cpf: String(m.cpf || '').replace(/\D/g, '').slice(0, 14),
    ativo: m.ativo !== false,
  })).filter(m => m.nome);
  await env.TESOURARIA_KV.put(CHAVES.membros, JSON.stringify(limpo));
  return new Response(JSON.stringify(limpo), { status: 200, headers: CORS });
}
