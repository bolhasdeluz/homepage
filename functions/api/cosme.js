// Cloudflare Pages Function: /api/cosme
// Lista de inscrição pra Festa de Cosme e Damião — reaproveita o KV
// MENU_DATA (já usado por perfil.js, menu.js e rifa.js), guardando cada
// inscrição em "cosme:inscricao:<id>".
//
// POST é público (qualquer família pode se inscrever, sem precisar logar —
// é só uma ficha, acessada normalmente por QR code). GET (listar) e DELETE
// exigem o mesmo cabeçalho X-Admin-Password usado nos outros endpoints
// admin do site.

const ADMIN_PASSWORD = 'admin';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Password',
  'Content-Type': 'application/json',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response('', { status: 200, headers: CORS });
  }

  const KV = env.MENU_DATA;
  if (!KV) return json({ error: 'KV não configurado.' }, 500);

  const method = request.method;
  const isAdmin = request.headers.get('X-Admin-Password') === ADMIN_PASSWORD;

  try {
    // LIST — GET (só admin)
    if (method === 'GET') {
      if (!isAdmin) return json({ error: 'Não autorizado' }, 403);
      const list = await KV.list({ prefix: 'cosme:inscricao:' });
      const itens = await Promise.all(list.keys.map(k => KV.get(k.name, { type: 'json' })));
      const inscricoes = itens.filter(Boolean).sort((a, b) => a.criadoEm - b.criadoEm);
      return json(inscricoes);
    }

    // CREATE — POST (público)
    // tipo "crianca" (padrão) exige nome+idade+responsável; tipo "adulto" —
    // pra grupos só de adultos — só exige o nome, e aceita uma quantidade
    // de pessoas (útil quando não é uma pessoa sozinha, e sim um grupo)
    if (method === 'POST') {
      const body = await request.json();
      const tipo = body.tipo === 'adulto' ? 'adulto' : 'crianca';
      const nome = (body.nome || '').trim();
      const idade = (body.idade ?? '').toString().trim();
      const responsavel = (body.responsavel || '').trim();
      const telefone = (body.telefone || '').trim();
      const quantidadeNum = parseInt(body.quantidade, 10);
      const quantidade = (Number.isFinite(quantidadeNum) && quantidadeNum > 0) ? quantidadeNum : 1;
      if (tipo === 'crianca') {
        if (!nome || !idade || !responsavel) {
          return json({ error: 'Nome da criança, idade e nome do responsável são obrigatórios.' }, 400);
        }
      } else if (!nome) {
        return json({ error: 'Informe seu nome.' }, 400);
      }
      const id = `cosme:inscricao:${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const inscricao = { id, tipo, nome, idade, responsavel, quantidade, telefone, criadoEm: Date.now() };
      await KV.put(id, JSON.stringify(inscricao));
      return json(inscricao);
    }

    // DELETE (só admin)
    if (method === 'DELETE') {
      if (!isAdmin) return json({ error: 'Não autorizado' }, 403);
      const body = await request.json();
      if (!body.id) return json({ error: 'id obrigatório' }, 400);
      await KV.delete(body.id);
      return json({ ok: true });
    }

    return json({ error: 'Método não suportado' }, 405);

  } catch (e) {
    return json({ error: e.message }, 500);
  }
}
