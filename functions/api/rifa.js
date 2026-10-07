// Cloudflare Pages Function: /api/rifa
// Gerenciamento de rifas — reaproveita o KV MENU_DATA (já usado por perfil.js
// e menu.js) em vez de pedir uma binding nova, guardando cada rifa em
// "rifa:item:<id>". Só existe uma rifa "ativa" por vez; criar uma nova
// arquiva a anterior (status vira "encerrada"), que continua acessível pelo
// histórico.
//
// Ações administrativas (criar rifa, confirmar pagamento, sortear) exigem
// o mesmo cabeçalho X-Admin-Password usado nos outros endpoints admin do
// site. Reservar/cancelar um número é a única ação que uma pessoa comum
// logada pode fazer — identificada pelo cabeçalho X-User-Email, no mesmo
// molde do /api/perfil. "comprar-digital-lote" é pública também (vem do
// link paralelo rifa-digital.html, sem login nenhum), assim como
// "registrar-venda-atribuido" (vem do link individual rifa-vendedor.html,
// autenticado só pelo token da vendedora — ver "vendedores" abaixo).
//
// E-mails (Resend, precisa de env.RESEND_API_KEY — se não tiver configurado,
// o envio é só pulado em silêncio): reservado (na hora da compra digital),
// confirmado (quando a admin confirma pagamento de um número com e-mail) e
// lembrete (ação "lembrar-pagamento", quando o pagamento não foi localizado).

const ADMIN_PASSWORD = 'admin';
const PIX_CHAVE = 'bolhasdeluz@gmail.com';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Password, X-User-Email',
  'Content-Type': 'application/json',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

// pra reconhecer "a mesma pessoa" entre atribuições diferentes (ex: dar mais
// números pra quem já tinha recebido antes) e reaproveitar o link dela
function normalizarNome(nome) {
  return String(nome || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

function gerarToken() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

// "0001, 0002 e 0003" — lista amigável de números pro corpo dos e-mails
function listaNumeros(numeros) {
  const lista = [...numeros];
  if (lista.length <= 1) return lista.join('');
  return lista.slice(0, -1).join(', ') + ' e ' + lista[lista.length - 1];
}

function fmtPrecoEmail(v) {
  return 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',');
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
    body: JSON.stringify({
      from: 'Bolhas de Luz <notificacoes@bolhasdeluz.ong.br>',
      to: [paraEmail],
      subject: assunto,
      html,
    }),
  });
  // roda dentro de waitUntil (não bloqueia a resposta pro cliente) — um erro
  // aqui só aparece no log da função, nunca atrapalha quem está comprando
  if (!resp.ok) {
    const detalhe = await resp.text().catch(() => '');
    console.error('rifa: Resend recusou o envio', resp.status, detalhe);
  }
}

// e-mail enviado assim que a pessoa reserva pelo link digital — avisa que o
// pagamento é conferido manualmente e que ela vai ser avisada quando tudo
// estiver certo
async function enviarEmailReservado(env, { paraEmail, titulo, numeros, precoPorNumero }) {
  const total = numeros.length * Number(precoPorNumero || 0);
  const html = envelopeEmail({
    corTopo: '#c4396b',
    titulo: '🎟️ Números reservados!',
    corpoHtml: `
      <p style="color:#2a1a22;font-size:15px;margin-bottom:14px">Você reservou os números da rifa <b>${titulo}</b>:</p>
      <div style="padding:14px;background:#fff;border-radius:8px;border:1px solid rgba(196,57,107,.15);color:#2a1a22;font-size:18px;font-weight:bold;text-align:center;margin-bottom:14px">${listaNumeros(numeros)}</div>
      <p style="color:#2a1a22;font-size:14px;margin-bottom:14px">Total: <b>${fmtPrecoEmail(total)}</b></p>
      <div style="padding:14px;background:rgba(196,57,107,.06);border-radius:8px;margin-bottom:14px">
        <p style="color:#8a6070;font-size:12px;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">Chave Pix (copia e cola)</p>
        <p style="color:#2a1a22;font-size:16px;font-weight:bold">${PIX_CHAVE}</p>
      </div>
      <p style="color:#8a6070;font-size:13px;font-style:italic">O pagamento é conferido manualmente — assim que confirmarmos, você recebe um novo e-mail. Guarde esse número(s) com carinho ✦</p>`,
  });
  await enviarEmailRifa(env, { paraEmail, assunto: `🎟️ Números reservados — ${titulo}`, html });
}

// e-mail enviado quando a admin confirma o pagamento de números com
// origem digital (tem e-mail cadastrado)
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

// e-mail de lembrete — a admin não localizou o pagamento desses números
// ainda e quer avisar quem reservou, sem mudar o status deles
async function enviarEmailLembrete(env, { paraEmail, titulo, numeros, precoPorNumero }) {
  const total = numeros.length * Number(precoPorNumero || 0);
  const html = envelopeEmail({
    corTopo: '#c88c00',
    titulo: '⏰ Lembrete de pagamento',
    corpoHtml: `
      <p style="color:#2a1a22;font-size:15px;margin-bottom:14px">Ainda não localizamos o pagamento dos seus números reservados na rifa <b>${titulo}</b>:</p>
      <div style="padding:14px;background:#fff;border-radius:8px;border:1px solid rgba(196,57,107,.15);color:#2a1a22;font-size:18px;font-weight:bold;text-align:center;margin-bottom:14px">${listaNumeros(numeros)}</div>
      <p style="color:#2a1a22;font-size:14px;margin-bottom:14px">Total: <b>${fmtPrecoEmail(total)}</b></p>
      <div style="padding:14px;background:rgba(196,57,107,.06);border-radius:8px;margin-bottom:14px">
        <p style="color:#8a6070;font-size:12px;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">Chave Pix (copia e cola)</p>
        <p style="color:#2a1a22;font-size:16px;font-weight:bold">${PIX_CHAVE}</p>
      </div>
      <p style="color:#8a6070;font-size:13px;font-style:italic">Se você já pagou, é só responder esse e-mail — pode ser só uma demora nossa pra conferir ✦</p>`,
  });
  await enviarEmailRifa(env, { paraEmail, assunto: `⏰ Lembrete de pagamento — ${titulo}`, html });
}

function gerarNumeros(total) {
  const largura = Math.max(2, String(total).length);
  const numeros = {};
  for (let i = 1; i <= total; i++) {
    numeros[String(i).padStart(largura, '0')] = { status: 'livre' };
  }
  return numeros;
}

async function buscarAtiva(KV) {
  const list = await KV.list({ prefix: 'rifa:item:' });
  const itens = await Promise.all(list.keys.map(k => KV.get(k.name, { type: 'json' })));
  return itens.filter(Boolean).find(r => r.status === 'ativa') || null;
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
    // GET — pública: rifa ativa. Com ?historico=1 (só admin): todas as rifas.
    // Com ?vendedorToken=...: visão restrita pro link individual da
    // vendedora (rifa-vendedor.html) — só os números dela, sem o resto da
    // galera (nome/telefone de quem comprou os outros números, etc.)
    if (method === 'GET') {
      if (url.searchParams.get('historico') === '1') {
        if (!isAdmin) return json({ error: 'Não autorizado' }, 403);
        const list = await KV.list({ prefix: 'rifa:item:' });
        const itens = await Promise.all(list.keys.map(k => KV.get(k.name, { type: 'json' })));
        const rifas = itens.filter(Boolean).sort((a, b) => b.criadoEm - a.criadoEm);
        return json(rifas);
      }
      const vendedorToken = url.searchParams.get('vendedorToken');
      if (vendedorToken) {
        const ativa = await buscarAtiva(KV);
        const vendedora = ativa && Object.values(ativa.vendedores || {}).find(v => v.token === vendedorToken);
        if (!ativa || !vendedora) return json({ error: 'Link inválido ou expirado.' }, 404);
        const numeros = {};
        Object.entries(ativa.numeros).forEach(([numero, info]) => {
          if (info.atribuicaoToken === vendedorToken) numeros[numero] = info;
        });
        return json({
          titulo: ativa.titulo, premio: ativa.premio, imagemPremio: ativa.imagemPremio,
          precoPorNumero: ativa.precoPorNumero, dataSorteio: ativa.dataSorteio,
          nomeVendedora: vendedora.nome, numeros,
        });
      }
      const ativa = await buscarAtiva(KV);
      return json(ativa);
    }

    // POST — criar nova rifa (admin) — arquiva a ativa anterior, se houver
    if (method === 'POST') {
      if (!isAdmin) return json({ error: 'Não autorizado' }, 403);
      const body = await request.json();
      const totalNumeros = Math.max(1, parseInt(body.totalNumeros, 10) || 0);
      if (!body.titulo || !totalNumeros) {
        return json({ error: 'Título e total de números são obrigatórios.' }, 400);
      }

      const atual = await buscarAtiva(KV);
      if (atual) {
        atual.status = 'encerrada';
        atual.encerradaEm = Date.now();
        await KV.put(atual.id, JSON.stringify(atual));
      }

      const id = `rifa:item:${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const rifa = {
        id,
        titulo: body.titulo || '',
        premio: body.premio || '',
        imagemPremio: body.imagemPremio || '',
        precoPorNumero: Number(body.precoPorNumero) || 0,
        totalNumeros,
        dataSorteio: body.dataSorteio || '',
        status: 'ativa',
        numeros: gerarNumeros(totalNumeros),
        vencedor: null,
        // do 1 até esse número, a venda é "digital" — direto no link público
        // (rifa-digital.html), sem passar pela admin. Os números depois dele
        // continuam livres pra serem atribuídos a alguém vender por fora.
        // 0 = venda digital desativada (todo mundo só entra via atribuição)
        limiteDigital: Math.max(0, Math.min(totalNumeros, parseInt(body.limiteDigital, 10) || 0)),
        // um token por vendedora (chaveado pelo nome normalizado) — dá o link
        // individual dela (rifa-vendedor.html?token=...) pra registrar as
        // próprias vendas sem precisar da senha de admin
        vendedores: {},
        criadoEm: Date.now(),
      };
      await KV.put(id, JSON.stringify(rifa));
      return json(rifa);
    }

    // PUT — ações sobre a rifa ativa, conforme body.acao
    if (method === 'PUT') {
      const body = await request.json();
      const acao = body.acao;
      const userEmail = (request.headers.get('X-User-Email') || '').toLowerCase();

      const rifa = await buscarAtiva(KV);
      if (!rifa) return json({ error: 'Não há rifa ativa no momento.' }, 404);

      if (acao === 'reservar') {
        if (!userEmail && !isAdmin) return json({ error: 'Não autorizado' }, 401);
        const numero = String(body.numero || '');
        const alvo = rifa.numeros[numero];
        if (!alvo) return json({ error: 'Número inválido.' }, 400);
        if (alvo.status !== 'livre') return json({ error: 'Esse número já não está mais livre.' }, 409);
        rifa.numeros[numero] = {
          status: 'reservado',
          nome: (body.nome || '').trim(),
          email: userEmail || (body.email || '').toLowerCase(),
          reservadoEm: Date.now(),
        };
        await KV.put(rifa.id, JSON.stringify(rifa));
        return json(rifa);
      }

      if (acao === 'cancelar') {
        const numero = String(body.numero || '');
        const alvo = rifa.numeros[numero];
        if (!alvo) return json({ error: 'Número inválido.' }, 400);
        if (alvo.status === 'livre') return json(rifa);
        if (!isAdmin) {
          if (!userEmail || alvo.email !== userEmail) return json({ error: 'Não autorizado' }, 403);
          if (alvo.status === 'pago') return json({ error: 'Esse número já foi pago — fale com a admin.' }, 403);
        }
        rifa.numeros[numero] = { status: 'livre' };
        await KV.put(rifa.id, JSON.stringify(rifa));
        return json(rifa);
      }

      // COMPRAR DIGITAL — pública, sem precisar estar logada no site (vem do
      // link paralelo rifa-digital.html). A pessoa escolhe ela mesma quais
      // números quer, dentro dos disponíveis na faixa digital (1 até
      // limiteDigital) — manda "numeros" com a lista exata. Se preferir não
      // escolher, "quantidade" sorteia números livres pra ela. Manda e-mail
      // avisando que o pagamento vai ser conferido manualmente.
      if (acao === 'comprar-digital-lote') {
        const nome = (body.nome || '').trim();
        const email = (body.email || '').trim().toLowerCase();
        const telefone = (body.telefone || '').trim();
        if (!nome) return json({ error: 'Informe seu nome.' }, 400);
        if (!email) return json({ error: 'Informe seu e-mail.' }, 400);
        if (!rifa.limiteDigital) return json({ error: 'A venda digital não está disponível no momento.' }, 400);

        const numerosEscolhidos = Array.isArray(body.numeros) ? body.numeros.map(String) : [];
        let escolhidos;

        if (numerosEscolhidos.length) {
          // a pessoa escolheu os números dela — confere um por um antes de
          // reservar qualquer um (tudo ou nada, pra não dar meia-reserva se
          // alguém levou um deles entre a hora que ela escolheu e confirmou)
          const indisponiveis = numerosEscolhidos.filter(numero => {
            const alvo = rifa.numeros[numero];
            return !alvo || alvo.status !== 'livre' || parseInt(numero, 10) > rifa.limiteDigital;
          });
          if (indisponiveis.length) {
            return json({ error: `Esses números não estão mais disponíveis: ${indisponiveis.join(', ')}. Escolhe de novo.` }, 409);
          }
          escolhidos = numerosEscolhidos.sort();
        } else {
          const quantidade = parseInt(body.quantidade, 10) || 0;
          if (!quantidade || quantidade < 1) return json({ error: 'Escolha os números ou informe quantos você quer.' }, 400);
          const disponiveis = Object.keys(rifa.numeros).filter(numero =>
            parseInt(numero, 10) <= rifa.limiteDigital && rifa.numeros[numero].status === 'livre'
          );
          if (disponiveis.length < quantidade) {
            return json({ error: `Só restam ${disponiveis.length} número(s) disponível(is) na venda digital.` }, 409);
          }
          // embaralha (Fisher-Yates) e pega os primeiros "quantidade" — "quero
          // N números, pode escolher pra mim"
          for (let i = disponiveis.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [disponiveis[i], disponiveis[j]] = [disponiveis[j], disponiveis[i]];
          }
          escolhidos = disponiveis.slice(0, quantidade).sort();
        }

        escolhidos.forEach(numero => {
          rifa.numeros[numero] = { status: 'reservado', nome, telefone, email, origem: 'digital', reservadoEm: Date.now() };
        });
        await KV.put(rifa.id, JSON.stringify(rifa));

        context.waitUntil(enviarEmailReservado(env, {
          paraEmail: email, titulo: rifa.titulo, numeros: escolhidos, precoPorNumero: rifa.precoPorNumero,
        }));

        return json({ ...rifa, _reservados: escolhidos });
      }

      // REGISTRAR VENDA (vendedora) — pública, mas só funciona com o token
      // individual dela (vem do link rifa-vendedor.html?token=...). Como ela
      // já entregou o número físico e recebeu o dinheiro na hora, vai direto
      // pra "pago" — não precisa do passo de conferência manual do digital
      if (acao === 'registrar-venda-atribuido') {
        const token = body.token || '';
        const numero = String(body.numero || '');
        const nome = (body.nome || '').trim();
        const telefone = (body.telefone || '').trim();
        if (!token) return json({ error: 'Link inválido.' }, 401);
        if (!nome) return json({ error: 'Informe o nome de quem comprou.' }, 400);
        const alvo = rifa.numeros[numero];
        if (!alvo || alvo.atribuicaoToken !== token) return json({ error: 'Esse número não é seu.' }, 403);
        if (alvo.status !== 'atribuido') return json({ error: 'Esse número já foi registrado.' }, 409);
        rifa.numeros[numero] = { ...alvo, status: 'pago', nome, telefone, pagoEm: Date.now() };
        await KV.put(rifa.id, JSON.stringify(rifa));
        return json({ ok: true, numero });
      }

      // demais ações são só de admin
      if (!isAdmin) return json({ error: 'Não autorizado' }, 403);

      // EDITAR RIFA — ajusta os dados da rifa ativa (título, prêmio, preço,
      // data do sorteio) sem precisar encerrar e criar outra. A quantidade de
      // números não muda por aqui — isso é só pelo "Aumentar números", pra
      // nunca arriscar apagar um número que já foi vendido
      if (acao === 'editar-rifa') {
        if (!body.titulo) return json({ error: 'O título é obrigatório.' }, 400);
        rifa.titulo = body.titulo;
        rifa.premio = body.premio || '';
        rifa.imagemPremio = body.imagemPremio || '';
        rifa.precoPorNumero = Number(body.precoPorNumero) || 0;
        rifa.dataSorteio = body.dataSorteio || '';
        await KV.put(rifa.id, JSON.stringify(rifa));
        return json(rifa);
      }

      // DEFINIR LIMITE DIGITAL — até qual número a venda digital (link
      // paralelo) vale; os números acima só entram por atribuição
      if (acao === 'definir-limite-digital') {
        const limite = Math.max(0, Math.min(rifa.totalNumeros, parseInt(body.limiteDigital, 10) || 0));
        rifa.limiteDigital = limite;
        await KV.put(rifa.id, JSON.stringify(rifa));
        return json(rifa);
      }

      // ATRIBUIR — a admin entrega um lote de números livres pra uma pessoa
      // responsável vender por fora (não é a compradora final, só quem fica
      // com os números até prestar contas). Números dentro da faixa digital
      // (até limiteDigital) ficam de fora — esses só saem pelo link público.
      // Gera (ou reaproveita, se ela já tinha recebido números antes) um
      // token individual — o link rifa-vendedor.html?token=... dá acesso só
      // aos números dela, pra registrar as próprias vendas sem senha de admin
      if (acao === 'atribuir') {
        const nome = (body.nome || '').trim();
        const numeros = Array.isArray(body.numeros) ? body.numeros.map(String) : [];
        if (!nome || !numeros.length) return json({ error: 'Informe a pessoa responsável e ao menos um número.' }, 400);

        if (!rifa.vendedores) rifa.vendedores = {};
        const chave = normalizarNome(nome);
        if (!rifa.vendedores[chave]) rifa.vendedores[chave] = { nome, token: gerarToken() };
        const token = rifa.vendedores[chave].token;

        const atribuidos = [];
        const ignorados = [];
        numeros.forEach(numero => {
          const alvo = rifa.numeros[numero];
          const ehDigital = parseInt(numero, 10) <= (rifa.limiteDigital || 0);
          if (alvo && alvo.status === 'livre' && !ehDigital) {
            rifa.numeros[numero] = { status: 'atribuido', nome, atribuidoEm: Date.now(), atribuicaoToken: token };
            atribuidos.push(numero);
          } else {
            ignorados.push(numero);
          }
        });
        await KV.put(rifa.id, JSON.stringify(rifa));
        return json({ ...rifa, _atribuidos: atribuidos, _ignorados: ignorados, _tokenVendedora: token });
      }

      if (acao === 'confirmar-pagamento') {
        const numero = String(body.numero || '');
        const alvo = rifa.numeros[numero];
        if (!alvo || alvo.status === 'livre') return json({ error: 'Esse número não está reservado.' }, 400);
        const nome = (body.nome || '').trim();
        if (!nome) return json({ error: 'Informe o nome de quem comprou.' }, 400);
        const emailParaAvisar = alvo.email;
        alvo.status = 'pago';
        alvo.pagoEm = Date.now();
        alvo.nome = nome;
        alvo.telefone = (body.telefone || '').trim();
        await KV.put(rifa.id, JSON.stringify(rifa));
        if (emailParaAvisar) {
          context.waitUntil(enviarEmailConfirmado(env, { paraEmail: emailParaAvisar, titulo: rifa.titulo, numeros: [numero] }));
        }
        return json(rifa);
      }

      // LANÇAR COMPRA EM LOTE — quando uma pessoa compra vários números de
      // uma vez (livres, reservados ou atribuídos — qualquer um que ainda
      // não esteja pago), marca todos como pagos pra ela numa tacada só
      if (acao === 'confirmar-pagamento-lote') {
        const nome = (body.nome || '').trim();
        const numeros = Array.isArray(body.numeros) ? body.numeros.map(String) : [];
        if (!nome || !numeros.length) return json({ error: 'Informe o nome de quem comprou e ao menos um número.' }, 400);
        const telefone = (body.telefone || '').trim();
        const confirmados = [];
        const ignorados = [];
        // agrupa por e-mail (quem reservou pelo link digital) pra mandar um
        // e-mail só por pessoa, listando todos os números dela nesse lote
        const porEmail = {};
        numeros.forEach(numero => {
          const alvo = rifa.numeros[numero];
          if (alvo && alvo.status !== 'pago') {
            if (alvo.email) { (porEmail[alvo.email] ||= []).push(numero); }
            rifa.numeros[numero] = { status: 'pago', nome, telefone, pagoEm: Date.now() };
            confirmados.push(numero);
          } else {
            ignorados.push(numero);
          }
        });
        await KV.put(rifa.id, JSON.stringify(rifa));
        Object.entries(porEmail).forEach(([emailDoComprador, numerosDoComprador]) => {
          context.waitUntil(enviarEmailConfirmado(env, { paraEmail: emailDoComprador, titulo: rifa.titulo, numeros: numerosDoComprador }));
        });
        return json({ ...rifa, _confirmados: confirmados, _ignorados: ignorados });
      }

      // LEMBRETE DE PAGAMENTO — a admin não localizou o pagamento desses
      // números ainda; manda um e-mail de lembrete pra quem reservou, sem
      // mudar o status deles (continuam "reservado")
      if (acao === 'lembrar-pagamento') {
        const numeros = Array.isArray(body.numeros) ? body.numeros.map(String) : [];
        if (!numeros.length) return json({ error: 'Informe ao menos um número.' }, 400);
        const porEmail = {};
        const semEmail = [];
        numeros.forEach(numero => {
          const alvo = rifa.numeros[numero];
          if (!alvo || alvo.status !== 'reservado') return;
          if (alvo.email) (porEmail[alvo.email] ||= []).push(numero);
          else semEmail.push(numero);
        });
        Object.entries(porEmail).forEach(([emailDoComprador, numerosDoComprador]) => {
          context.waitUntil(enviarEmailLembrete(env, {
            paraEmail: emailDoComprador, titulo: rifa.titulo, numeros: numerosDoComprador, precoPorNumero: rifa.precoPorNumero,
          }));
        });
        if (!Object.keys(porEmail).length) {
          return json({ error: 'Nenhum dos números informados tem e-mail cadastrado pra avisar.' }, 400);
        }
        return json({ ok: true, _avisados: Object.values(porEmail).flat(), _semEmail: semEmail });
      }

      // AUMENTAR NÚMEROS — cresce a quantidade de números da rifa ativa sem
      // precisar encerrar e criar outra. Se a nova quantidade precisar de
      // mais dígitos (ex: passar de 99 pra 150), re-chaveia os números que
      // já existem pra manter o preenchimento com zero consistente
      if (acao === 'aumentar-numeros') {
        const novoTotal = parseInt(body.novoTotal, 10);
        if (!novoTotal || novoTotal <= rifa.totalNumeros) {
          return json({ error: 'Informe uma quantidade maior que a atual.' }, 400);
        }
        const larguraAtual = Math.max(2, String(rifa.totalNumeros).length);
        const novaLargura = Math.max(2, String(novoTotal).length);
        let numerosAtualizados = rifa.numeros;
        if (novaLargura !== larguraAtual) {
          numerosAtualizados = {};
          Object.keys(rifa.numeros).forEach(k => {
            const novaChave = String(parseInt(k, 10)).padStart(novaLargura, '0');
            numerosAtualizados[novaChave] = rifa.numeros[k];
          });
          if (rifa.vencedor) {
            rifa.vencedor.numero = String(parseInt(rifa.vencedor.numero, 10)).padStart(novaLargura, '0');
          }
        }
        for (let i = rifa.totalNumeros + 1; i <= novoTotal; i++) {
          numerosAtualizados[String(i).padStart(novaLargura, '0')] = { status: 'livre' };
        }
        rifa.numeros = numerosAtualizados;
        rifa.totalNumeros = novoTotal;
        await KV.put(rifa.id, JSON.stringify(rifa));
        return json(rifa);
      }

      if (acao === 'sortear') {
        const pagos = Object.entries(rifa.numeros).filter(([, v]) => v.status === 'pago');
        if (!pagos.length) return json({ error: 'Ainda não há números pagos pra sortear.' }, 400);
        const [numero, dados] = pagos[Math.floor(Math.random() * pagos.length)];
        rifa.vencedor = { numero, nome: dados.nome || '', email: dados.email || '', sorteadoEm: Date.now() };
        await KV.put(rifa.id, JSON.stringify(rifa));
        return json(rifa);
      }

      return json({ error: 'Ação inválida.' }, 400);
    }

    return json({ error: 'Método não suportado' }, 405);

  } catch (e) {
    return json({ error: e.message }, 500);
  }
}
