#!/bin/bash
# Terreiro Bolhas de Luz — patch: Blog do Terreiro com token Firebase
# Uso: coloca este arquivo na raiz do repo e roda `bash patch-blog-token.sh`

set -e
FILE="index.html"

if [ ! -f "$FILE" ]; then
  echo "ERRO: $FILE não encontrado. Execute na raiz do repositório (homepage/)."
  exit 1
fi

if ! grep -q "loadMenu();" "$FILE"; then
  echo "ERRO: versão do index.html não reconhecida."
  exit 1
fi

python3 - << 'PYEOF'
with open("index.html") as f:
    html = f.read()

# ── CORREÇÃO 1: função abrirBlog (antes de loadMenu) ──
C1_OLD = "// inicializar\nloadMenu();"
C1_NEW = """// ── BLOG COM TOKEN ──
async function abrirBlog(e) {
  if (e) e.preventDefault();
  try {
    const user = window._getCurrentUser && window._getCurrentUser();
    if (user) {
      const { getAuth } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');
      const auth = getAuth();
      const realUser = auth.currentUser;
      if (realUser) {
        const token = await realUser.getIdToken();
        window.open(`https://blogbolhas.pages.dev?token=${token}`, '_blank');
        return;
      }
    }
  } catch(err) {
    console.warn('Erro ao gerar token para o blog:', err);
  }
  window.open('https://blogbolhas.pages.dev', '_blank');
}

// inicializar
loadMenu();"""

# ── CORREÇÃO 2: drawer — link externo usa abrirBlog para blogbolhas ──
C2_OLD = "  // link externo — usa button com onclick em vez de <a href> para evitar navegação acidental\n  return `<button class=\"drawer-link\" onclick=\"window.open('${item.url}','_blank');closeDrawer()\">${dot}${item.label}</button>`;"
C2_NEW = """  // link externo — usa button com onclick em vez de <a href> para evitar navegação acidental
  const onclickExterno = item.url && item.url.includes('blogbolhas.pages.dev')
    ? `abrirBlog(event);closeDrawer()`
    : `window.open('${item.url}','_blank');closeDrawer()`;
  return `<button class="drawer-link" onclick="${onclickExterno}">${dot}${item.label}</button>`;"""

# ── CORREÇÃO 3: cards — link externo usa abrirBlog para blogbolhas ──
C3_OLD = "      else onclick = `onclick=\"window.open('${item.url}','_blank')\" href=\"#\"`;"
C3_NEW = """      else if (item.url && item.url.includes('blogbolhas.pages.dev'))
        onclick = `onclick="abrirBlog(event);return false" href="#"`;
      else onclick = `onclick="window.open('${item.url}','_blank')" href="#"`;"""

ok = 0
for i, (old, new) in enumerate([(C1_OLD, C1_NEW), (C2_OLD, C2_NEW), (C3_OLD, C3_NEW)], 1):
    if old in html:
        html = html.replace(old, new, 1)
        print(f"  ✓ correção {i}")
        ok += 1
    else:
        print(f"  ✗ correção {i} não encontrada (já aplicada ou versão diferente?)")

if ok > 0:
    with open("index.html", "w") as f:
        f.write(html)
    print(f"\n✦ {ok}/3 correções aplicadas. Faz commit e push normalmente.")
else:
    print("\nNada foi alterado.")
PYEOF
