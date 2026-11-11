// Cloudflare Pages Function: /api/anotacoes-mae-de-santo
// -----------------------------------------------------------------------
// Anotações da Mãe de Santo, organizadas em tópicos (título + texto) —
// só ela escreve (exige X-Admin-Password, igual aos outros endpoints
// administrativos do site), mas qualquer um pode ler. Pensado como um
// espaço simples pra registrar orientações/reflexões que a casa toda
// deve poder consultar, sem virar um documento formal como o Estatuto
// Interno (ver regimentointerno.html).
// Guardado como uma lista única em MENU_DATA (chave
// "anotacoes-mae-de-santo:lista") — mesmo molde de
// /api/sugestoes-manual.js, volume esperado é baixo.

const ADMIN_PASSWORD = 'admin';
const TITULO_MAX = 120;
const TEXTO_MAX = 4000;
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Password',
  'Content-Type': 'application/json',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

function validarCampos(body) {
  const titulo = String(body.titulo || '').trim();
  const texto = String(body.texto || '').trim();
  if (!titulo) return { erro: 'Escreve um título pro tópico.' };
  if (!texto) return { erro: 'Escreve o texto do tópico.' };
  if (titulo.length > TITULO_MAX) return { erro: `Título muito longo (máximo ${TITULO_MAX} caracteres).` };
  if (texto.length > TEXTO_MAX) return { erro: `Texto muito longo (máximo ${TEXTO_MAX} caracteres).` };
  return { titulo, texto };
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response('', { status: 200, headers: CORS });
  }

  const KV = env.MENU_DATA;
  if (!KV) return json({ error: 'KV não configurado.' }, 500);

  const method = request.method;

  try {
    const lista = (await KV.get('anotacoes-mae-de-santo:lista', { type: 'json' })) || [];

    // GET — pública, lista completa
    if (method === 'GET') {
      const ordenada = lista.slice().sort((a, b) => (b.atualizadoEm || b.criadoEm || 0) - (a.atualizadoEm || a.criadoEm || 0));
      return json({ topicos: ordenada });
    }

    // escrita (POST/PUT/DELETE) — só a Mãe de Santo
    if (request.headers.get('X-Admin-Password') !== ADMIN_PASSWORD) {
      return json({ error: 'Não autorizado' }, 403);
    }
    const body = await request.json();

    // POST — cria um tópico novo
    if (method === 'POST') {
      const v = validarCampos(body);
      if (v.erro) return json({ error: v.erro }, 400);
      const agora = Date.now();
      const novo = {
        id: `${agora.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        titulo: v.titulo,
        texto: v.texto,
        criadoEm: agora,
        atualizadoEm: agora,
      };
      lista.push(novo);
      await KV.put('anotacoes-mae-de-santo:lista', JSON.stringify(lista));
      return json({ ok: true, topico: novo });
    }

    // PUT — edita um tópico existente
    if (method === 'PUT') {
      const id = String(body.id || '');
      const topico = lista.find(t => t.id === id);
      if (!topico) return json({ error: 'Tópico não encontrado.' }, 404);
      const v = validarCampos(body);
      if (v.erro) return json({ error: v.erro }, 400);
      topico.titulo = v.titulo;
      topico.texto = v.texto;
      topico.atualizadoEm = Date.now();
      await KV.put('anotacoes-mae-de-santo:lista', JSON.stringify(lista));
      return json({ ok: true, topico });
    }

    // DELETE — apaga um tópico
    if (method === 'DELETE') {
      const id = String(body.id || '');
      if (!id) return json({ error: 'Informe o id do tópico.' }, 400);
      const restante = lista.filter(t => t.id !== id);
      await KV.put('anotacoes-mae-de-santo:lista', JSON.stringify(restante));
      return json({ ok: true });
    }

    return json({ error: 'Método não suportado' }, 405);

  } catch (e) {
    return json({ error: e.message }, 500);
  }
}
