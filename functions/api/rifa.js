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
// molde do /api/perfil.

const ADMIN_PASSWORD = 'admin';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Password, X-User-Email',
  'Content-Type': 'application/json',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
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
    if (method === 'GET') {
      if (url.searchParams.get('historico') === '1') {
        if (!isAdmin) return json({ error: 'Não autorizado' }, 403);
        const list = await KV.list({ prefix: 'rifa:item:' });
        const itens = await Promise.all(list.keys.map(k => KV.get(k.name, { type: 'json' })));
        const rifas = itens.filter(Boolean).sort((a, b) => b.criadoEm - a.criadoEm);
        return json(rifas);
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

      // demais ações são só de admin
      if (!isAdmin) return json({ error: 'Não autorizado' }, 403);

      if (acao === 'confirmar-pagamento') {
        const numero = String(body.numero || '');
        const alvo = rifa.numeros[numero];
        if (!alvo || alvo.status === 'livre') return json({ error: 'Esse número não está reservado.' }, 400);
        alvo.status = 'pago';
        alvo.pagoEm = Date.now();
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
