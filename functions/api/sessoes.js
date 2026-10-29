// Cloudflare Pages Function: /api/sessoes
// CRUD de sessões via KV (SESSOES_KV)
// Escrita protegida pelo mesmo cabeçalho X-Admin-Password usado nos outros
// endpoints administrativos do site — antes pedia uma senha própria digitada
// na hora (por evento), o que era redundante pra quem já está logada como
// admin de verdade (o botão de editar só aparece pra ela)
//
// Sincronização com o Google Agenda (opcional, via GOOGLE_SA_EMAIL,
// GOOGLE_SA_PRIVATE_KEY e GOOGLE_CALENDAR_ID nas variáveis de ambiente):
// toda sessão criada pelo site já nasce vinculada a um evento do Google
// (guarda o id em "googleEventId"), e só sessões vinculadas são atualizadas/
// excluídas lá também. Sessões antigas, sem vínculo, nunca são criadas
// automaticamente no Google — isso evita duplicar o que já existe lá desde
// antes dessa integração. Se as variáveis não estiverem configuradas, o
// CRUD funciona normalmente e a sincronização é apenas ignorada.

const ADMIN_PASSWORD = 'admin';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Password',
  'Content-Type': 'application/json',
};

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response('', { status: 200, headers: CORS });
  }

  const KV = env.SESSOES_KV;
  if (!KV) return json({ error: 'KV não configurado.' }, 500);

  const method = request.method;

  try {
    // LIST — GET /api/sessoes
    if (method === 'GET') {
      const list = await KV.list({ prefix: 'sessao:' });
      const items = await Promise.all(
        list.keys.map(k => KV.get(k.name, { type: 'json' }))
      );
      const sessoes = items
        .filter(Boolean)
        .sort((a, b) => a.data.localeCompare(b.data));
      return json(sessoes);
    }

    if (request.headers.get('X-Admin-Password') !== ADMIN_PASSWORD) {
      return json({ error: 'Não autorizado' }, 403);
    }
    const body = await request.json();

    // CREATE — POST
    if (method === 'POST') {
      const id = `sessao:${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
      const sessao = {
        id,
        nome: body.nome || '',
        data: body.data || '',
        // data concorrente, pra quando o dia ainda não tá certo (ex: "sexta ou
        // sábado") — enquanto preenchida, a sessão aparece nos dois dias,
        // marcada como "a confirmar", até alguém escolher uma (ver calConfirmarDia)
        dataAlternativa: body.dataAlternativa || '',
        hora: body.hora || '',
        tipo: body.tipo || '',
        lado: body.lado || '',
        // linha de trabalho (Caboclo, Preto Velho, Exu, Cigano...) —
        // selecionável no formulário, lista gerenciada em /api/sessoes-linhas
        linha: body.linha || '',
        onde: body.onde || '',
        endereco: body.endereco || '',
        descricao: body.descricao || '',
        responsavel: body.responsavel || '',
        tambor: body.tambor || '',
        driveLink: body.driveLink || '',
        // marca essa sessão como um Corte ou um Cruzamento (e qual tipo) —
        // alimenta o catálogo de datas usado no atalho "Preencher com uma
        // data já cadastrada" em Minha História, sem precisar cadastrar na mão
        marco: body.marco || '',
        marcoOutroNome: body.marcoOutroNome || '',
        googleEventId: '',
        googleEventIdAlt: '',
        criadoEm: Date.now(),
      };
      const temAlt = !!sessao.dataAlternativa;
      try { sessao.googleEventId = await gcalCriarEvento(env, sessao, sessao.data, temAlt, false); } catch (e) {}
      if (temAlt && sessao.googleEventId) {
        try { sessao.googleEventIdAlt = await gcalCriarEvento(env, sessao, sessao.dataAlternativa, temAlt, true); } catch (e) {}
      }
      await KV.put(id, JSON.stringify(sessao));
      return json(sessao);
    }

    // UPDATE — PUT
    if (method === 'PUT') {
      const { id, criarNoGoogle, ...fields } = body;
      if (!id) return json({ error: 'id obrigatório' }, 400);
      const existing = await KV.get(id, { type: 'json' });
      if (!existing) return json({ error: 'Sessão não encontrada' }, 404);
      const updated = { ...existing, ...fields, id };

      const alvoPrincipal = updated.data;
      const alvoAlternativa = updated.dataAlternativa || '';
      const temAlternativaAgora = !!alvoAlternativa;

      // a pessoa confirmou a data alternativa como a definitiva (dataAlternativa
      // some e "data" vira o que antes era a alternativa) — o evento que já
      // existia pra aquele dia (googleEventIdAlt) vira o principal; o evento
      // da data que não vingou (o antigo googleEventId) é descartado
      const confirmouAlternativa = !temAlternativaAgora && existing.dataAlternativa && alvoPrincipal === existing.dataAlternativa;
      if (confirmouAlternativa) {
        if (existing.googleEventId) { try { await gcalExcluirEvento(env, existing.googleEventId); } catch (e) {} }
        updated.googleEventId = existing.googleEventIdAlt || '';
        updated.googleEventIdAlt = '';
      }

      // evento da data principal
      if (updated.googleEventId) {
        try { await gcalAtualizarEvento(env, updated, alvoPrincipal, temAlternativaAgora, false, updated.googleEventId); } catch (e) {}
      } else if (criarNoGoogle) {
        try { updated.googleEventId = await gcalCriarEvento(env, updated, alvoPrincipal, temAlternativaAgora, false); } catch (e) {}
      }

      // evento da data alternativa
      if (temAlternativaAgora) {
        if (updated.googleEventIdAlt) {
          try { await gcalAtualizarEvento(env, updated, alvoAlternativa, temAlternativaAgora, true, updated.googleEventIdAlt); } catch (e) {}
        } else if (updated.googleEventId) {
          try { updated.googleEventIdAlt = await gcalCriarEvento(env, updated, alvoAlternativa, temAlternativaAgora, true); } catch (e) {}
        }
      } else if (updated.googleEventIdAlt) {
        try { await gcalExcluirEvento(env, updated.googleEventIdAlt); } catch (e) {}
        updated.googleEventIdAlt = '';
      }

      await KV.put(id, JSON.stringify(updated));
      return json(updated);
    }

    // DELETE — DELETE
    if (method === 'DELETE') {
      const { id } = body;
      if (!id) return json({ error: 'id obrigatório' }, 400);
      const existing = await KV.get(id, { type: 'json' });
      if (existing) {
        if (existing.googleEventId) { try { await gcalExcluirEvento(env, existing.googleEventId); } catch (e) {} }
        if (existing.googleEventIdAlt) { try { await gcalExcluirEvento(env, existing.googleEventIdAlt); } catch (e) {} }
      }
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

// --- Sincronização com o Google Agenda ---------------------------------

function gcalB64Url(str) {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Limpa a chave privada colada de forma tolerante a bagunça comum ao colar
// pelo celular (crase sobrando, travessão no lugar de hífen, quebra de
// linha perdida): converte "\n" literal em quebra de linha de verdade,
// descarta as linhas de cabeçalho/rodapé pelo texto "PRIVATE KEY" (não
// pelos hífens exatos) e no final fica só com caracteres válidos de base64.
function gcalLimparChavePem(chavePem) {
  const comQuebras = String(chavePem || '').replace(/\\n/g, '\n');
  const linhas = comQuebras.split('\n').filter(l => !l.toUpperCase().includes('PRIVATE KEY'));
  return linhas.join('').replace(/[^A-Za-z0-9+/=]/g, '');
}

// Autentica como a conta de serviço via JWT assinado (fluxo OAuth2 de
// servidor-a-servidor do Google, sem interação humana) e troca por um
// access token de curta duração.
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

// "sexta-feira, 13/03" — usado na descrição do evento tentativo, pra quem
// olha a Agenda do Google saber qual é a outra data concorrente
function gcalFormatarDataNota(dataStr) {
  if (!dataStr) return '';
  const d = new Date(dataStr + 'T12:00:00');
  const dias = ['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado'];
  return `${dias[d.getDay()]}, ${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;
}

// Monta o corpo do evento no formato da API do Google Agenda a partir de uma
// sessão do site, pra uma data específica (a sessão pode ter até duas datas
// concorrentes enquanto o dia não tá confirmado — ver dataAlternativa).
// Sessão sem hora vira evento de dia inteiro; com hora, dura 3h por padrão.
// Quando tentativa=true, o evento nasce como "tentative" no Google (aparece
// com estilo tracejado lá) e ganha uma nota avisando a outra data candidata.
function gcalEventoDe(sessao, dataAlvo, tentativa, ehAlternativa) {
  const outraData = ehAlternativa ? sessao.data : sessao.dataAlternativa;
  const nota = tentativa
    ? `⚠️ Data ainda não confirmada — pode ser ${gcalFormatarDataNota(dataAlvo)} ou ${gcalFormatarDataNota(outraData)}.\n\n`
    : '';
  const evento = {
    summary: (tentativa ? '❓ ' : '') + (sessao.nome || 'Sessão'),
    location: sessao.endereco || sessao.onde || undefined,
    description: (nota + [sessao.descricao, sessao.responsavel ? `Responsável: ${sessao.responsavel}` : ''].filter(Boolean).join('\n\n')) || undefined,
    status: tentativa ? 'tentative' : 'confirmed',
  };
  if (sessao.hora) {
    const inicio = new Date(`${dataAlvo}T${sessao.hora}:00`);
    const fim = new Date(inicio.getTime() + 3 * 60 * 60 * 1000);
    const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:00`;
    evento.start = { dateTime: fmt(inicio), timeZone: 'America/Sao_Paulo' };
    evento.end = { dateTime: fmt(fim), timeZone: 'America/Sao_Paulo' };
  } else {
    evento.start = { date: dataAlvo };
    evento.end = { date: dataAlvo };
  }
  return evento;
}

async function gcalCriarEvento(env, sessao, dataAlvo, tentativa, ehAlternativa) {
  const token = await gcalToken(env);
  const calendarId = env.GOOGLE_CALENDAR_ID;
  if (!token || !calendarId) return '';
  const resp = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(gcalEventoDe(sessao, dataAlvo, tentativa, ehAlternativa)),
  });
  if (!resp.ok) return '';
  const dados = await resp.json();
  return dados.id || '';
}

async function gcalAtualizarEvento(env, sessao, dataAlvo, tentativa, ehAlternativa, eventId) {
  const token = await gcalToken(env);
  const calendarId = env.GOOGLE_CALENDAR_ID;
  if (!token || !calendarId) return;
  await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(gcalEventoDe(sessao, dataAlvo, tentativa, ehAlternativa)),
  });
}

async function gcalExcluirEvento(env, googleEventId) {
  const token = await gcalToken(env);
  const calendarId = env.GOOGLE_CALENDAR_ID;
  if (!token || !calendarId) return;
  await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(googleEventId)}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` },
  });
}
