const ADMIN_PASSWORD = 'admin';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Password, X-User-Email',
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    const url = new URL(request.url);
    const email = url.searchParams.get('email') || request.headers.get('X-User-Email');

    // GET — retorna perfil por email
    if (request.method === 'GET') {
      if (!email) {
        return new Response(JSON.stringify({ error: 'Email obrigatório' }), {
          status: 400, headers: { ...CORS, 'Content-Type': 'application/json' }
        });
      }
      const key = `perfil:${email.toLowerCase()}`;
      const data = await env.MENU_DATA.get(key);
      if (!data) {
        // perfil vazio para novo usuário
        const vazio = {
          email: email.toLowerCase(),
          nome: '',
          cargo: '',
          foto: '',
          historia: {},
          guias: {},
          cruzamentos: {},
          notas: '',
          criadoEm: Date.now()
        };
        return new Response(JSON.stringify(vazio), {
          headers: { ...CORS, 'Content-Type': 'application/json' }
        });
      }
      return new Response(data, {
        headers: { ...CORS, 'Content-Type': 'application/json' }
      });
    }

    // POST — salvar perfil (usuária salva o próprio, admin salva qualquer um)
    if (request.method === 'POST') {
      const userEmail = request.headers.get('X-User-Email');
      const adminPwd  = request.headers.get('X-Admin-Password');
      const isAdmin   = adminPwd === ADMIN_PASSWORD;

      if (!userEmail && !isAdmin) {
        return new Response(JSON.stringify({ error: 'Não autorizado' }), {
          status: 401, headers: { ...CORS, 'Content-Type': 'application/json' }
        });
      }

      const body = await request.json();
      const targetEmail = (body.email || userEmail || '').toLowerCase();

      // usuária só pode salvar o próprio perfil
      if (!isAdmin && userEmail.toLowerCase() !== targetEmail) {
        return new Response(JSON.stringify({ error: 'Não autorizado' }), {
          status: 403, headers: { ...CORS, 'Content-Type': 'application/json' }
        });
      }

      const key = `perfil:${targetEmail}`;
      body.atualizadoEm = Date.now();
      await env.MENU_DATA.put(key, JSON.stringify(body));

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...CORS, 'Content-Type': 'application/json' }
      });
    }

    return new Response('Method not allowed', { status: 405, headers: CORS });
  }
};
