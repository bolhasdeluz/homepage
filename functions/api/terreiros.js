// functions/api/terreiros.js
// CRUD de terreiros + fluxo de solicitação/aprovação de entrada, via KV (MENU_DATA)
// Cada terreiro é um registro `terreiro:<id>` com nome, endereço e e-mails de admin.
// A associação da pessoa com o terreiro vive no próprio perfil (perfil:<email>):
// terreiroId + terreiroStatus ('pendente' | 'aprovado'). Perfil sem terreiroId é
// tratado como do terreiro padrão (bolhas-de-luz) — assim os dados que já existem
// hoje continuam funcionando sem precisar de uma migração em massa no KV.

const ADMIN_PASSWORD = 'admin';
const ADMIN_EMAILS = ['bolhasdeluz@gmail.com', 'annagomes.bdl@gmail.com'];
const TERREIRO_PADRAO = 'bolhas-de-luz';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Password, X-User-Email',
  'Content-Type': 'application/json',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

function isAdminGlobal(email, adminPwd) {
  return adminPwd === ADMIN_PASSWORD || (!!email && ADMIN_EMAILS.includes(email));
}

function isAdminDoTerreiro(email, terreiro, adminPwd) {
  if (isAdminGlobal(email, adminPwd)) return true;
  return !!email && !!terreiro && (terreiro.adminEmails || []).includes(email);
}

async function getTerreiro(KV, id) {
  const raw = await KV.get('terreiro:' + id);
  return raw ? JSON.parse(raw) : null;
}

async function listarPerfis(KV) {
  const list = await KV.list({ prefix: 'perfil:' });
  const perfis = await Promise.all(list.keys.map(async k => {
    const raw = await KV.get(k.name);
    return raw ? JSON.parse(raw) : null;
  }));
  return perfis.filter(Boolean);
}

async function membrosDoTerreiro(KV, id) {
  const perfis = await listarPerfis(KV);
  return perfis.filter(p => (p.terreiroId || TERREIRO_PADRAO) === id);
}

// Garante que os dois terreiros já combinados existam, sem nunca sobrescrever
// o que já estiver salvo — roda a cada request, é barato (só 2 GETs) e evita
// depender de alguém lembrar de criar isso manualmente pelo painel
const TERREIROS_SEED = [
  {
    id: 'bolhas-de-luz',
    nome: 'Bolhas de Luz',
    endereco: { logradouro: 'Rua Ary Tarrago, 2155', cidade: 'Porto Alegre', estado: 'RS' },
    adminEmails: ['bolhasdeluz@gmail.com', 'annagomes.bdl@gmail.com'],
  },
  {
    id: 'ile-da-mae-oxum',
    nome: 'Ilê da Mãe Oxum',
    endereco: { logradouro: 'Serafim Machado, 365', cidade: 'Porto Alegre', estado: 'RS' },
    adminEmails: ['charlottehslytherin@gmail.com'],
  },
];

async function ensureSeed(KV) {
  for (const seed of TERREIROS_SEED) {
    const existente = await getTerreiro(KV, seed.id);
    if (!existente) {
      await KV.put('terreiro:' + seed.id, JSON.stringify({ ...seed, criadoEm: Date.now() }));
    }
  }
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  const KV = env.MENU_DATA;
  if (!KV) return json({ error: 'KV não configurado.' }, 500);

  await ensureSeed(KV);

  const url = new URL(request.url);
  const adminPwd = request.headers.get('X-Admin-Password');
  const userEmail = (request.headers.get('X-User-Email') || '').toLowerCase();

  try {
    if (request.method === 'GET') {
      const id = url.searchParams.get('id');

      // GET ?id=X — detalhe de um terreiro
      if (id) {
        const terreiro = await getTerreiro(KV, id);
        if (!terreiro) return json({ error: 'Terreiro não encontrado' }, 404);

        const membros = await membrosDoTerreiro(KV, id);
        const aprovados = membros.filter(p => (p.terreiroStatus || 'aprovado') === 'aprovado');
        const souAdmin = isAdminDoTerreiro(userEmail, terreiro, adminPwd);
        const base = {
          id: terreiro.id,
          nome: terreiro.nome,
          endereco: terreiro.endereco || {},
          membroCount: aprovados.length,
          souAdmin,
        };

        if (souAdmin) {
          return json({
            ...base,
            adminEmails: terreiro.adminEmails || [],
            pendentes: membros
              .filter(p => p.terreiroStatus === 'pendente')
              .map(p => ({ email: p.email, nome: p.nome, foto: p.foto, solicitadoEm: p.terreiroSolicitadoEm })),
            membros: aprovados.map(p => ({ email: p.email, nome: p.nome, foto: p.foto, cargo: p.cargo, emoji: p.emoji })),
          });
        }
        return json(base);
      }

      // GET — lista todos os terreiros (para o seletor no perfil)
      const list = await KV.list({ prefix: 'terreiro:' });
      const terreiros = await Promise.all(list.keys.map(async k => {
        const raw = await KV.get(k.name);
        return raw ? JSON.parse(raw) : null;
      }));
      const perfis = await listarPerfis(KV);
      const resumo = terreiros.filter(Boolean).map(t => {
        const membroCount = perfis.filter(p =>
          (p.terreiroId || TERREIRO_PADRAO) === t.id && (p.terreiroStatus || 'aprovado') === 'aprovado'
        ).length;
        return { id: t.id, nome: t.nome, endereco: t.endereco || {}, membroCount };
      });
      return json(resumo);
    }

    let body;
    try { body = await request.json(); }
    catch (e) { return json({ error: 'JSON inválido' }, 400); }

    // POST — ações de solicitação/aprovação/criação
    if (request.method === 'POST') {
      const action = body.action;

      // pessoa loga e escolhe seu terreiro
      if (action === 'solicitar') {
        const email = (body.email || userEmail || '').toLowerCase();
        if (!email) return json({ error: 'Email obrigatório' }, 400);
        if (!isAdminGlobal(userEmail, adminPwd) && userEmail !== email) {
          return json({ error: 'Não autorizado' }, 403);
        }
        const terreiro = await getTerreiro(KV, body.terreiroId);
        if (!terreiro) return json({ error: 'Terreiro não encontrado' }, 404);

        const perfilRaw = await KV.get('perfil:' + email);
        if (!perfilRaw) return json({ error: 'Perfil não encontrado' }, 404);
        const perfil = JSON.parse(perfilRaw);
        perfil.terreiroId = terreiro.id;
        perfil.terreiroStatus = 'pendente';
        perfil.terreiroSolicitadoEm = Date.now();
        delete perfil.terreiroAprovadoEm;
        await KV.put('perfil:' + email, JSON.stringify(perfil));
        return json({ ok: true, terreiroId: terreiro.id, terreiroStatus: 'pendente' });
      }

      // admin do terreiro aprova ou rejeita um pedido
      if (action === 'aprovar' || action === 'rejeitar') {
        const email = (body.email || '').toLowerCase();
        if (!email) return json({ error: 'Email obrigatório' }, 400);
        const perfilRaw = await KV.get('perfil:' + email);
        if (!perfilRaw) return json({ error: 'Perfil não encontrado' }, 404);
        const perfil = JSON.parse(perfilRaw);

        const terreiroId = body.terreiroId || perfil.terreiroId;
        const terreiro = await getTerreiro(KV, terreiroId);
        if (!terreiro) return json({ error: 'Terreiro não encontrado' }, 404);
        // rejeitar também serve pra a própria pessoa desistir do pedido pendente
        const ehCancelamentoProprio = action === 'rejeitar' && email === userEmail && perfil.terreiroStatus === 'pendente';
        if (!ehCancelamentoProprio && !isAdminDoTerreiro(userEmail, terreiro, adminPwd)) {
          return json({ error: 'Não autorizado' }, 403);
        }

        if (action === 'aprovar') {
          perfil.terreiroId = terreiro.id;
          perfil.terreiroStatus = 'aprovado';
          perfil.terreiroAprovadoEm = Date.now();
        } else {
          perfil.terreiroId = null;
          perfil.terreiroStatus = null;
          delete perfil.terreiroSolicitadoEm;
        }
        await KV.put('perfil:' + email, JSON.stringify(perfil));
        return json({ ok: true });
      }

      // admin global cria um novo terreiro
      if (action === 'criar') {
        if (!isAdminGlobal(userEmail, adminPwd)) return json({ error: 'Não autorizado' }, 403);
        const id = (body.id || '').trim();
        if (!id || !/^[a-z0-9-]+$/.test(id)) {
          return json({ error: 'id inválido — use letras minúsculas, números e hífen' }, 400);
        }
        if (await getTerreiro(KV, id)) return json({ error: 'Já existe um terreiro com esse id' }, 409);

        const terreiro = {
          id,
          nome: body.nome || '',
          endereco: body.endereco || {},
          adminEmails: (body.adminEmails || []).map(e => String(e).toLowerCase()),
          criadoEm: Date.now(),
        };
        await KV.put('terreiro:' + id, JSON.stringify(terreiro));
        return json(terreiro);
      }

      return json({ error: 'Ação não suportada' }, 400);
    }

    // PUT — editar nome/endereço/admins de um terreiro existente
    if (request.method === 'PUT') {
      const id = body.id;
      if (!id) return json({ error: 'id obrigatório' }, 400);
      const terreiro = await getTerreiro(KV, id);
      if (!terreiro) return json({ error: 'Terreiro não encontrado' }, 404);
      if (!isAdminDoTerreiro(userEmail, terreiro, adminPwd)) {
        return json({ error: 'Não autorizado' }, 403);
      }

      if (body.nome !== undefined) terreiro.nome = body.nome;
      if (body.endereco !== undefined) terreiro.endereco = body.endereco;
      // só admin global pode trocar quem administra o terreiro
      if (body.adminEmails !== undefined && isAdminGlobal(userEmail, adminPwd)) {
        terreiro.adminEmails = body.adminEmails.map(e => String(e).toLowerCase());
      }
      await KV.put('terreiro:' + id, JSON.stringify(terreiro));
      return json(terreiro);
    }

    return json({ error: 'Método não suportado' }, 405);

  } catch (e) {
    return json({ error: e.message }, 500);
  }
}
