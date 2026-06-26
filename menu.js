const ADMIN_PASSWORD = 'admin';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Password',
};

const DEFAULT_MENU = JSON.stringify({
  sections: [
    {
      id: 'publico',
      label: 'Público',
      items: [
        { id: 'inicio',    label: 'Início',          type: 'internal', page: 'inicio',   showCard: true,  showMenu: true  },
        { id: 'historia',  label: 'Nossa História',   type: 'internal', page: 'historia', showCard: true,  showMenu: true  },
        { id: 'sessoes',   label: 'Sessões & Eventos',type: 'external', url: 'https://calendario-drf.pages.dev', showCard: true, showMenu: true },
        { id: 'textos',    label: 'Textos da Casa',   type: 'internal', page: 'textos',   showCard: true,  showMenu: true  },
        { id: 'apoie',     label: 'Apoie o Terreiro', type: 'internal', page: 'apoie',    showCard: true,  showMenu: true  },
        { id: 'pontos',    label: 'Pontos Cantados',  type: 'external', url: 'https://pontoscantados.pages.dev', showCard: true, showMenu: true },
        { id: 'lojas',     label: 'Guia de Lojas',    type: 'external', url: 'https://floraselojas.pages.dev',  showCard: true, showMenu: true },
      ]
    },
    {
      id: 'corrente',
      label: 'Corrente',
      items: [
        { id: 'tesouraria',  label: 'Tesouraria',       type: 'members', url: '/tesouraria',  showCard: true, showMenu: true },
        { id: 'filhas',      label: 'Filhas da Casa',   type: 'members', url: '/filhas',      showCard: true, showMenu: true },
        { id: 'regimento',   label: 'Regimento Interno',type: 'members', url: 'https://regimentointerno.bolhasdeluz.workers.dev/', showCard: true, showMenu: true },
      ]
    }
  ]
});

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // OPTIONS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    // GET — retorna menu público
    if (request.method === 'GET') {
      let data = await env.MENU_DATA.get('menu');
      if (!data) {
        await env.MENU_DATA.put('menu', DEFAULT_MENU);
        data = DEFAULT_MENU;
      }
      return new Response(data, {
        headers: { ...CORS, 'Content-Type': 'application/json' }
      });
    }

    // POST — salva menu (requer senha admin)
    if (request.method === 'POST') {
      const password = request.headers.get('X-Admin-Password');
      if (password !== ADMIN_PASSWORD) {
        return new Response(JSON.stringify({ error: 'Não autorizado' }), {
          status: 401,
          headers: { ...CORS, 'Content-Type': 'application/json' }
        });
      }
      const body = await request.json();
      await env.MENU_DATA.put('menu', JSON.stringify(body));
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...CORS, 'Content-Type': 'application/json' }
      });
    }

    return new Response('Method not allowed', { status: 405, headers: CORS });
  }
};
