const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Password',
  'Content-Type': 'application/json',
};

// ── FONTE ÚNICA ───────────────────────────────────────────────────
// Antes, Tesouraria, Relatório Anual e Meus Pagamentos tinham cada um sua
// própria cópia desta lista — e elas saíam de sincronia (foi o que causou o
// card de Meus Pagamentos mostrar 92% enquanto a Tesouraria mostrava 100%).
// Agora é só aqui: as três páginas buscam o resultado deste endpoint em vez
// de guardar a lista no próprio HTML.
const MEMBROS_TODOS_BASE = ['Ness','Thali','Jaque','Tassi','Brenda','Anne','Vitória','Manu','Juliana','Gabi','Márcia','Nicole','Stephani','Luana','Mikael','Miguel'];
// Membros que saíram da casa, com o mês (YYYY-MM) a partir do qual não contam mais
const MEMBROS_SAIDA = { 'Juliana': '2026-07', 'Ness': '2026-07', 'Mikael': '2026-04', 'Miguel': '2026-02' };
// mês (YYYY-MM) a partir do qual cada uma passou a contar — só precisa entrada
// pra quem entrou depois do começo do histórico (ex-membros cadastradas aqui
// só pra contar certinho em anos passados)
const MEMBROS_ENTRADA_BASE = { 'Miguel': '2025-07' };
// cargos "de casa" que contam como membro pagante da Tesouraria — mesma
// escada usada no Quadro das Filhas, menos Mãe da Casa (ela não paga
// mensalidade pra própria casa)
const MEMBROS_CARGOS_PERMITIDOS = ['Curumim', 'Tamoio', 'Naurú', 'Cacique', 'Cambona'];

function vinculoNormalizar(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

// mesmo índice de e-mails mantido por perfil.js — evita cair no list(), que
// no plano Free do Cloudflare tem uma cota do dia bem mais baixa que get/put
// (é por conta inteira, compartilhada com todos os outros projetos)
const PERFIL_INDICE_KEY = 'perfil:_index';

async function perfilIndiceObter(KV) {
  const indice = await KV.get(PERFIL_INDICE_KEY, { type: 'json' });
  if (indice) return indice;
  const list = await KV.list({ prefix: 'perfil:' });
  const emails = list.keys.map(k => k.name.slice('perfil:'.length)).filter(e => e !== '_index');
  await KV.put(PERFIL_INDICE_KEY, JSON.stringify(emails));
  return emails;
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (request.method !== 'GET') {
    return new Response('Method not allowed', { status: 405, headers: CORS });
  }

  const membrosTodos = MEMBROS_TODOS_BASE.slice();
  const membrosEntrada = Object.assign({}, MEMBROS_ENTRADA_BASE);
  const membrosIsentos = {};

  // completa com quem tem cargo de casa no cadastro de perfis e ainda não
  // está na lista base (ex.: alguém que acabou de entrar), marca quem está
  // isenta de mensalidade e pega a data de entrada registrada no perfil —
  // mesma lógica que antes vivia duplicada em cada página
  try {
    const emails = await perfilIndiceObter(env.MENU_DATA);
    const perfis = (await Promise.all(emails.map(async (email) => {
      const val = await env.MENU_DATA.get('perfil:' + email);
      return val ? JSON.parse(val) : null;
    }))).filter(Boolean);

    perfis
      .filter((p) => p && p.nome && p.ativo !== false && !p.isento && MEMBROS_CARGOS_PERMITIDOS.indexOf(p.cargo) !== -1)
      .forEach((p) => {
        const normalizado = vinculoNormalizar(p.nome);
        const jaTemAlguem = membrosTodos.some((m) => normalizado.indexOf(vinculoNormalizar(m)) !== -1);
        if (jaTemAlguem) return;
        const apelido = p.nome.trim().split(' ')[0];
        if (membrosTodos.indexOf(apelido) !== -1) return;
        membrosTodos.push(apelido);
      });

    perfis
      .filter((p) => p && p.nome && p.isento)
      .forEach((p) => {
        const normalizado = vinculoNormalizar(p.nome);
        const membro = membrosTodos.find((m) => normalizado.indexOf(vinculoNormalizar(m)) !== -1);
        if (membro) membrosIsentos[membro] = true;
      });

    perfis
      .filter((p) => p && p.nome && p.historia && p.historia.data_entrada)
      .forEach((p) => {
        const normalizado = vinculoNormalizar(p.nome);
        const membro = membrosTodos.find((m) => normalizado.indexOf(vinculoNormalizar(m)) !== -1);
        if (membro) membrosEntrada[membro] = p.historia.data_entrada.slice(0, 7);
      });
  } catch (e) {
    // sem acesso ao cadastro de perfis agora — segue só com a base histórica
  }

  const resultado = {
    membrosTodos,
    membrosSaida: MEMBROS_SAIDA,
    membrosEntrada,
    membrosIsentos,
    membrosCargosPermitidos: MEMBROS_CARGOS_PERMITIDOS,
  };

  return new Response(JSON.stringify(resultado), { status: 200, headers: CORS });
}
