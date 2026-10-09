// Cloudflare Pages Function: /api/visita
// Contador de acessos diários, separado por página (?pagina=site|rifa-digital|
// cosmes|...) — cada página pública chama POST aqui ao carregar (sem corpo),
// que soma 1 no contador do dia (UTC) da página no KV MENU_DATA (chave
// "visita:<pagina>:YYYY-MM-DD") e marca o IP de quem acessou como visto
// hoje (chave "visita:<pagina>:<dia>:ip:<hash>"), pra dar pra contar quantas
// pessoas diferentes (por IP) passaram no dia, sem guardar o IP de verdade.
// Quando a pessoa está logada, o site manda um segundo POST com
// {email, nome} — esse só identifica quem acessou (guardado em
// "visita:<pagina>:<dia>:user:<email>"), sem contar de novo no total nem no
// IP (isso já foi feito no primeiro POST anônimo).
// GET (só admin) devolve, pra cada página já vista (registradas em
// "visita:paginas"), o total de acessos, quantos IPs diferentes e quem
// estava logada nos últimos dias — pro painel de administração.

const ADMIN_PASSWORD = 'admin';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Password',
  'Content-Type': 'application/json',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

function diaUTC(data) {
  return data.toISOString().slice(0, 10); // YYYY-MM-DD
}

function normalizarPagina(valor) {
  const limpo = String(valor || 'site').trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
  return limpo || 'site';
}

// hash curto e não-reversível do IP — dá pra contar quantos diferentes sem
// guardar o endereço de verdade
async function hashTexto(texto) {
  const dados = new TextEncoder().encode(texto);
  const hashBuffer = await crypto.subtle.digest('SHA-256', dados);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

async function registrarPagina(KV, pagina) {
  const existentes = (await KV.get('visita:paginas', { type: 'json' })) || [];
  if (!existentes.includes(pagina)) {
    existentes.push(pagina);
    await KV.put('visita:paginas', JSON.stringify(existentes));
  }
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response('', { status: 200, headers: CORS });
  }

  const KV = env.MENU_DATA;
  if (!KV) return json({ error: 'KV não configurado.' }, 500);

  const url = new URL(request.url);
  const pagina = normalizarPagina(url.searchParams.get('pagina'));

  if (request.method === 'POST') {
    const dia = diaUTC(new Date());
    let body = {};
    try { body = await request.json(); } catch (e) {}

    // guarda a partir de quando o contador dessa página passou a existir —
    // dias antes disso não têm 0 acessos de verdade, só ninguém contou ainda
    if (!(await KV.get(`visita:${pagina}:inicio`))) await KV.put(`visita:${pagina}:inicio`, dia);
    await registrarPagina(KV, pagina);

    if (body && body.email) {
      // segundo POST, só pra identificar quem já logou — não conta de
      // novo no total nem no IP, isso já rolou no POST anônimo
      const email = String(body.email).toLowerCase().trim();
      if (!email) return json({ error: 'E-mail inválido.' }, 400);
      const chaveUser = `visita:${pagina}:${dia}:user:${email}`;
      const existente = await KV.get(chaveUser, { type: 'json' });
      const nome = (body.nome || '').trim() || existente?.nome || email;
      await KV.put(chaveUser, JSON.stringify({ nome, email, acessos: (existente?.acessos || 0) + 1 }));
      return json({ ok: true });
    }

    // ping anônimo: soma no total do dia + marca o IP como visto hoje
    const chaveTotal = `visita:${pagina}:${dia}`;
    const atual = parseInt(await KV.get(chaveTotal), 10) || 0;
    await KV.put(chaveTotal, String(atual + 1));

    const ip = request.headers.get('CF-Connecting-IP') || 'desconhecido';
    const ipHash = await hashTexto(ip);
    await KV.put(`visita:${pagina}:${dia}:ip:${ipHash}`, '1');

    return json({ ok: true });
  }

  if (request.method === 'GET') {
    if (request.headers.get('X-Admin-Password') !== ADMIN_PASSWORD) {
      return json({ error: 'Não autorizado' }, 403);
    }
    const dias = Math.min(60, Math.max(1, parseInt(url.searchParams.get('dias'), 10) || 14));
    const paginaFiltro = url.searchParams.get('pagina');
    const paginas = paginaFiltro
      ? [normalizarPagina(paginaFiltro)]
      : ((await KV.get('visita:paginas', { type: 'json' })) || ['site']);

    const agora = new Date();
    const datas = [];
    for (let i = 0; i < dias; i++) {
      datas.push(diaUTC(new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate() - i))));
    }

    const paginasResultado = {};
    for (const pag of paginas) {
      const inicio = await KV.get(`visita:${pag}:inicio`);
      paginasResultado[pag] = await Promise.all(datas.map(async dia => {
        // dia anterior ao contador existir — não é "0 acessos", é "não
        // tinha contador ainda"; deixa isso claro em vez de mostrar zero
        if (inicio && dia < inicio) {
          return { dia, contagem: null, unicos: null, logados: [], semDados: true };
        }
        const [totalRaw, listaIps, listaUsers] = await Promise.all([
          KV.get(`visita:${pag}:${dia}`),
          KV.list({ prefix: `visita:${pag}:${dia}:ip:` }),
          KV.list({ prefix: `visita:${pag}:${dia}:user:` }),
        ]);
        const logados = (await Promise.all(listaUsers.keys.map(k => KV.get(k.name, { type: 'json' }))))
          .filter(Boolean)
          .sort((a, b) => b.acessos - a.acessos);
        return { dia, contagem: parseInt(totalRaw, 10) || 0, unicos: listaIps.keys.length, logados, semDados: false };
      }));
    }
    return json({ paginas: paginasResultado });
  }

  return json({ error: 'Método não suportado' }, 405);
}
