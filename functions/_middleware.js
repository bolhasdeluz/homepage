// Ambiente de teste (staging): quando o site é acessado por um domínio de
// preview do Cloudflare Pages (*.pages.dev), troca silenciosamente cada KV
// de produção pelo seu par "_STAGING" antes de a função de verdade rodar —
// assim nenhum arquivo em functions/api/*.js precisa saber que o ambiente
// de teste existe. No domínio de produção (bolhasdeluz.ong.br) nada muda.
//
// Se um dia um binding novo precisar de uma cópia de teste, basta criar o
// namespace "<NOME>_STAGING" no Cloudflare, adicionar o binding com esse
// nome exato e incluir "<NOME>" nesta lista.
const BINDINGS_COM_STAGING = ['MENU_DATA', 'TESOURARIA_KV', 'LOJAS_KV', 'SESSOES_KV'];

export async function onRequest(context) {
  const { request, env } = context;
  const hostname = new URL(request.url).hostname;
  const ehStaging = hostname.endsWith('.pages.dev');

  if (ehStaging) {
    for (const nome of BINDINGS_COM_STAGING) {
      const staging = env[`${nome}_STAGING`];
      if (staging) env[nome] = staging;
    }
  }

  return context.next();
}
