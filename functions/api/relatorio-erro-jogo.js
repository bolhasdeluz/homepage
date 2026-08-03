const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

const EMAIL_ADMIN = 'annagomes.bdl@gmail.com';

// os relatórios já ficam salvos no Firestore (relatorios_erros / quiz_relatorios_erros)
// pra admin revisar dentro do próprio jogo — esse endpoint só avisa por e-mail na hora,
// mesmo padrão de envio já usado em cartinha-email.js
async function enviarEmailRelatorioErro(env, { jogo, item, motivo, relatadoPor }) {
  const RESEND_KEY = env.RESEND_API_KEY;
  if (!RESEND_KEY) return;

  const html = `
    <div style="font-family:Georgia,serif;max-width:480px;margin:0 auto;padding:24px;background:#fff5f7;border-radius:12px">
      <h2 style="font-family:Georgia,serif;color:#c4396b;margin-bottom:4px">⚠️ Correção pedida num jogo</h2>
      <p style="color:#8a6070;font-size:14px;margin-bottom:20px">
        ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
      </p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:16px">
        <tr><td style="padding:6px 0;color:#8a6070">Jogo</td><td style="padding:6px 0;color:#2a1a22"><b>${jogo}</b></td></tr>
        ${item ? `<tr><td style="padding:6px 0;color:#8a6070">Item</td><td style="padding:6px 0;color:#2a1a22">${item}</td></tr>` : ''}
        <tr><td style="padding:6px 0;color:#8a6070">Relatado por</td><td style="padding:6px 0;color:#2a1a22">${relatadoPor}</td></tr>
      </table>
      <div style="padding:14px;background:#fff;border-radius:8px;border:1px solid rgba(196,57,107,.15);white-space:pre-wrap;color:#2a1a22;font-size:14px">
        ${motivo}
      </div>
      <div style="margin-top:20px;padding:12px;background:#fff;border-radius:8px;border:1px solid rgba(196,57,107,.15)">
        <a href="https://homepage-3vx.pages.dev" style="color:#c4396b;font-size:13px">Abrir o Terreirinho Digital →</a>
      </div>
    </div>`;

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Bolhas de Luz <notificacoes@bolhasdeluz.ong.br>',
      to: [EMAIL_ADMIN],
      subject: `⚠️ Correção pedida — ${jogo}`,
      html
    })
  });
  // roda dentro de waitUntil (não bloqueia a resposta pro cliente) — erro aqui
  // só aparece no log da função
  if (!resp.ok) {
    const detalhe = await resp.text().catch(() => '');
    console.error('relatorio-erro-jogo: Resend recusou o envio', resp.status, detalhe);
  }
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: CORS });

  let body;
  try { body = await request.json(); }
  catch (e) { return new Response(JSON.stringify({ error: 'JSON inválido' }), { status: 400, headers: CORS }); }

  const { jogo, item, motivo, relatadoPor } = body;
  if (!jogo || !motivo) return new Response(JSON.stringify({ error: 'Dados incompletos' }), { status: 400, headers: CORS });

  context.waitUntil(enviarEmailRelatorioErro(env, {
    jogo: String(jogo).slice(0, 60),
    item: String(item || '').slice(0, 200),
    motivo: String(motivo).slice(0, 1000),
    relatadoPor: String(relatadoPor || 'Anônimo').slice(0, 120),
  }));

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: CORS });
}
