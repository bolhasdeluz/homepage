// Cloudflare Pages Function: /api/biblioteca
// -----------------------------------------------------------------------
// Biblioteca Digital do Terreiro — catálogo dos livros físicos da casa:
// título, autor, ano, vertente (Umbanda, Quimbanda, Candomblé etc.), quem
// é o dono do livro, e com quem ele está agora (pra saber quando um livro
// emprestado precisa voltar). GET é público; criar, editar e apagar exigem
// o mesmo X-Admin-Password usado nos outros endpoints administrativos.
// Guardado como uma lista única em MENU_DATA (chave "biblioteca:lista") —
// volume esperado é baixo (dezenas/poucas centenas de livros).

const ADMIN_PASSWORD = 'admin';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Password',
  'Content-Type': 'application/json',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

function normalizarLivro(body, existente) {
  const base = existente || {};
  return {
    ...base,
    titulo: body.titulo !== undefined ? String(body.titulo).trim() : (base.titulo || ''),
    autor: body.autor !== undefined ? String(body.autor).trim() : (base.autor || ''),
    ano: body.ano !== undefined ? String(body.ano).trim() : (base.ano || ''),
    vertente: body.vertente !== undefined ? String(body.vertente).trim() : (base.vertente || ''),
    dono: body.dono !== undefined ? String(body.dono).trim() : (base.dono || ''),
    comQuemEsta: body.comQuemEsta !== undefined ? String(body.comQuemEsta).trim() : (base.comQuemEsta || ''),
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
  const method = request.method;

  try {
    const lista = (await KV.get('biblioteca:lista', { type: 'json' })) || [];

    // GET — pública, lista completa de livros
    if (method === 'GET') {
      const ordenada = lista.slice().sort((a, b) => (a.titulo || '').localeCompare(b.titulo || '', 'pt-BR'));
      return json({ livros: ordenada });
    }

    // POST — só admin, cadastra um livro novo
    if (method === 'POST') {
      if (!isAdmin) return json({ error: 'Não autorizado' }, 403);
      const body = await request.json();
      const titulo = String(body.titulo || '').trim();
      if (!titulo) return json({ error: 'O título é obrigatório.' }, 400);

      const novo = normalizarLivro(body);
      novo.id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      novo.criadoEm = Date.now();
      novo.atualizadoEm = Date.now();
      lista.push(novo);
      await KV.put('biblioteca:lista', JSON.stringify(lista));
      return json({ ok: true, livro: novo });
    }

    // PUT — só admin, edita um livro existente (dados ou com-quem-está)
    if (method === 'PUT') {
      if (!isAdmin) return json({ error: 'Não autorizado' }, 403);
      const body = await request.json();
      const id = String(body.id || '');
      if (!id) return json({ error: 'Informe o id do livro.' }, 400);
      const alvo = lista.find(l => l.id === id);
      if (!alvo) return json({ error: 'Livro não encontrado.' }, 404);

      const atualizado = normalizarLivro(body, alvo);
      atualizado.atualizadoEm = Date.now();
      Object.assign(alvo, atualizado);
      await KV.put('biblioteca:lista', JSON.stringify(lista));
      return json({ ok: true, livro: alvo });
    }

    // DELETE — só admin, remove um livro do catálogo
    if (method === 'DELETE') {
      if (!isAdmin) return json({ error: 'Não autorizado' }, 403);
      const body = await request.json();
      const id = String(body.id || '');
      if (!id) return json({ error: 'Informe o id do livro.' }, 400);
      const restante = lista.filter(l => l.id !== id);
      if (restante.length === lista.length) return json({ error: 'Livro não encontrado.' }, 404);
      await KV.put('biblioteca:lista', JSON.stringify(restante));
      return json({ ok: true });
    }

    return json({ error: 'Método não suportado' }, 405);

  } catch (e) {
    return json({ error: e.message }, 500);
  }
}
