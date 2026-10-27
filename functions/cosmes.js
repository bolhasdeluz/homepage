// Cloudflare Pages Function: /cosmes
// A festa de Cosme e Damião já passou, então o link antigo (impresso no QR
// do banner, no menu do site e em /ir/cosmes) agora reaproveita a mesma
// página de "próxima sessão" que o /ir/banner usa, em vez de continuar
// mostrando o formulário de inscrição de um evento que já aconteceu.
// Como isso intercepta o path antes do arquivo estático cosmes.html (ver
// _routes.json, que inclui tudo), o formulário em si continua existindo no
// repositório — se um dia tiver uma festa nova, é só apagar este arquivo
// (ou trocar o destino) pra voltar a servir o formulário.
export async function onRequestGet(context) {
  return Response.redirect(new URL('/proxima-sessao.html', context.request.url).toString(), 302);
}
