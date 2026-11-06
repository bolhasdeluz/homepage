// Cloudflare Pages Function: /api/camiseta
// Venda de camisetas do terreiro — mesmo molde da rifa (KV MENU_DATA, só um
// produto "ativo" por vez, pagamento automático via InfinitePay com fallback
// manual pelo Pix). Diferente da rifa, não existe "número"/estoque: a pessoa
// escolhe quantidade por tamanho E por cor (pode levar, por ex., 2 M preta e
// 1 G colorida no mesmo pedido) — sem controle de limite de unidades.
//
// Pagamento: a pessoa escolhe QUANTO (sinal, mínimo 20% do total, editável
// pra mais — ou o valor total) e QUANDO (agora, via InfinitePay, ou depois,
// só combinando uma data). Se escolher pagar só o sinal, também informa uma
// previsão de pagamento do saldo restante — esse saldo é sempre confirmado
// na mão pela admin (não gera um segundo link de pagamento sozinho).
//
// Cada produto guarda a lista de "pedidos" feitos nele (carrinho, nome,
// telefone, e-mail, status do valor pago agora, status do saldo quando
// houver, se já foi entregue). Criar um produto novo arquiva o anterior
// (status "encerrada"), que continua acessível pelo histórico — mas os
// pedidos de produtos encerrados não aparecem mais na lista de "aguardando
// entrega" da admin (só o ativo).

const ADMIN_PASSWORD = 'admin';
const PIX_CHAVE = 'bolhasdeluz@gmail.com';
// mesma conta/handle já usado pela rifa — ver nota equivalente em rifa.js
const INFINITEPAY_HANDLE = 'bolhasdeluz';
const ADMIN_NOTIFY_EMAIL = 'bolhasdeluz@gmail.com';
const PERCENTUAL_MINIMO_SINAL = 0.2;
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Password',
  'Content-Type': 'application/json',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

function gerarOrderNsu() {
  return `camiseta-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatarTelefoneE164(telefone) {
  const digitos = String(telefone || '').replace(/\D/g, '');
  if (!digitos) return undefined;
  return digitos.startsWith('55') && digitos.length >= 12 ? `+${digitos}` : `+55${digitos}`;
}

function fmtPrecoEmail(v) {
  return 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',');
}

// "2 M (Preta), 1 G (Colorida)" — lista amigável dos itens do pedido pro
// corpo dos e-mails
function listaItens(itens) {
  return (itens || []).map(i => `${i.quantidade} ${i.tamanho} (${i.cor})`).join(', ');
}

// "2026-12-15" -> "15/12/2026", pro corpo dos e-mails
function fmtDataBR(iso) {
  const [ano, mes, dia] = String(iso || '').split('-');
  return (dia && mes && ano) ? `${dia}/${mes}/${ano}` : '';
}

// hoje em YYYY-MM-DD (America/Sao_Paulo) — usado só pra não aceitar uma data
// de pagamento combinado já passada
function hojeISO() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
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

async function enviarEmailCamiseta(env, { paraEmail, assunto, html }) {
  const RESEND_KEY = env.RESEND_API_KEY;
  if (!RESEND_KEY || !paraEmail) return;
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Bolhas de Luz <notificacoes@bolhasdeluz.ong.br>',
      to: [paraEmail],
      subject: assunto,
      html,
    }),
  });
  if (!resp.ok) {
    const detalhe = await resp.text().catch(() => '');
    console.error('camiseta: Resend recusou o envio', resp.status, detalhe);
  }
}

// texto do que está acontecendo com o pagamento agora, reaproveitado no
// e-mail da pessoa e no aviso da admin — o sinal (ou o valor total) é
// SEMPRE pago na hora (InfinitePay); só o saldo restante (quando a pessoa
// escolheu pagar só o sinal) é que fica combinado pra uma data futura
function notaPagamento({ valorEscolhido, valorPedido, dataPagamentoSaldo, comLinkAutomatico }) {
  const rotuloValor = valorEscolhido === 'sinal' ? `o sinal (${fmtPrecoEmail(valorPedido)})` : `o valor total (${fmtPrecoEmail(valorPedido)})`;
  const partes = [];
  if (comLinkAutomatico) {
    partes.push(`Você está pagando ${rotuloValor} agora, pelo InfinitePay.`);
  } else {
    partes.push(`Você ia pagar ${rotuloValor} agora, mas não deu pra criar o link automático — o pagamento é conferido manualmente.`);
  }
  if (valorEscolhido === 'sinal') {
    partes.push(`O saldo restante fica previsto pra <b>${fmtDataBR(dataPagamentoSaldo)}</b>.`);
  }
  return partes.join(' ');
}

async function enviarEmailPedidoRegistrado(env, { paraEmail, titulo, itens, total, comLinkAutomatico, valorEscolhido, valorPedido, dataPagamentoSaldo }) {
  const html = envelopeEmail({
    corTopo: '#c4396b',
    titulo: '🎽 Pedido registrado!',
    corpoHtml: `
      <p style="color:#2a1a22;font-size:15px;margin-bottom:14px">Seu pedido de <b>${titulo}</b>:</p>
      <div style="padding:14px;background:#fff;border-radius:8px;border:1px solid rgba(196,57,107,.15);color:#2a1a22;font-size:16px;font-weight:bold;text-align:center;margin-bottom:14px">${listaItens(itens)}</div>
      <p style="color:#2a1a22;font-size:14px;margin-bottom:14px">Total do pedido: <b>${fmtPrecoEmail(total)}</b></p>
      <div style="padding:14px;background:rgba(196,57,107,.06);border-radius:8px;margin-bottom:14px">
        <p style="color:#2a1a22;font-size:14px">${notaPagamento({ valorEscolhido, valorPedido, dataPagamentoSaldo, comLinkAutomatico })}</p>
        ${!comLinkAutomatico ? `
        <p style="color:#8a6070;font-size:12px;text-transform:uppercase;letter-spacing:.05em;margin:10px 0 4px">Chave Pix (copia e cola)</p>
        <p style="color:#2a1a22;font-size:16px;font-weight:bold">${PIX_CHAVE}</p>` : ''}
      </div>
      <p style="color:#8a6070;font-size:13px;font-style:italic">Guarde esse e-mail ✦</p>`,
  });
  await enviarEmailCamiseta(env, { paraEmail, assunto: `🎽 Pedido registrado — ${titulo}`, html });
}

async function enviarEmailAvisoAdminPedido(env, { titulo, itens, total, nome, telefone, email, comLinkAutomatico, erroLinkAutomatico, valorEscolhido, valorPedido, dataPagamentoSaldo }) {
  let notaRodape = notaPagamento({ valorEscolhido, valorPedido, dataPagamentoSaldo, comLinkAutomatico }) + ' Confirma na mão (painel da Loja de Camisetas) quando a pessoa pagar ✦';
  if (erroLinkAutomatico) {
    notaRodape = `Não deu pra criar o link automático do InfinitePay dessa vez (${erroLinkAutomatico}) — confira o Pix e fala com a pessoa pelo WhatsApp quando confirmar ✦`;
  }
  const html = envelopeEmail({
    corTopo: '#c4396b',
    titulo: '🔔 Novo pedido de camiseta',
    corpoHtml: `
      <p style="color:#2a1a22;font-size:15px;margin-bottom:14px">Alguém fez um pedido de <b>${titulo}</b>:</p>
      <div style="padding:14px;background:#fff;border-radius:8px;border:1px solid rgba(196,57,107,.15);color:#2a1a22;font-size:14px;margin-bottom:14px">
        <p style="margin-bottom:4px"><b>Nome:</b> ${nome}</p>
        <p style="margin-bottom:4px"><b>Telefone:</b> ${telefone || 'não informado'}</p>
        <p style="margin-bottom:4px"><b>E-mail:</b> ${email}</p>
        <p style="margin-bottom:4px"><b>Itens:</b> ${listaItens(itens)}</p>
        <p><b>Total do pedido:</b> ${fmtPrecoEmail(total)}</p>
      </div>
      <p style="color:#8a6070;font-size:13px;font-style:italic">${notaRodape}</p>`,
  });
  await enviarEmailCamiseta(env, { paraEmail: ADMIN_NOTIFY_EMAIL, assunto: `🔔 Novo pedido de camiseta — ${titulo}`, html });
}

async function enviarEmailAvisoAdminPago(env, { titulo, itens, total, nome, telefone, email, valorEscolhido, valorPedido }) {
  const rotulo = valorEscolhido === 'sinal' ? `o sinal (${fmtPrecoEmail(valorPedido)})` : `o valor total (${fmtPrecoEmail(valorPedido)})`;
  const html = envelopeEmail({
    corTopo: '#2a7a60',
    titulo: '💵 Pagamento de camiseta confirmado',
    corpoHtml: `
      <p style="color:#2a1a22;font-size:15px;margin-bottom:14px">Pagamento de ${rotulo} confirmado — pedido de <b>${titulo}</b>:</p>
      <div style="padding:14px;background:#fff;border-radius:8px;border:1px solid rgba(42,122,96,.25);color:#2a1a22;font-size:14px;margin-bottom:14px">
        <p style="margin-bottom:4px"><b>Nome:</b> ${nome}</p>
        <p style="margin-bottom:4px"><b>Telefone:</b> ${telefone || 'não informado'}</p>
        <p style="margin-bottom:4px"><b>E-mail:</b> ${email}</p>
        <p style="margin-bottom:4px"><b>Itens:</b> ${listaItens(itens)}</p>
        <p><b>Total do pedido:</b> ${fmtPrecoEmail(total)}</p>
      </div>
      <p style="color:#8a6070;font-size:13px;font-style:italic">Esse pedido entrou na lista de "pedidos" do painel ✦</p>`,
  });
  await enviarEmailCamiseta(env, { paraEmail: ADMIN_NOTIFY_EMAIL, assunto: `💵 Pagamento confirmado — ${titulo}`, html });
}

// cria um link de pagamento hospedado no InfinitePay — ver nota detalhada
// em rifa.js (criarLinkInfinitePay), mesmo serviço/conta
async function criarLinkInfinitePay({ orderNsu, descricao, precoCentavos, redirectUrl, customer }) {
  try {
    const resp = await fetch('https://api.checkout.infinitepay.io/links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        handle: INFINITEPAY_HANDLE,
        order_nsu: orderNsu,
        redirect_url: redirectUrl,
        items: [{ quantity: 1, price: precoCentavos, description: descricao.slice(0, 250) }],
        ...(customer ? { customer } : {}),
      }),
    });
    const textoResp = await resp.text().catch(() => '');
    if (!resp.ok) {
      console.error('infinitepay: erro ao criar link', resp.status, textoResp);
      return { erro: `HTTP ${resp.status}: ${textoResp.slice(0, 300)}` };
    }
    let dados;
    try { dados = JSON.parse(textoResp); } catch { dados = {}; }
    const url = dados.url || dados.checkout_url || dados.payment_url || dados.link || null;
    if (!url) {
      console.error('infinitepay: resposta sem url de pagamento', textoResp);
      return { erro: `resposta sem url: ${textoResp.slice(0, 300)}` };
    }
    let slugDaUrl = null;
    try {
      const urlObj = new URL(url);
      slugDaUrl = urlObj.searchParams.get('lenc') || urlObj.pathname.split('/').filter(Boolean).pop() || null;
    } catch { /* url inválida — slugDaUrl continua null */ }
    return { url, slug: dados.slug || dados.id || slugDaUrl || null };
  } catch (e) {
    console.error('infinitepay: falha ao criar link', e.message);
    return { erro: e.message };
  }
}

async function conferirPagamentoInfinitePay({ orderNsu, slug, transactionNsu }) {
  try {
    const resp = await fetch('https://api.checkout.infinitepay.io/payment_check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handle: INFINITEPAY_HANDLE, order_nsu: orderNsu, slug: slug || undefined, transaction_nsu: transactionNsu || undefined }),
    });
    const textoResp = await resp.text().catch(() => '');
    if (!resp.ok) {
      console.error('infinitepay: payment_check falhou', resp.status, textoResp);
      return { aprovado: false, debug: `HTTP ${resp.status}: ${textoResp.slice(0, 300)}` };
    }
    let dados;
    try { dados = JSON.parse(textoResp); } catch { dados = {}; }
    const aprovado = dados.paid === true || dados.is_paid === true || dados.status === 'paid' || dados.success === true;
    return { aprovado, debug: aprovado ? '' : textoResp.slice(0, 300) };
  } catch (e) {
    console.error('infinitepay: falha ao conferir pagamento', e.message);
    return { aprovado: false, debug: e.message };
  }
}

// mesmo índice usado por rifa.js/perfil.js/etc — evita KV.list() (cota do
// plano Free é bem mais baixa que get/put, e já derrubou o site uma vez)
const CAMISETA_INDICE_KEY = 'camiseta:item:_index';

async function indiceObter(KV) {
  const indice = await KV.get(CAMISETA_INDICE_KEY, { type: 'json' });
  if (indice) return indice;
  const list = await KV.list({ prefix: 'camiseta:item:' });
  const chaves = list.keys.map(k => k.name).filter(k => k !== CAMISETA_INDICE_KEY);
  await KV.put(CAMISETA_INDICE_KEY, JSON.stringify(chaves));
  return chaves;
}

async function indiceAdicionar(KV, chave) {
  const indice = await indiceObter(KV);
  if (indice.indexOf(chave) === -1) {
    indice.push(chave);
    await KV.put(CAMISETA_INDICE_KEY, JSON.stringify(indice));
  }
}

async function buscarAtiva(KV) {
  const chaves = await indiceObter(KV);
  const itens = await Promise.all(chaves.map(k => KV.get(k, { type: 'json' })));
  return itens.filter(Boolean).find(p => p.status === 'ativa') || null;
}

// remove os dados de quem comprou da resposta pública — só admin vê pedidos
function paraPublico(produto) {
  if (!produto) return produto;
  const { pedidos, ...resto } = produto;
  return resto;
}

function montarProdutoDoBody(body) {
  return {
    titulo: body.titulo || '',
    descricao: body.descricao || '',
    precoPorUnidade: Number(body.precoPorUnidade) || 0,
    cores: Array.isArray(body.cores) ? body.cores.filter(c => c && c.nome).map(c => ({ nome: String(c.nome), imagem: String(c.imagem || '') })) : [],
    tamanhos: Array.isArray(body.tamanhos) ? body.tamanhos : [],
    tabelaMedidas: Array.isArray(body.tabelaMedidas) ? body.tabelaMedidas : [],
    imagemTabelaMedidas: body.imagemTabelaMedidas || '',
  };
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response('', { status: 200, headers: CORS });
  }

  const KV = env.MENU_DATA;
  if (!KV) return json({ error: 'KV não configurado.' }, 500);

  const method = request.method;
  const url = new URL(request.url);
  const isAdmin = request.headers.get('X-Admin-Password') === ADMIN_PASSWORD;

  try {
    // GET — pública: produto ativo (sem os pedidos). Admin: com os pedidos.
    // Com ?historico=1 (só admin): todos os produtos já criados.
    if (method === 'GET') {
      if (url.searchParams.get('historico') === '1') {
        if (!isAdmin) return json({ error: 'Não autorizado' }, 403);
        const chaves = await indiceObter(KV);
        const itens = await Promise.all(chaves.map(k => KV.get(k, { type: 'json' })));
        const produtos = itens.filter(Boolean).sort((a, b) => b.criadoEm - a.criadoEm);
        return json(produtos);
      }
      const ativa = await buscarAtiva(KV);
      return json(isAdmin ? ativa : paraPublico(ativa));
    }

    // POST — criar novo produto (admin) — arquiva o ativo anterior, se houver
    if (method === 'POST') {
      if (!isAdmin) return json({ error: 'Não autorizado' }, 403);
      const body = await request.json();
      if (!body.titulo) return json({ error: 'O título é obrigatório.' }, 400);

      const atual = await buscarAtiva(KV);
      if (atual) {
        atual.status = 'encerrada';
        atual.encerradaEm = Date.now();
        await KV.put(atual.id, JSON.stringify(atual));
      }

      const id = `camiseta:item:${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const produto = {
        id,
        ...montarProdutoDoBody(body),
        status: 'ativa',
        pedidos: [],
        criadoEm: Date.now(),
      };
      await KV.put(id, JSON.stringify(produto));
      await indiceAdicionar(KV, id);
      return json(produto);
    }

    // PUT — ações sobre o produto ativo, conforme body.acao
    if (method === 'PUT') {
      const body = await request.json();
      const acao = body.acao;

      // VERIFICAR PAGAMENTO (InfinitePay) — pública, chamada pela página de
      // confirmação quando a pessoa volta do checkout hospedado. Busca o
      // produto pelo id exato (pode não ser mais o "ativo") e confere no
      // próprio InfinitePay antes de marcar o pedido como pago.
      if (acao === 'verificar-pagamento') {
        const produtoId = String(body.produtoId || '');
        const orderNsu = String(body.pedido || '');
        if (!produtoId || !orderNsu) return json({ error: 'Pedido inválido.' }, 400);
        const produto = await KV.get(produtoId, { type: 'json' });
        if (!produto) return json({ error: 'Produto não encontrado.' }, 404);
        const pedido = (produto.pedidos || []).find(p => p.orderNsu === orderNsu);
        if (!pedido) return json({ error: 'Pedido não encontrado.' }, 404);

        const respostaOk = {
          ok: true, itens: pedido.itens, total: pedido.total, valorPedido: pedido.valorPedido, valorEscolhido: pedido.valorEscolhido,
          dataPagamentoSaldo: pedido.dataPagamentoSaldo || null, titulo: produto.titulo, nome: pedido.nome,
        };
        if (pedido.status === 'pago') return json(respostaOk);

        const transactionNsu = String(body.transactionNsu || '');
        const slugDaVolta = String(body.slug || '') || pedido.checkoutSlug;
        const { aprovado, debug } = await conferirPagamentoInfinitePay({ orderNsu, slug: slugDaVolta, transactionNsu });
        if (!aprovado) return json({ ok: false, debug, slug: slugDaVolta || null, transactionNsu: transactionNsu || null });

        pedido.status = 'pago';
        pedido.pagoEm = Date.now();
        await KV.put(produto.id, JSON.stringify(produto));
        context.waitUntil(enviarEmailAvisoAdminPago(env, {
          titulo: produto.titulo, itens: pedido.itens, total: pedido.total, nome: pedido.nome, telefone: pedido.telefone, email: pedido.email,
          valorEscolhido: pedido.valorEscolhido, valorPedido: pedido.valorPedido,
        }));
        return json(respostaOk);
      }

      // a partir daqui, as ações mexem no produto ATIVO
      const produto = await buscarAtiva(KV);
      if (!produto && acao !== 'editar-produto') return json({ error: 'Nenhum produto ativo no momento.' }, 404);

      // CRIAR PEDIDO — pública, chamada pela página de compra (dentro do
      // site, pessoa logada). Carrinho com quantidade por cor+tamanho, sem
      // reservar nada (não tem estoque aqui). A pessoa escolhe QUANTO vai
      // pagar agora (sinal, mínimo 20% do total, ou o valor total) e QUANDO
      // (agora, cria link de pagamento; depois, só combina uma data). Se for
      // só o sinal, também guarda a previsão de pagamento do saldo.
      if (acao === 'criar-pedido') {
        const nome = (body.nome || '').trim();
        const telefone = (body.telefone || '').trim();
        const email = (body.email || '').trim().toLowerCase();
        if (!nome) return json({ error: 'Informe seu nome.' }, 400);
        if (!email) return json({ error: 'Informe seu e-mail.' }, 400);
        if (!produto.precoPorUnidade) return json({ error: 'Esse produto não tem preço definido.' }, 400);

        const coresValidas = new Set((produto.cores || []).map(c => c.nome));
        const tamanhosValidos = new Set(produto.tamanhos || []);
        const itensBrutos = Array.isArray(body.itens) ? body.itens : [];
        const itens = itensBrutos
          .map(i => ({ cor: String(i.cor || ''), tamanho: String(i.tamanho || ''), quantidade: parseInt(i.quantidade, 10) || 0 }))
          .filter(i => i.quantidade > 0 && tamanhosValidos.has(i.tamanho) && coresValidas.has(i.cor));
        if (!itens.length) return json({ error: 'Escolha ao menos uma cor, tamanho e quantidade.' }, 400);

        const quantidadeTotal = itens.reduce((soma, i) => soma + i.quantidade, 0);
        const total = quantidadeTotal * Number(produto.precoPorUnidade || 0);

        // QUANTO — sinal (mínimo 20%, editável pra mais) ou o total
        const valorEscolhido = body.valorEscolhido === 'sinal' ? 'sinal' : 'total';
        let valorPedido = total;
        let dataPagamentoSaldo = null;
        if (valorEscolhido === 'sinal') {
          valorPedido = Math.round((Number(body.valorSinal) || 0) * 100) / 100;
          const minimo = Math.round(total * PERCENTUAL_MINIMO_SINAL * 100) / 100;
          if (valorPedido < minimo - 0.01) {
            return json({ error: `O sinal mínimo é de ${fmtPrecoEmail(minimo)} (20% do total).` }, 400);
          }
          if (valorPedido > total) valorPedido = total;
          dataPagamentoSaldo = String(body.dataPagamentoSaldo || '');
          if (!/^\d{4}-\d{2}-\d{2}$/.test(dataPagamentoSaldo)) {
            return json({ error: 'Escolha uma data válida pra previsão do saldo restante.' }, 400);
          }
          if (dataPagamentoSaldo < hojeISO()) {
            return json({ error: 'Essa data do saldo já passou — escolhe uma data a partir de hoje.' }, 400);
          }
        }

        // o sinal (ou o valor total) é SEMPRE pago agora — só o saldo
        // restante, quando a pessoa escolhe pagar só o sinal, é que fica
        // combinado pra uma data futura (ver dataPagamentoSaldo acima)
        const orderNsu = gerarOrderNsu();
        const origin = new URL(request.url).origin;
        const redirectUrl = `${origin}/camiseta-confirmacao.html?pedido=${encodeURIComponent(orderNsu)}&produto=${encodeURIComponent(produto.id)}`;
        const descricaoValor = valorEscolhido === 'sinal' ? 'sinal' : 'valor total';
        const linkPagamento = await criarLinkInfinitePay({
          orderNsu,
          descricao: `${produto.titulo} — ${descricaoValor} — ${listaItens(itens)}`,
          precoCentavos: Math.round(valorPedido * 100),
          redirectUrl,
          customer: { name: nome, email, phone_number: formatarTelefoneE164(telefone) },
        });

        const pedido = {
          orderNsu, itens, nome, telefone, email, total,
          valorEscolhido, valorPedido,
          status: 'aguardando', criadoEm: Date.now(),
          checkoutSlug: (linkPagamento && linkPagamento.slug) || null,
          ...(valorEscolhido === 'sinal' ? { dataPagamentoSaldo, statusSaldo: 'aguardando' } : {}),
        };
        if (!Array.isArray(produto.pedidos)) produto.pedidos = [];
        produto.pedidos.push(pedido);
        await KV.put(produto.id, JSON.stringify(produto));

        context.waitUntil(enviarEmailPedidoRegistrado(env, {
          paraEmail: email, titulo: produto.titulo, itens, total, comLinkAutomatico: !!linkPagamento.url,
          valorEscolhido, valorPedido, dataPagamentoSaldo,
        }));
        context.waitUntil(enviarEmailAvisoAdminPedido(env, {
          titulo: produto.titulo, itens, total, nome, telefone, email,
          comLinkAutomatico: !!linkPagamento.url, erroLinkAutomatico: linkPagamento.erro,
          valorEscolhido, valorPedido, dataPagamentoSaldo,
        }));

        return json({
          orderNsu, total, valorPedido, valorEscolhido,
          _checkoutUrl: linkPagamento.url || null, _dataPagamentoSaldo: dataPagamentoSaldo,
        });
      }

      // demais ações são só de admin
      if (!isAdmin) return json({ error: 'Não autorizado' }, 403);

      // EDITAR PRODUTO — ajusta os dados do produto ativo (título, descrição,
      // preço, cores, tamanhos, tabela de medidas) sem precisar criar outro
      if (acao === 'editar-produto') {
        if (!produto) return json({ error: 'Nenhum produto ativo — crie um produto primeiro.' }, 404);
        if (!body.titulo) return json({ error: 'O título é obrigatório.' }, 400);
        Object.assign(produto, montarProdutoDoBody(body));
        await KV.put(produto.id, JSON.stringify(produto));
        return json(produto);
      }

      // CONFIRMAR PAGAMENTO manualmente — fallback pra quando a pessoa pagou
      // pelo Pix direto (sem o link automático), ou quando o pagamento foi
      // combinado "pra depois" — a admin confere na mão. Confirma o valor
      // que o pedido tinha marcado como pendente (sinal ou total).
      if (acao === 'confirmar-pagamento') {
        const orderNsu = String(body.orderNsu || '');
        const pedido = (produto.pedidos || []).find(p => p.orderNsu === orderNsu);
        if (!pedido) return json({ error: 'Pedido não encontrado.' }, 404);
        pedido.status = 'pago';
        pedido.pagoEm = Date.now();
        await KV.put(produto.id, JSON.stringify(produto));
        return json(produto);
      }

      // CONFIRMAR PAGAMENTO DO SALDO — quando o pedido era só o sinal, esse
      // é o segundo pagamento (o restante), confirmado na mão também
      if (acao === 'confirmar-pagamento-saldo') {
        const orderNsu = String(body.orderNsu || '');
        const pedido = (produto.pedidos || []).find(p => p.orderNsu === orderNsu);
        if (!pedido) return json({ error: 'Pedido não encontrado.' }, 404);
        if (pedido.valorEscolhido !== 'sinal') return json({ error: 'Esse pedido não tem saldo pendente.' }, 400);
        pedido.statusSaldo = 'pago';
        pedido.pagoSaldoEm = Date.now();
        await KV.put(produto.id, JSON.stringify(produto));
        return json(produto);
      }

      // MARCAR ENTREGUE — tira (ou põe de volta) um pedido pago da lista de
      // "aguardando entrega" do painel
      if (acao === 'marcar-entregue') {
        const orderNsu = String(body.orderNsu || '');
        const pedido = (produto.pedidos || []).find(p => p.orderNsu === orderNsu);
        if (!pedido) return json({ error: 'Pedido não encontrado.' }, 404);
        pedido.entregue = !!body.entregue;
        await KV.put(produto.id, JSON.stringify(produto));
        return json(produto);
      }

      return json({ error: 'Ação desconhecida.' }, 400);
    }

    return json({ error: 'Método não suportado' }, 405);
  } catch (e) {
    console.error('camiseta:', e);
    return json({ error: 'Erro inesperado.' }, 500);
  }
}
