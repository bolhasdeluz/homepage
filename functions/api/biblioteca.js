// Cloudflare Pages Function: /api/biblioteca
// -----------------------------------------------------------------------
// Biblioteca Digital do Terreiro — catálogo dos livros físicos da casa:
// título, autor, ano, vertente (Umbanda, Quimbanda, Candomblé etc.), quem
// é o dono do livro, e com quem ele está agora (pra saber quando um livro
// emprestado precisa voltar). GET é público.
//
// Quem está logada (manda X-User-Email, mesmo padrão de perfil.js) pode,
// sozinha, sem precisar da senha de admin: cadastrar um livro novo (o dono
// já sai sendo ela mesma, puxado do perfil — nunca aceita um "dono" digitado
// por fora, pra não dar pra fingir ser outra pessoa), pegar emprestado um
// livro disponível (comQuemEsta vira o nome dela) e devolver um livro que
// esteja com ela. Editar os dados do livro (título, autor etc.) ou apagar
// só quem é dona do livro ou a admin pode. X-Admin-Password sempre passa
// por cima de tudo isso, pra admin poder corrigir qualquer coisa.
//
// Guardado como uma lista única em MENU_DATA (chave "biblioteca:lista") —
// volume esperado é baixo (dezenas/poucas centenas de livros).

const ADMIN_PASSWORD = 'admin';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Password, X-User-Email',
  'Content-Type': 'application/json',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

async function obterPerfil(KV, email) {
  if (!email) return null;
  const data = await KV.get('perfil:' + email.toLowerCase());
  return data ? JSON.parse(data) : null;
}

function normalizarCamposLivro(body, existente) {
  const base = existente || {};
  return {
    ...base,
    titulo: body.titulo !== undefined ? String(body.titulo).trim() : (base.titulo || ''),
    autor: body.autor !== undefined ? String(body.autor).trim() : (base.autor || ''),
    ano: body.ano !== undefined ? String(body.ano).trim() : (base.ano || ''),
    vertente: body.vertente !== undefined ? String(body.vertente).trim() : (base.vertente || ''),
  };
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response('', { status: 200, headers: CORS });
  }

  const KV = env.MENU_DATA;
  if (!KV) return json({ error: 'KV não configurado.' }, 500);

  const isAdmin = request.headers.get('X-Admin-Password') === ADMIN_PASSWORD;
  const userEmail = (request.headers.get('X-User-Email') || '').toLowerCase() || null;
  const method = request.method;

  try {
    const lista = (await KV.get('biblioteca:lista', { type: 'json' })) || [];

    // GET — pública, lista completa de livros
    if (method === 'GET') {
      const ordenada = lista.slice().sort((a, b) => (a.titulo || '').localeCompare(b.titulo || '', 'pt-BR'));
      return json({ livros: ordenada });
    }

    // POST — admin cadastra qualquer livro (dono explícito no corpo); quem
    // está logada cadastra um livro que é dela mesma (dono/donoEmail vêm do
    // perfil, nunca do que foi mandado no corpo)
    if (method === 'POST') {
      if (!isAdmin && !userEmail) return json({ error: 'Não autorizado' }, 403);
      const body = await request.json();
      const titulo = String(body.titulo || '').trim();
      if (!titulo) return json({ error: 'O título é obrigatório.' }, 400);

      let dono = '', donoEmail = '';
      if (isAdmin) {
        dono = String(body.dono || '').trim();
        donoEmail = String(body.donoEmail || '').trim().toLowerCase();
      } else {
        const perfil = await obterPerfil(KV, userEmail);
        dono = (perfil && perfil.nome) || userEmail;
        donoEmail = userEmail;
      }

      const novo = {
        ...normalizarCamposLivro(body),
        titulo,
        dono,
        donoEmail,
        comQuemEsta: '',
        comQuemEstaEmail: '',
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        criadoEm: Date.now(),
        atualizadoEm: Date.now(),
      };
      lista.push(novo);
      await KV.put('biblioteca:lista', JSON.stringify(lista));
      return json({ ok: true, livro: novo });
    }

    // PUT — edita um livro existente
    if (method === 'PUT') {
      const body = await request.json();
      const id = String(body.id || '');
      if (!id) return json({ error: 'Informe o id do livro.' }, 400);
      const alvo = lista.find(l => l.id === id);
      if (!alvo) return json({ error: 'Livro não encontrado.' }, 404);

      // admin: edita qualquer campo, de qualquer livro
      if (isAdmin) {
        const atualizado = { ...alvo, ...normalizarCamposLivro(body, alvo) };
        if (body.dono !== undefined) atualizado.dono = String(body.dono).trim();
        if (body.donoEmail !== undefined) atualizado.donoEmail = String(body.donoEmail).trim().toLowerCase();
        if (body.comQuemEsta !== undefined) atualizado.comQuemEsta = String(body.comQuemEsta).trim();
        if (body.comQuemEstaEmail !== undefined) atualizado.comQuemEstaEmail = String(body.comQuemEstaEmail).trim().toLowerCase();
        atualizado.atualizadoEm = Date.now();
        Object.assign(alvo, atualizado);
        await KV.put('biblioteca:lista', JSON.stringify(lista));
        return json({ ok: true, livro: alvo });
      }

      if (!userEmail) return json({ error: 'Não autorizado' }, 403);

      // dona do livro: pode editar os dados dele, e também mexer em quem
      // está com ele (ex: emprestar pra alguém de fora, registrar a
      // devolução de quem quer que esteja com ele)
      if (alvo.donoEmail === userEmail) {
        const atualizado = { ...alvo, ...normalizarCamposLivro(body, alvo) };
        if (body.comQuemEsta !== undefined) {
          atualizado.comQuemEsta = String(body.comQuemEsta).trim();
          atualizado.comQuemEstaEmail = atualizado.comQuemEsta ? (body.comQuemEstaEmail ? String(body.comQuemEstaEmail).trim().toLowerCase() : '') : '';
        }
        atualizado.atualizadoEm = Date.now();
        Object.assign(alvo, atualizado);
        await KV.put('biblioteca:lista', JSON.stringify(lista));
        return json({ ok: true, livro: alvo });
      }

      // não é a dona — só pode fazer duas coisas de autoatendimento, e
      // nenhuma outra alteração junto na mesma chamada: pegar emprestado um
      // livro livre, ou devolver um livro que está com ela mesma
      const only = (obj, chaves) => Object.keys(obj).every(k => chaves.includes(k));
      const disponivel = !alvo.comQuemEsta || alvo.comQuemEsta === alvo.dono;

      if (only(body, ['id', 'comQuemEsta']) && disponivel && body.comQuemEsta) {
        const perfil = await obterPerfil(KV, userEmail);
        alvo.comQuemEsta = (perfil && perfil.nome) || userEmail;
        alvo.comQuemEstaEmail = userEmail;
        alvo.atualizadoEm = Date.now();
        await KV.put('biblioteca:lista', JSON.stringify(lista));
        return json({ ok: true, livro: alvo });
      }
      if (only(body, ['id', 'comQuemEsta']) && !body.comQuemEsta && alvo.comQuemEstaEmail === userEmail) {
        alvo.comQuemEsta = '';
        alvo.comQuemEstaEmail = '';
        alvo.atualizadoEm = Date.now();
        await KV.put('biblioteca:lista', JSON.stringify(lista));
        return json({ ok: true, livro: alvo });
      }

      return json({ error: 'Não autorizado' }, 403);
    }

    // DELETE — admin ou a própria dona do livro
    if (method === 'DELETE') {
      const body = await request.json();
      const id = String(body.id || '');
      if (!id) return json({ error: 'Informe o id do livro.' }, 400);
      const alvo = lista.find(l => l.id === id);
      if (!alvo) return json({ error: 'Livro não encontrado.' }, 404);
      if (!isAdmin && alvo.donoEmail !== userEmail) return json({ error: 'Não autorizado' }, 403);

      const restante = lista.filter(l => l.id !== id);
      await KV.put('biblioteca:lista', JSON.stringify(restante));
      return json({ ok: true });
    }

    return json({ error: 'Método não suportado' }, 405);

  } catch (e) {
    return json({ error: e.message }, 500);
  }
}
