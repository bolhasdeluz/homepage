// Cloudflare Pages Function: /api/rifa-webhook-infinitepay
// Recebe o aviso do InfinitePay quando um link de pagamento da rifa (criado
// em /api/rifa, ação "comprar-digital-lote") é pago, e marca os números como
// pagos automaticamente — complementa a conferência feita quando a pessoa
// volta do checkout (ação "verificar-pagamento-infinitepay" em /api/rifa):
// esse webhook cobre o caso de ela fechar a aba sem voltar pro site.
//
// Configuração necessária na conta InfinitePay (app > Checkout Integrado):
// "URL do Webhook" = https://bolhasdeluz.ong.br/api/rifa-webhook-infinitepay
//
// Esse webhook não vem assinado/autenticado (não é documentação 100%
// oficial), então NUNCA confia só no que chega aqui — sempre confere de
// novo com o próprio InfinitePay (payment_check) antes de marcar como pago,
// igual a ação "verificar-pagamento-infinitepay" faz.

const INFINITEPAY_HANDLE = 'bolhasdeluz';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

function envelopeEmail({ corTopo, titulo, corpoHtml }) {
  return `
    <div style="font-family:Georgia,serif;max-width:480px;margin:0 auto;padding:24px;background:#fff5f7;border-radius:12px">
      <h2 style="font-family:Georgia,serif;color:${corTopo};margin-bottom:4px">${titulo}</h2>
      <p style="color:#8a6070;font-size:14px;margin-bottom:20px">
        ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
      </p>
      ${corpoHtml}
      <div style="margin-top:20px;padding:12px;background:#fff;border-radius:8px;border:1px solid rgba(196,57,107,.15)">
        <a href="https://bolhasdeluz.ong.br" style="color:#c4396b;font-size:13px">Terreiro Bolhas de Luz →</a>
      </div>
    </div>`;
}

async function enviarEmailRifa(env, { paraEmail, assunto, html }) {
  const RESEND_KEY = env.RESEND_API_KEY;
  if (!RESEND_KEY || !paraEmail) return;
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'Bolhas de Luz <notificacoes@bolhasdeluz.ong.br>', to: [paraEmail], subject: assunto, html }),
  });
  if (!resp.ok) console.error('rifa-webhook-infinitepay: Resend recusou o envio', resp.status, await resp.text().catch(() => ''));
}

function listaNumeros(numeros) {
  const lista = [...numeros];
  if (lista.length <= 1) return lista.join('');
  return lista.slice(0, -1).join(', ') + ' e ' + lista[lista.length - 1];
}

async function enviarEmailConfirmado(env, { paraEmail, titulo, numeros }) {
  const html = envelopeEmail({
    corTopo: '#2a7a60',
    titulo: '🎉 Pagamento confirmado!',
    corpoHtml: `
      <p style="color:#2a1a22;font-size:15px;margin-bottom:14px">Recebemos seu pagamento da rifa <b>${titulo}</b> — seus números já estão valendo:</p>
      <div style="padding:14px;background:#fff;border-radius:8px;border:1px solid rgba(42,122,96,.25);color:#2a1a22;font-size:18px;font-weight:bold;text-align:center;margin-bottom:14px">${listaNumeros(numeros)}</div>
      <p style="color:#2a1a22;font-size:14px">Boa sorte no sorteio! ✦🍀✦</p>`,
  });
  await enviarEmailRifa(env, { paraEmail, assunto: `🎉 Pagamento confirmado — ${titulo}`, html });
}

async function conferirPagamentoInfinitePay({ orderNsu, slug }) {
  try {
    const resp = await fetch('https://api.checkout.infinitepay.io/payment_check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handle: INFINITEPAY_HANDLE, order_nsu: orderNsu, slug: slug || undefined }),
    });
    if (!resp.ok) {
      console.error('rifa-webhook-infinitepay: payment_check falhou', resp.status, await resp.text().catch(() => ''));
      return false;
    }
    const dados = await resp.json();
    return dados.paid === true || dados.is_paid === true || dados.status === 'paid' || dados.success === true;
  } catch (e) {
    console.error('rifa-webhook-infinitepay: falha ao conferir pagamento', e.message);
    return false;
  }
}

// procura, em TODAS as rifas guardadas (não só a ativa — pode ter mudado
// entre a compra e o pagamento chegar), qual delas tem um número com esse
// pedidoNsu — devolve {rifa, numerosDoPedido} ou null
async function localizarPedido(KV, orderNsu) {
  const list = await KV.list({ prefix: 'rifa:item:' });
  for (const k of list.keys) {
    const rifa = await KV.get(k.name, { type: 'json' });
    if (!rifa || !rifa.numeros) continue;
    const numerosDoPedido = Object.entries(rifa.numeros).filter(([, v]) => v.pedidoNsu === orderNsu);
    if (numerosDoPedido.length) return { rifa, numerosDoPedido };
  }
  return null;
}

export async function onRequestOptions() {
  return new Response(null, { headers: CORS });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const KV = env.MENU_DATA;
  if (!KV) return json({ error: 'KV não configurado.' }, 500);

  let body;
  try { body = await request.json(); } catch { body = {}; }

  // nomes de campo defensivos — não há documentação 100% oficial do payload
  const orderNsu = String(body.order_nsu || body.orderNsu || '');
  const transactionNsu = String(body.transaction_nsu || body.transactionNsu || '');
  const slugWebhook = body.slug || body.invoice_slug || '';
  if (!orderNsu) {
    console.error('rifa-webhook-infinitepay: payload sem order_nsu', JSON.stringify(body));
    return json({ ok: true }); // responde 200 mesmo assim — não tem como reprocessar sem order_nsu
  }

  try {
    const achado = await localizarPedido(KV, orderNsu);
    if (!achado) {
      console.error('rifa-webhook-infinitepay: pedido não encontrado', orderNsu);
      return json({ ok: true });
    }
    const { rifa, numerosDoPedido } = achado;
    if (numerosDoPedido.every(([, v]) => v.status === 'pago')) {
      return json({ ok: true }); // idempotente — já tinha sido confirmado antes (pelo retorno do navegador, por exemplo)
    }

    const slug = numerosDoPedido[0][1].checkoutSlug || slugWebhook;
    const aprovado = await conferirPagamentoInfinitePay({ orderNsu, slug });
    if (!aprovado) return json({ ok: true }); // webhook pode chegar antes da confirmação valer no payment_check — não é erro

    const numerosConfirmados = [];
    const infoPrimeiro = numerosDoPedido[0][1];
    numerosDoPedido.forEach(([numero, info]) => {
      rifa.numeros[numero] = { ...info, status: 'pago', pagoEm: Date.now() };
      numerosConfirmados.push(numero);
    });
    await KV.put(rifa.id, JSON.stringify(rifa));
    if (infoPrimeiro.email) {
      context.waitUntil(enviarEmailConfirmado(env, { paraEmail: infoPrimeiro.email, titulo: rifa.titulo, numeros: numerosConfirmados }));
    }
    return json({ ok: true });
  } catch (e) {
    console.error('rifa-webhook-infinitepay: erro inesperado', e.message, 'transactionNsu:', transactionNsu);
    return json({ ok: false, error: e.message }, 500);
  }
}
