const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-User-Email',
  'Content-Type': 'application/json',
};

// acha o perfil (com e-mail de login) a partir do uid do Firebase — os perfis
// ficam guardados na KV por e-mail, então precisa varrer procurando o uid salvo
async function buscarPerfilPorUid(env, uid) {
  const list = await env.MENU_DATA.list({ prefix: 'perfil:' });
  for (const k of list.keys) {
    const val = await env.MENU_DATA.get(k.name);
    if (!val) continue;
    try {
      const perfil = JSON.parse(val);
      if (perfil.uid === uid) return perfil;
    } catch (e) { /* ignora perfil corrompido */ }
  }
  return null;
}

async function enviarEmailCartinha(env, { paraEmail, deNome, mensagem }) {
  const RESEND_KEY = env.RESEND_API_KEY;
  if (!RESEND_KEY) return;

  const html = `
    <div style="font-family:Georgia,serif;max-width:480px;margin:0 auto;padding:24px;background:#fff5f7;border-radius:12px">
      <h2 style="font-family:Georgia,serif;color:#c4396b;margin-bottom:4px">💌 Você recebeu uma cartinha</h2>
      <p style="color:#8a6070;font-size:14px;margin-bottom:20px">
        ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
      </p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:16px">
        <tr><td style="padding:6px 0;color:#8a6070">De</td><td style="padding:6px 0;color:#2a1a22"><b>${deNome}</b></td></tr>
      </table>
      <div style="padding:14px;background:#fff;border-radius:8px;border:1px solid rgba(196,57,107,.15);white-space:pre-wrap;color:#2a1a22;font-size:14px">
        ${mensagem}
      </div>
      <div style="margin-top:20px;padding:12px;background:#fff;border-radius:8px;border:1px solid rgba(196,57,107,.15)">
        <a href="https://homepage-3vx.pages.dev" style="color:#c4396b;font-size:13px">Abrir o Terreirinho Digital →</a>
      </div>
    </div>`;

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Bolhas de Luz <notificacoes@bolhasdeluz.com>',
      to: [paraEmail],
      subject: `💌 Você recebeu uma cartinha de ${deNome}`,
      html
    })
  });
  // o envio roda dentro de waitUntil (não bloqueia a resposta pro cliente), então
  // um erro aqui não aparece em lugar nenhum a não ser no log da função — melhor
  // logar do que falhar calado feito antes
  if (!resp.ok) {
    const detalhe = await resp.text().catch(() => '');
    console.error('cartinha-email: Resend recusou o envio', resp.status, detalhe);
  }
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: CORS });

  // exige um e-mail de quem está logada mandando — mesma régua de confiança
  // já usada no /api/perfil (não é uma verificação criptográfica, mas barra
  // que a rota seja usada totalmente anônima/aberta)
  const deEmail = request.headers.get('X-User-Email');
  if (!deEmail) return new Response(JSON.stringify({ error: 'Não autorizado' }), { status: 401, headers: CORS });

  let body;
  try { body = await request.json(); }
  catch (e) { return new Response(JSON.stringify({ error: 'JSON inválido' }), { status: 400, headers: CORS }); }

  const { paraUid, deNome, mensagem } = body;
  if (!paraUid || !mensagem) return new Response(JSON.stringify({ error: 'Dados incompletos' }), { status: 400, headers: CORS });

  const perfil = await buscarPerfilPorUid(env, paraUid);
  if (perfil && perfil.email) {
    context.waitUntil(enviarEmailCartinha(env, {
      paraEmail: perfil.email,
      deNome: (deNome || 'Alguém da casa').slice(0, 80),
      mensagem: String(mensagem).slice(0, 500),
    }));
  } else {
    // não achou um perfil com esse uid — provavelmente essa conta ainda não fez
    // um login de verdade desde que o vínculo de uid passou a ser salvo
    console.warn('cartinha-email: nenhum perfil encontrado com uid', paraUid);
  }

  // sempre responde ok, mesmo se não achou o perfil — não revela pro cliente
  // se aquele uid tem e-mail cadastrado ou não
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: CORS });
}
