const ADMIN_PASSWORD = 'admin';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Password, X-User-Email',
  'Content-Type': 'application/json',
};

async function enviarEmail(env, { email, nome, foto, novoPerfil }) {
  const RESEND_KEY = env.RESEND_API_KEY;
  if (!RESEND_KEY) return;

  const assunto = novoPerfil
    ? `🌸 Novo login — ${nome || email}`
    : `✦ Login — ${nome || email}`;

  const html = `
    <div style="font-family:Georgia,serif;max-width:480px;margin:0 auto;padding:24px;background:#fff5f7;border-radius:12px">
      <h2 style="font-family:Georgia,serif;color:#c4396b;margin-bottom:4px">${assunto}</h2>
      <p style="color:#8a6070;font-size:14px;margin-bottom:20px">
        ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
      </p>
      ${foto ? `<img src="${foto}" style="width:56px;height:56px;border-radius:50%;border:2px solid #c4396b;margin-bottom:16px">` : ''}
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr><td style="padding:6px 0;color:#8a6070">Nome</td><td style="padding:6px 0;color:#2a1a22"><b>${nome || '—'}</b></td></tr>
        <tr><td style="padding:6px 0;color:#8a6070">E-mail</td><td style="padding:6px 0;color:#2a1a22">${email}</td></tr>
        <tr><td style="padding:6px 0;color:#8a6070">Situação</td><td style="padding:6px 0;color:#c4396b">${novoPerfil ? '🆕 Primeiro login' : '↩️ Login recorrente'}</td></tr>
      </table>
      <div style="margin-top:20px;padding:12px;background:#fff;border-radius:8px;border:1px solid rgba(196,57,107,.15)">
        <a href="https://homepage-3vx.pages.dev" style="color:#c4396b;font-size:13px">Acessar painel admin →</a>
      </div>
    </div>`;

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Bolhas de Luz <notificacoes@bolhasdeluz.ong.br>',
      to: ['bolhasdeluz@gmail.com'],
      subject: assunto,
      html
    })
  });
}

// e-mail de boas-vindas pra pessoa recém-cadastrada pelo admin — avisa que o
// acesso já está liberado e explica como entrar (login com Google, mesmo e-mail).
// Devolve {ok, erro} em vez de só disparar e esquecer — senão uma falha (chave
// não configurada, Resend recusando, domínio não verificado etc.) nunca
// aparece pra admin, e ela só descobre quando a pessoa reclama que não recebeu.
async function enviarEmailBoasVindas(env, { email, nome, comAgenda }) {
  const RESEND_KEY = env.RESEND_API_KEY;
  if (!RESEND_KEY) return { ok: false, erro: 'RESEND_API_KEY não configurada no Cloudflare.' };
  if (!email) return { ok: false, erro: 'E-mail vazio.' };

  const html = `
    <div style="font-family:Georgia,serif;max-width:480px;margin:0 auto;padding:24px;background:#fff5f7;border-radius:12px">
      <h2 style="font-family:Georgia,serif;color:#c4396b;margin-bottom:16px">✦ Seu acesso foi liberado!</h2>
      <p style="color:#2a1a22;font-size:15px;line-height:1.5">
        Olá${nome ? ', ' + nome : ''}!<br><br>
        Seu acesso ao site do Terreiro Bolhas de Luz foi liberado ✦<br><br>
        Para entrar, é só acessar <b>bolhasdeluz.ong.br</b> e fazer login com a conta Google desse mesmo e-mail (${email}).
        ${comAgenda ? `<br><br>Também liberamos pra você a nossa agenda de sessões — ela já deve aparecer sozinha no seu Google Agenda (no celular ou no computador), em "Outras agendas".` : ''}
      </p>
      ${comAgenda ? `
      <div style="margin-top:16px;padding:14px 16px;background:#fff;border-radius:8px;border:1px solid rgba(196,57,107,.15)">
        <p style="color:#c4396b;font-size:13px;font-weight:bold;margin:0 0 8px">📅 Como ativar ou desativar a agenda no app</p>
        <p style="color:#2a1a22;font-size:13px;line-height:1.6;margin:0">
          1. Abra o app Google Agenda no celular<br>
          2. Toque no menu ☰ no canto superior esquerdo<br>
          3. Procure "Terreiro Bolhas de Luz" em "Outras agendas"<br>
          4. Toque na caixinha ao lado do nome pra mostrar (marcada) ou esconder (desmarcada) os eventos dela
        </p>
      </div>` : ''}
      <div style="margin-top:20px;padding:12px;background:#fff;border-radius:8px;border:1px solid rgba(196,57,107,.15)">
        <a href="https://bolhasdeluz.ong.br" style="color:#c4396b;font-size:13px">Acessar o site →</a>
      </div>
    </div>`;

  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Bolhas de Luz <notificacoes@bolhasdeluz.ong.br>',
        to: [email],
        subject: '✦ Seu acesso ao Bolhas de Luz foi liberado!',
        html
      })
    });
    if (!resp.ok) {
      const corpo = await resp.text().catch(() => '');
      return { ok: false, erro: `Resend recusou (status ${resp.status}): ${corpo.slice(0, 300)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: e.message };
  }
}

// --- Compartilhamento da Agenda do Google (mesma conta de serviço usada em
// sessoes.js pra sincronizar as sessões) -------------------------------

function gcalB64Url(str) {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function gcalLimparChavePem(chavePem) {
  const comQuebras = String(chavePem || '').replace(/\\n/g, '\n');
  const linhas = comQuebras.split('\n').filter(l => !l.toUpperCase().includes('PRIVATE KEY'));
  return linhas.join('').replace(/[^A-Za-z0-9+/=]/g, '');
}

async function gcalToken(env) {
  const email = env.GOOGLE_SA_EMAIL;
  const chavePem = env.GOOGLE_SA_PRIVATE_KEY;
  if (!email || !chavePem) return null;

  const agora = Math.floor(Date.now() / 1000);
  const cabecalho = gcalB64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = gcalB64Url(JSON.stringify({
    iss: email,
    scope: 'https://www.googleapis.com/auth/calendar',
    aud: 'https://oauth2.googleapis.com/token',
    iat: agora,
    exp: agora + 3600,
  }));
  const entrada = `${cabecalho}.${claims}`;

  const pemLimpo = gcalLimparChavePem(chavePem);
  if (pemLimpo.length < 500) return null;
  const der = Uint8Array.from(atob(pemLimpo), c => c.charCodeAt(0));
  const chave = await crypto.subtle.importKey('pkcs8', der.buffer, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const assinatura = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', chave, new TextEncoder().encode(entrada));
  const assinaturaB64 = btoa(String.fromCharCode(...new Uint8Array(assinatura))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const jwt = `${entrada}.${assinaturaB64}`;

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${encodeURIComponent(jwt)}`,
  });
  if (!resp.ok) return null;
  const dados = await resp.json();
  return dados.access_token || null;
}

// dá acesso de leitura à agenda inteira do terreiro pro e-mail da pessoa —
// a agenda aparece sozinha no Google Agenda/celular dela, sem precisar
// aceitar convite. sendNotifications=false porque já mandamos nosso próprio
// e-mail de boas-vindas avisando disso. Devolve {ok, erro} pelo mesmo motivo
// do e-mail: uma falha silenciosa aqui só aparece quando alguém reclama que
// a agenda nunca chegou.
async function gcalDarAcessoAgenda(env, email) {
  if (!email) return { ok: false, erro: 'E-mail vazio.' };
  if (!env.GOOGLE_SA_EMAIL || !env.GOOGLE_SA_PRIVATE_KEY) return { ok: false, erro: 'GOOGLE_SA_EMAIL / GOOGLE_SA_PRIVATE_KEY não configurados no Cloudflare.' };
  if (!env.GOOGLE_CALENDAR_ID) return { ok: false, erro: 'GOOGLE_CALENDAR_ID não configurado no Cloudflare.' };
  const token = await gcalToken(env);
  if (!token) return { ok: false, erro: 'Não consegui autenticar com a conta de serviço do Google — confere a chave privada.' };
  try {
    const resp = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(env.GOOGLE_CALENDAR_ID)}/acl?sendNotifications=false`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'reader', scope: { type: 'user', value: email } }),
    });
    if (!resp.ok) {
      const corpo = await resp.text().catch(() => '');
      return { ok: false, erro: `Google recusou (status ${resp.status}): ${corpo.slice(0, 300)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: e.message };
  }
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  const url = new URL(request.url);
  const adminPwd = request.headers.get('X-Admin-Password');
  const isAdmin = adminPwd === ADMIN_PASSWORD;

  // GET ?todos=1 — admin lista todos os perfis
  if (request.method === 'GET' && url.searchParams.get('todos') === '1') {
    if (!isAdmin) return new Response(JSON.stringify({ error: 'Não autorizado' }), { status: 401, headers: CORS });
    const list = await env.MENU_DATA.list({ prefix: 'perfil:' });
    const perfis = await Promise.all(list.keys.map(async k => {
      const val = await env.MENU_DATA.get(k.name);
      return val ? JSON.parse(val) : null;
    }));
    return new Response(JSON.stringify(perfis.filter(Boolean)), { status: 200, headers: CORS });
  }

  // GET ?historico=email — admin vê histórico
  if (request.method === 'GET' && url.searchParams.get('historico')) {
    if (!isAdmin) return new Response(JSON.stringify({ error: 'Não autorizado' }), { status: 401, headers: CORS });
    const targetEmail = url.searchParams.get('historico').toLowerCase();
    const hist = await env.MENU_DATA.get('historico:' + targetEmail);
    return new Response(hist || '[]', { status: 200, headers: CORS });
  }

  // GET ?email=x — retorna perfil, auto-cria se não existir
  if (request.method === 'GET') {
    const email = (url.searchParams.get('email') || request.headers.get('X-User-Email') || '').toLowerCase();
    if (!email) return new Response(JSON.stringify({ error: 'Email obrigatório' }), { status: 400, headers: CORS });

    const key = 'perfil:' + email;
    const data = await env.MENU_DATA.get(key);
    const novoPerfil = !data;

    // auto-criar perfil na primeira vez
    if (novoPerfil) {
      const nome = url.searchParams.get('nome') || '';
      const foto = url.searchParams.get('foto') || '';
      const novo = {
        email, nome, foto, cargo: 'Visitante', emoji: '👤',
        grupo: 'visitante',
        boasVindas: { comoConheceu: '', tempoFrequenta: '' },
        historia: {}, guias: {}, cruzamentos: {}, notas: '',
        criadoEm: Date.now(), primeiroLogin: Date.now()
      };
      await env.MENU_DATA.put(key, JSON.stringify(novo));
      // notifica por e-mail (async, não bloqueia resposta)
      context.waitUntil(enviarEmail(env, { email, nome, foto, novoPerfil: true }));
      return new Response(JSON.stringify(novo), { status: 200, headers: CORS });
    }

    // perfil existente — notifica login
    const perfil = JSON.parse(data);

    // perfil pré-cadastrado pelo admin só com e-mail (sem nome) — puxa do
    // Google no primeiro login dela, em vez de depender de alguém digitar
    const nomeGoogle = url.searchParams.get('nome') || '';
    const fotoGoogle = url.searchParams.get('foto') || '';
    let precisaSalvar = false;
    if (!perfil.nome && nomeGoogle) { perfil.nome = nomeGoogle; precisaSalvar = true; }
    if (!perfil.foto && fotoGoogle) { perfil.foto = fotoGoogle; precisaSalvar = true; }
    if (precisaSalvar) await env.MENU_DATA.put(key, JSON.stringify(perfil));

    context.waitUntil(enviarEmail(env, {
      email,
      nome: perfil.nome || '',
      foto: perfil.foto || '',
      novoPerfil: false
    }));

    return new Response(JSON.stringify(perfil), { status: 200, headers: CORS });
  }

  // POST — salvar perfil + histórico
  if (request.method === 'POST') {
    const userEmail = request.headers.get('X-User-Email');
    if (!userEmail && !isAdmin) return new Response(JSON.stringify({ error: 'Não autorizado' }), { status: 401, headers: CORS });

    let body;
    try { body = await request.json(); }
    catch(e) { return new Response(JSON.stringify({ error: 'JSON inválido' }), { status: 400, headers: CORS }); }

    const targetEmail = (body.email || userEmail || '').toLowerCase();
    if (!isAdmin && userEmail && userEmail.toLowerCase() !== targetEmail) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }), { status: 403, headers: CORS });
    }

    // salvar histórico
    const histKey = 'historico:' + targetEmail;
    const histRaw = await env.MENU_DATA.get(histKey);
    const hist = histRaw ? JSON.parse(histRaw) : [];
    hist.unshift({
      quem: isAdmin ? 'admin' : userEmail,
      quando: Date.now(),
      solicitacao: body.solicitacao || '',
      snapshot: { historia: body.historia || {}, guias: body.guias || {}, cruzamentos: body.cruzamentos || {} }
    });
    if (hist.length > 20) hist.splice(20);
    await env.MENU_DATA.put(histKey, JSON.stringify(hist));

    // flags de controle, não fazem parte do perfil salvo
    const enviarBoasVindas = isAdmin && !!body.enviarBoasVindas;
    const darAcessoCalendario = isAdmin && !!body.darAcessoCalendario;
    delete body.enviarBoasVindas;
    delete body.darAcessoCalendario;

    body.atualizadoEm = Date.now();
    await env.MENU_DATA.put('perfil:' + targetEmail, JSON.stringify(body));

    // espera os dois terminarem (em vez de só disparar e esquecer) pra poder
    // contar pra admin se realmente deu certo, com o motivo quando não deu
    const resultado = { ok: true };
    if (darAcessoCalendario) {
      resultado.agenda = await gcalDarAcessoAgenda(env, targetEmail);
    }
    if (enviarBoasVindas) {
      resultado.email = await enviarEmailBoasVindas(env, { email: targetEmail, nome: body.nome || '', comAgenda: darAcessoCalendario && resultado.agenda?.ok });
    }

    return new Response(JSON.stringify(resultado), { status: 200, headers: CORS });
  }

  // PUT — ações rápidas que NÃO reescrevem o perfil (hoje só reenviar e-mail
  // de boas-vindas / dar acesso à agenda de novo) — ao contrário do POST, não
  // mexe em nenhum outro campo do perfil já salvo
  if (request.method === 'PUT') {
    if (!isAdmin) return new Response(JSON.stringify({ error: 'Não autorizado' }), { status: 401, headers: CORS });

    let body;
    try { body = await request.json(); }
    catch (e) { return new Response(JSON.stringify({ error: 'JSON inválido' }), { status: 400, headers: CORS }); }

    const targetEmail = (body.email || '').toLowerCase();
    if (!targetEmail) return new Response(JSON.stringify({ error: 'E-mail obrigatório' }), { status: 400, headers: CORS });

    const data = await env.MENU_DATA.get('perfil:' + targetEmail);
    if (!data) return new Response(JSON.stringify({ error: 'Perfil não encontrado' }), { status: 404, headers: CORS });
    const perfil = JSON.parse(data);

    const enviarBoasVindas = !!body.enviarBoasVindas;
    const darAcessoCalendario = !!body.darAcessoCalendario;

    const resultado = { ok: true };
    if (darAcessoCalendario) resultado.agenda = await gcalDarAcessoAgenda(env, targetEmail);
    if (enviarBoasVindas) {
      resultado.email = await enviarEmailBoasVindas(env, { email: targetEmail, nome: perfil.nome || '', comAgenda: darAcessoCalendario && resultado.agenda?.ok });
    }

    return new Response(JSON.stringify(resultado), { status: 200, headers: CORS });
  }

  return new Response('Method not allowed', { status: 405, headers: CORS });
}
