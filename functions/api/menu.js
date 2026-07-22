const ADMIN_PASSWORD = 'admin';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Password',
  'Content-Type': 'application/json',
};

const DEFAULT_MENU = JSON.stringify({
  sections: [
    { id: 'publico', label: 'Público', items: [
      { id: 'inicio',   label: 'Início',           type: 'internal', page: 'inicio',   showCard: true, showMenu: true },
      { id: 'historia', label: 'Nossa História',    type: 'external', url: '/historia', showCard: true, showMenu: true, desc: 'A fundação do Bolhas de Luz' },
      { id: 'sessoes',  label: 'Sessões & Eventos', type: 'external', url: 'https://calendario-drf.pages.dev', showCard: true, showMenu: true, desc: 'Sessões e eventos da casa' },
      { id: 'blog',     label: '📖 Blog do Terreiro', type: 'internal', page: 'blog',     showCard: true, showMenu: true },
      { id: 'apoie',    label: 'Apoie o Terreiro',  type: 'external', url: '/apoie',    showCard: true, showMenu: true, desc: 'Como nos ajudar' },
      { id: 'pontos',   label: 'Pontos Cantados',   type: 'external', url: 'https://pontoscantados.pages.dev', showCard: true, showMenu: true, desc: 'Catálogo com player de áudio e letras' },
      { id: 'lojas',    label: 'Guia de Lojas',     type: 'external', url: 'https://floraselojas.pages.dev', showCard: true, showMenu: true, desc: 'Artigos religiosos recomendados' },
      { id: 'compras',  label: '🛒 Necessidades da casa', type: 'internal', page: 'compras', showCard: true, showMenu: true, desc: 'Veja o que a casa está precisando' },
      { id: 'pix',      label: 'Pix para doações',   type: 'external', url: '/pix', showCard: true, showMenu: true, desc: 'Chave: bolhasdeluz@gmail.com' },
      { id: 'manutencao', label: '🔧 Manutenção',     type: 'external', url: '/manutencao.html', showCard: true, showMenu: true, desc: 'Tarefas e reparos da casa' },
      { id: 'quiz',       label: '🔮 Quiz de Fundamentos', type: 'external', url: '/quiz.html', showCard: true, showMenu: true, desc: 'Teste seus conhecimentos, com ranking da casa' },
      { id: 'jogos',      label: '🏠 Sua Terreirinha',    type: 'internal', page: 'jogos', showCard: true, showMenu: true, desc: 'Monte seu cantinho, ganhe objetos novos e jogue os desafios da casa' },
      { id: 'resumo',     label: '📋 Resumo Mensal',       type: 'external', url: '/resumo', showCard: true, showMenu: true, desc: 'Tudo pronto pra printar e mandar no grupo' },
      { id: 'orientacoes', label: '📢 Orientações da Sessão', type: 'internal', page: 'orientacoes', showCard: true, showMenu: true, desc: 'Monte o aviso da próxima sessão rapidinho' },
    ]},
    { id: 'corrente', label: 'Corrente', items: [
      { id: 'tesouraria', label: 'Tesouraria',        type: 'members', url: '/tesouraria', showCard: true, showMenu: true, desc: 'Finanças e obrigações da casa' },
      { id: 'filhas',     label: 'Filhas da Casa',    type: 'members', url: '/filhas',     showCard: true, showMenu: true, desc: 'Perfis e guias espirituais' },
      { id: 'regimento',  label: 'Regimento Interno', type: 'members', url: 'https://regimentointerno.bolhasdeluz.workers.dev/', showCard: true, showMenu: true, desc: 'Normas e condutas da casa' },
    ]}
  ]
});

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  if (request.method === 'GET') {
    let data = await env.MENU_DATA.get('menu');
    let precisaRestaurar = !data;
    if (!precisaRestaurar) {
      try {
        const parsed = JSON.parse(data);
        const totalItens = (parsed.sections || []).reduce((n, sec) => n + (sec.items?.length || 0), 0);
        if (!totalItens) precisaRestaurar = true;
      } catch (e) {
        precisaRestaurar = true;
      }
    }
    if (precisaRestaurar) {
      await env.MENU_DATA.put('menu', DEFAULT_MENU);
      data = DEFAULT_MENU;
    }
    return new Response(data, { status: 200, headers: CORS });
  }

  if (request.method === 'POST') {
    const password = request.headers.get('X-Admin-Password');
    if (password !== ADMIN_PASSWORD) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }), { status: 401, headers: CORS });
    }
    const body = await request.json();
    await env.MENU_DATA.put('menu', JSON.stringify(body));
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: CORS });
  }

  return new Response('Method not allowed', { status: 405, headers: CORS });
}
