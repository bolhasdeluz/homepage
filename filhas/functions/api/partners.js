// Cloudflare Pages Function: /api/partners
// Autentica no Odoo e retorna dados dos parceiros + passagens

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response('', { status: 200, headers: CORS });
  }

  const ODOO_URL  = env.ODOO_URL;
  const ODOO_DB   = env.ODOO_DB;
  const ODOO_USER = env.ODOO_USER;
  const ODOO_PASS = env.ODOO_PASS;

  if (!ODOO_URL || !ODOO_DB || !ODOO_USER || !ODOO_PASS) {
    return new Response(
      JSON.stringify({ error: 'Variáveis de ambiente não configuradas.' }),
      { status: 500, headers: CORS }
    );
  }

  function callKw(url, cookie, model, method, args, kwargs, id) {
    return fetch(`${url}/web/dataset/call_kw`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
      body: JSON.stringify({
        jsonrpc: '2.0', method: 'call', id,
        params: { model, method, args, kwargs }
      })
    }).then(r => r.json());
  }

  try {
    // 1. Autenticar
    const authRes = await fetch(`${ODOO_URL}/web/session/authenticate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', method: 'call', id: 1,
        params: { db: ODOO_DB, login: ODOO_USER, password: ODOO_PASS }
      })
    });

    const cookie   = authRes.headers.get('set-cookie') || '';
    const authData = await authRes.json();

    if (!authData.result?.uid) {
      return new Response(
        JSON.stringify({ error: 'Falha na autenticação com Odoo.' }),
        { status: 401, headers: CORS }
      );
    }

    // 2. Buscar parceiros
    const fields = [
      'name', 'function', 'image_128', 'id', 'email',
      'x_studio_data_da_iniciacao',
      'x_studio_caboclo',
      'x_studio_exu',
      'x_studio_pomba_gira',
      'x_studio_preto_velho',
      'x_studio_cigana',
      'x_studio_cosme',
    ];

    const [partnersRes, nomesRes, datasRes] = await Promise.all([
      callKw(ODOO_URL, cookie, 'res.partner', 'search_read',
        [[['user_ids', '!=', false]]],
        { fields, order: 'name asc' }, 2),

      callKw(ODOO_URL, cookie, 'x_res_partner_line_770ad', 'search_read',
        [[]],
        { fields: ['x_name', 'x_res_partner_id', 'x_studio_sequence'], order: 'x_studio_sequence asc' }, 3),

      callKw(ODOO_URL, cookie, 'x_res_partner_line_6f088', 'search_read',
        [[]],
        { fields: ['x_name', 'x_res_partner_id', 'x_studio_sequence'], order: 'x_studio_sequence asc' }, 4),
    ]);

    const partners = (partnersRes.result || []).filter(p => p.email !== ODOO_USER);

    const nomesPorPartner = {};
    const datasPorPartner = {};

    for (const row of (nomesRes.result || [])) {
      const pid = Array.isArray(row.x_res_partner_id) ? row.x_res_partner_id[0] : row.x_res_partner_id;
      if (!nomesPorPartner[pid]) nomesPorPartner[pid] = [];
      nomesPorPartner[pid].push(row.x_name);
    }
    for (const row of (datasRes.result || [])) {
      const pid = Array.isArray(row.x_res_partner_id) ? row.x_res_partner_id[0] : row.x_res_partner_id;
      if (!datasPorPartner[pid]) datasPorPartner[pid] = [];
      datasPorPartner[pid].push(row.x_name);
    }

    for (const p of partners) {
      p.passagens_nomes = nomesPorPartner[p.id] || [];
      p.passagens_datas = datasPorPartner[p.id] || [];
    }

    return new Response(JSON.stringify(partners), { status: 200, headers: CORS });

  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: CORS }
    );
  }
}
