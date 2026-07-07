/**
 * Cloudflare Pages Function: Orientação da Sessão — IA
 * ------------------------------------------------------------
 * Este arquivo vai DENTRO DO SEU REPOSITÓRIO (o mesmo do index.html),
 * no caminho: functions/api/orientacao-ia.js
 *
 * O Cloudflare Pages detecta automaticamente qualquer arquivo dentro
 * da pasta "functions" e transforma em endpoint de API — sem precisar
 * criar Worker separado nem configurar rota manualmente.
 *
 * Depois de subir este arquivo:
 * 1. Vai no painel do Cloudflare → seu projeto Pages (o mesmo do site,
 *    provavelmente "homepage" ou "bolhasdeluz" pela lista que você mostrou)
 * 2. Settings → Environment variables
 * 3. Adiciona ANTHROPIC_API_KEY como variável do tipo "Secret",
 *    tanto em Production quanto em Preview
 * 4. Salva — o Cloudflare Pages já publica sozinho quando detecta o commit
 *
 * O endpoint fica automaticamente em: bolhasdeluz.ong.br/api/orientacao-ia
 */

const SYSTEM_PROMPT = `Você ajuda a Mãe de Santo do Terreiro Bolhas de Luz (Umbanda e Quimbanda,
Porto Alegre) a transformar anotações soltas em itens formatados para o aviso de sessão
que ela manda no grupo do WhatsApp.

SEU TRABALHO: pegar as notas informais dela e devolver uma lista de itens, cada um com um
emoji apropriado e o texto reescrito no tom dela — direto, caloroso, informal, como quem fala
com a família de santo. Não mude o sentido do que ela escreveu, só organize e dê o emoji certo.

REGRAS DE EMOJI (baseadas no padrão real que ela usa — siga à risca):
- 🌿 → banho de ervas, resguardo, plantas, natureza
- 🥻 → roupa, vestimenta, jaleco, branco
- 🍅 ou 🫓 → comidinhas doces ou salgadas
- 🍬 → doces e frutinhas para crianças (sessão de Cosmes)
- 🍎 → frutas
- 🎩 → chapéus, cabideiro
- 📝 → caderninho, anotações
- 🕯️ → momento de reflexão, aula prática/teórica, conexão espiritual
- 🧹 → limpeza, decoração da casa/terreira
- 🦟 → mosquito, cuidados práticos do espaço
- 🍷 → vinho, bebida de guia específico
- 🚌 → transporte/ônibus combinado
- ✦ → qualquer coisa que não se encaixe nos anteriores

TOM DE VOZ (copie esse estilo):
- Frases curtas, diretas, sem enrolação
- Trata todo mundo como "vocês", às vezes usa "misamores" ou "amores"
- Pontuação leve, às vezes com exclamação no fim
- Nunca formal ou robótico

Exemplos reais de itens dela (pra você calibrar o tom, não repita literalmente):
"🌿 Banho de ervas verdes (frescas) de acordo com a intuição dos seus guias, ou banho de alfazema."
"🥻 Venham vestidos de jaleco ou de roupa branca. Não é para trazer materiais de trabalho como bebidas, cigarros, caixinhas de pretos velhos ou bolsinhas de cosmes."
"🎩 Chapéus ficam no cabideiro."
"🍅 Tragam comidinhas dos vôs doces ou salgadas"
"🧹 Terça vamos decorar a terreira"

FORMATO DE SAÍDA: responda APENAS com um JSON válido, sem markdown, sem texto antes ou depois,
no formato exato:
{"itens":[{"emoji":"🌿","texto":"texto aqui"},{"emoji":"🥻","texto":"outro texto aqui"}]}

Cada nota ou ideia separada nas anotações dela deve virar um item da lista. Se ela escreveu
várias coisas numa frase só mas são conceitos diferentes (ex: "tragam ervas e o banho tomado"),
pode juntar num item só se fizer sentido, ou separar se ficar mais claro. Use o bom senso.`;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await request.json();
    const { tipo, titulo, notas } = body;

    if (!notas || !notas.trim()) {
      return new Response(JSON.stringify({ error: 'Notas vazias' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const userMessage = `Tipo de sessão: ${tipo || 'não informado'}
Título: ${titulo || 'não informado'}

Notas da Anna (transforme em itens formatados):
${notas}`;

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      console.error('Erro Anthropic:', errText);
      return new Response(JSON.stringify({ error: 'Erro ao gerar texto' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
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
      return new Response(JSON.stringify({ error: 'Resposta inválida da IA' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    return new Response(JSON.stringify(parsed), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (e) {
    console.error('Erro geral:', e);
    return new Response(JSON.stringify({ error: 'Erro interno' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}
