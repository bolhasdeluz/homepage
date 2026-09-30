// Cloudflare Pages Function: /api/google-diag
// Endpoint de diagnóstico temporário pra investigar a configuração da
// integração com o Google Agenda direto pelo navegador (sem precisar do
// app nem de cabeçalhos especiais) — aceita a senha por query string
// (?senha=admin) só pra isso. Não expõe a chave privada em si, só
// informações sobre ela (tamanho, se decodifica).

const ADMIN_PASSWORD = 'admin';

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), { status, headers: { 'Content-Type': 'application/json' } });
}

function gcalLimparChavePem(chavePem) {
  const comQuebras = String(chavePem || '').replace(/\\n/g, '\n');
  const linhas = comQuebras.split('\n').filter(l => !l.toUpperCase().includes('PRIVATE KEY'));
  return linhas.join('').replace(/[^A-Za-z0-9+/=]/g, '');
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  if (url.searchParams.get('senha') !== ADMIN_PASSWORD) return json({ error: 'Não autorizado' }, 403);

  const resultado = {
    GOOGLE_SA_EMAIL_presente: !!env.GOOGLE_SA_EMAIL,
    GOOGLE_SA_EMAIL_valor: env.GOOGLE_SA_EMAIL || null,
    GOOGLE_CALENDAR_ID_presente: !!env.GOOGLE_CALENDAR_ID,
    GOOGLE_CALENDAR_ID_valor: env.GOOGLE_CALENDAR_ID || null,
    GOOGLE_SA_PRIVATE_KEY_presente: !!env.GOOGLE_SA_PRIVATE_KEY,
    GOOGLE_SA_PRIVATE_KEY_tamanho_bruto: (env.GOOGLE_SA_PRIVATE_KEY || '').length,
  };

  if (env.GOOGLE_SA_PRIVATE_KEY) {
    const limpo = gcalLimparChavePem(env.GOOGLE_SA_PRIVATE_KEY);
    resultado.chave_tamanho_limpo = limpo.length;
    resultado.chave_primeiros_20 = limpo.slice(0, 20);
    resultado.chave_ultimos_20 = limpo.slice(-20);
    try {
      const der = Uint8Array.from(atob(limpo), c => c.charCodeAt(0));
      await crypto.subtle.importKey('pkcs8', der.buffer, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
      resultado.chave_decodifica = true;
    } catch (e) {
      resultado.chave_decodifica = false;
      resultado.chave_erro = e.message;
    }
  }

  return json(resultado);
}
