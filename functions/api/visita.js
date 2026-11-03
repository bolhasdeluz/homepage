// Cloudflare Pages Function: /api/visita
// Contador de acessos diários, separado por página (?pagina=site|rifa-digital|
// cosmes|...) — cada página pública chama POST aqui ao carregar (sem corpo),
// que soma 1 no contador do dia (UTC) da página no KV MENU_DATA (chave
// "visita:<pagina>:YYYY-MM-DD") e guarda o IP de quem acessou (com hash, não
// o endereço de verdade) numa lista única do dia ("visita:<pagina>:<dia>:ips"),
// pra dar pra contar quantas pessoas diferentes passaram. Quando a pessoa
// está logada, o site manda um segundo POST com {email, nome} — esse só
// identifica quem acessou (guardado em "visita:<pagina>:<dia>:users"), sem
// contar de novo no total nem no IP (isso já rolou no POST anônimo).
// GET (só admin) devolve, pra cada página já vista (registradas em
// "visita:paginas"), o total de acessos, quantos IPs diferentes e quem
// estava logada nos últimos dias — pro painel de administração e pro
// Relatório de Visitas e QR Code.
//
// "ips" e "users" do dia ficam numa chave só por dia (lida/escrita com
// get/put) em vez de uma chave por IP/usuário lida com list() — list() é a
// operação mais limitada de KV no plano gratuito, e esse endpoint antes
// fazia 2 list() por dia × por página toda vez que o relatório abria (foi
// exatamente esse padrão, só que na rifa, que já derrubou a leitura dela
// uma vez por estourar a cota — ver rifa.js). Dias registrados antes dessa
// mudança não tinham essa chave agregada; pra esses, "únicos"/"logados"
// aparece zerado (o total de acessos do dia continua certo, esse nunca usou
// list()).

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
      const chaveUsers = `visita:${pagina}:${dia}:users`;
      const users = (await KV.get(chaveUsers, { type: 'json' })) || {};
      const nome = (body.nome || '').trim() || users[email]?.nome || email;
      users[email] = { nome, email, acessos: (users[email]?.acessos || 0) + 1 };
      await KV.put(chaveUsers, JSON.stringify(users));
      return json({ ok: true });
    }

    // ping anônimo: soma no total do dia + marca o IP como visto hoje
    const chaveTotal = `visita:${pagina}:${dia}`;
    const atual = parseInt(await KV.get(chaveTotal), 10) || 0;
    await KV.put(chaveTotal, String(atual + 1));

    const chaveIps = `visita:${pagina}:${dia}:ips`;
    const ip = request.headers.get('CF-Connecting-IP') || 'desconhecido';
    const ipHash = await hashTexto(ip);
    const ips = (await KV.get(chaveIps, { type: 'json' })) || [];
    if (!ips.includes(ipHash)) {
      ips.push(ipHash);
      await KV.put(chaveIps, JSON.stringify(ips));
    }

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
        const [totalRaw, ips, users] = await Promise.all([
          KV.get(`visita:${pag}:${dia}`),
          KV.get(`visita:${pag}:${dia}:ips`, { type: 'json' }),
          KV.get(`visita:${pag}:${dia}:users`, { type: 'json' }),
        ]);
        const logados = Object.values(users || {}).sort((a, b) => b.acessos - a.acessos);
        return { dia, contagem: parseInt(totalRaw, 10) || 0, unicos: (ips || []).length, logados, semDados: false };
      }));
    }
    return json({ paginas: paginasResultado });
  }

  return json({ error: 'Método não suportado' }, 405);
}
