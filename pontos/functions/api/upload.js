// functions/api/upload.js
// Usa R2 binding diretamente — sem token de API
// Binding: AUDIO_BUCKET → bolhasdeluz-audio

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response('', { status: 200, headers: CORS });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método não suportado' }), { status: 405, headers: CORS });
  }

  if (!env.AUDIO_BUCKET) {
    return new Response(JSON.stringify({ error: 'R2 binding não configurado' }), { status: 500, headers: CORS });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    if (!file) return new Response(JSON.stringify({ error: 'Arquivo não encontrado' }), { status: 400, headers: CORS });

    const ext = file.name.split('.').pop() || 'm4a';
    const key = `ponto-${Date.now()}.${ext}`;

    await env.AUDIO_BUCKET.put(key, file.stream(), {
      httpMetadata: { contentType: file.type || 'audio/mpeg' },
    });

    const url = `https://pub-6a5121068171403aa9e327fbd30cc8e6.r2.dev/${key}`;
    return new Response(JSON.stringify({ url }), { headers: CORS });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: CORS });
  }
}
