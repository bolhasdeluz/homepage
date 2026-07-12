/**
 * Cloudflare Pages Function: Classificar objeto do catálogo — IA
 * ------------------------------------------------------------
 * Recebe a URL pública de uma imagem de objeto (assets/objetos/xxx.png) e
 * devolve como ela deve ser cadastrada no catálogo da Terreirinha: nome,
 * tipo (chão/parede), categoria, e se é uma "mesa" (superfície onde dá pra
 * colocar outro objeto em cima) — usando a Claude API com visão.
 *
 * Usa a mesma variável de ambiente ANTHROPIC_API_KEY já configurada pra
 * functions/api/orientacao-ia.js (Cloudflare Pages → Settings →
 * Environment variables → Secret, em Production e Preview).
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

const CATEGORIAS_VALIDAS = ['plantas', 'moveis', 'utensilios', 'armas', 'natureza', 'outros'];

const SYSTEM_PROMPT = `Você ajuda a catalogar objetos decorativos em pixel art pro jogo "Terreirinho
Digital", do site do Terreiro Bolhas de Luz (Umbanda e Quimbanda). Cada objeto é uma imagem PNG com
fundo transparente que a pessoa pode colocar dentro de uma salinha isométrica (chão ou parede).

Você vai ver a imagem de UM objeto só e devolver como ele deve ser cadastrado no catálogo.

FORMATO DE SAÍDA: responda APENAS com um JSON válido, sem markdown, sem texto antes ou depois,
no formato exato:
{"nome":"Nome Curto e Descritivo","tipo":"chao ou parede","categoria":"uma das categorias","mesa":true ou false,"alturaTampo":0.0}

REGRAS:
- "nome": nome curto em português, primeira letra de cada palavra maiúscula (ex: "Mesa Redonda com Toalha").
- "tipo": "parede" se for claramente pra pendurar numa parede (quadro, janela, arma de parede, prateleira);
  "chao" pra tudo que fica em pé/apoiado no chão (móveis, plantas, objetos soltos).
- "categoria": escolha a que mais combina entre "plantas" (vasos, flores), "moveis" (mesas, cadeiras,
  bancos, baús), "utensilios" (potes, velas, objetos do dia a dia), "armas" (armas, emblemas, medalhas,
  troféus), "natureza" (pedras, troncos, elementos naturais soltos) ou "outros" (o que não se encaixa).
- "mesa": true SOMENTE se for um objeto de chão com um tampo/superfície plana em cima onde dá pra
  colocar outra coisa (mesa, bancada, baú fechado, cômoda). false pra tudo mais, incluindo
  cadeiras/bancos/objetos de parede (não tem tampo plano útil).
- "alturaTampo": só importa se "mesa" for true — fração (0 a 1) da ALTURA da imagem, medida de baixo
  pra cima, de onde fica a superfície plana de cima. Mesa baixa e larga: perto de 0.4. Mesa alta e
  estreita: perto de 0.7. Se "mesa" for false, pode mandar 0.5.

Use o bom senso olhando a imagem. Sempre responda, mesmo sem certeza absoluta — escolha a opção mais provável.`;

function bufferParaBase64(buffer) {
  let binario = '';
  const bytes = new Uint8Array(buffer);
  const tamanhoPedaco = 0x8000;
  for (let i = 0; i < bytes.length; i += tamanhoPedaco) {
    binario += String.fromCharCode.apply(null, bytes.subarray(i, i + tamanhoPedaco));
  }
  return btoa(binario);
}

export async function onRequestOptions() {
  return new Response(null, { headers: CORS });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await request.json();
    const { imagemUrl } = body;
    if (!imagemUrl) {
      return new Response(JSON.stringify({ error: 'imagemUrl obrigatória' }), { status: 400, headers: CORS });
    }

    const imgRes = await fetch(imagemUrl);
    if (!imgRes.ok) {
      return new Response(JSON.stringify({ error: 'Não consegui buscar a imagem: ' + imgRes.status }), { status: 400, headers: CORS });
    }
    const mediaType = imgRes.headers.get('content-type') || 'image/png';
    const buffer = await imgRes.arrayBuffer();
    const base64 = bufferParaBase64(buffer);

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 300,
        system: SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
            { type: 'text', text: 'Classifique esse objeto do catálogo.' },
          ],
        }],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      console.error('Erro Anthropic:', errText);
      return new Response(JSON.stringify({ error: 'Erro ao classificar' }), { status: 502, headers: CORS });
    }

    const anthropicData = await anthropicRes.json();
    const textBlock = anthropicData.content.find(b => b.type === 'text');
    let raw = textBlock ? textBlock.text.trim() : '';
    raw = raw.replace(/^```json\s*|\s*```$/g, '').replace(/^```\s*|\s*```$/g, '');

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      console.error('Falha ao parsear JSON da IA:', raw);
      return new Response(JSON.stringify({ error: 'Resposta inválida da IA' }), { status: 502, headers: CORS });
    }

    // sanitiza antes de devolver — nunca confia cegamente na saída da IA
    const tipo = parsed.tipo === 'parede' ? 'parede' : 'chao';
    const resultado = {
      nome: String(parsed.nome || 'Objeto sem nome').slice(0, 60),
      tipo,
      categoria: CATEGORIAS_VALIDAS.includes(parsed.categoria) ? parsed.categoria : 'outros',
      mesa: tipo === 'chao' && !!parsed.mesa,
      alturaTampo: Math.min(0.9, Math.max(0.1, parseFloat(parsed.alturaTampo) || 0.5)),
    };

    return new Response(JSON.stringify(resultado), { headers: CORS });
  } catch (e) {
    console.error('Erro geral classificar-objeto:', e);
    return new Response(JSON.stringify({ error: 'Erro interno' }), { status: 500, headers: CORS });
  }
}
