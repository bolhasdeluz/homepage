// Cloudflare Pages Function: /api/pontos
// CRUD de pontos cantados via KV (PONTOS_KV)
// Env vars: RESEND_KEY

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

async function sendEmail(env, subject, html) {
  if (!env.RESEND_KEY) return;
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${env.RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'Bolhas de Luz <onboarding@resend.dev>', to: ['bolhasdeluz@gmail.com'], subject, html }),
    });
  } catch {}
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') return new Response('', { status: 200, headers: CORS });

  const KV = env.PONTOS_KV;
  const url = new URL(request.url);
  const method = request.method;

  if (!KV) return json({ error: 'KV não configurado.' }, 500);

  try {
    // GET /api/pontos
    if (method === 'GET') {
      const list = await KV.list({ prefix: 'ponto:' });
      const items = await Promise.all(list.keys.map(k => KV.get(k.name, { type: 'json' })));
      const pontos = items.filter(Boolean).sort((a, b) => (b.criadoEm || 0) - (a.criadoEm || 0));
      return json(pontos);
    }

    // POST /api/pontos
    if (method === 'POST') {
      const body = await request.json();
      const id = `ponto:${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
      const ponto = {
        id,
        nome:          body.nome || '',
        linha:         body.linha || '',
        tipo:          body.tipo || '',
        letra:         body.letra || '',
        yt:            body.yt || '',
        audioUrl:      body.audioUrl || '',
        audioStart:    body.audioStart != null ? Number(body.audioStart) : null,
        audioEnd:      body.audioEnd   != null ? Number(body.audioEnd)   : null,
        dataGravacao:  body.dataGravacao || '',
        isGuia:        !!body.isGuia,
        guia:          body.guia || '',
        postadoPor:    body.postadoPor || '',
        destaque:      !!body.destaque,
        criadoEm:      Date.now(),
      };
      await KV.put(id, JSON.stringify(ponto));
      await sendEmail(env,
        `🕯️ Novo ponto adicionado: ${ponto.nome}`,
        `<h2 style="color:#c4396b">Novo Ponto Cantado</h2>
         <p><b>Nome:</b> ${ponto.nome}</p>
         ${ponto.linha ? `<p><b>Linha:</b> ${ponto.linha}</p>` : ''}
         ${ponto.audioUrl ? `<p><b>🎙️ Tem áudio gravado</b>${ponto.audioStart!=null?' (com minutagem)':''}</p>` : ''}
         <p><b>Adicionado por:</b> ${ponto.postadoPor || 'Anônimo'}</p>`
      );
      return json(ponto);
    }

    // PUT /api/pontos
    if (method === 'PUT') {
      const body = await request.json();
      const { id, ...fields } = body;
      if (!id) return json({ error: 'id obrigatório' }, 400);
      const existing = await KV.get(id, { type: 'json' });
      if (!existing) return json({ error: 'Ponto não encontrado' }, 404);
      // normalize audioStart/audioEnd
      if (fields.audioStart != null) fields.audioStart = Number(fields.audioStart);
      if (fields.audioEnd   != null) fields.audioEnd   = Number(fields.audioEnd);
      const updated = { ...existing, ...fields, id };
      await KV.put(id, JSON.stringify(updated));
      return json(updated);
    }

    // DELETE /api/pontos?id=...
    if (method === 'DELETE') {
      const id = url.searchParams.get('id');
      if (!id) return json({ error: 'id obrigatório' }, 400);
      await KV.delete(id);
      return json({ ok: true });
    }

    return json({ error: 'Método não suportado' }, 405);
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}
