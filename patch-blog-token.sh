#!/bin/bash
# Terreiro Bolhas de Luz — remove token Firebase entre domínios
# Uso: coloca este script na RAIZ DO REPOSITÓRIO e roda `bash patch-blog-token.sh`
# Aplica nos dois arquivos: index.html (homepage) e blog/index.html (ou index.html do blog)

set -e

echo ""
echo "═══════════════════════════════════════"
echo "  Patch: remover token cross-domain"
echo "═══════════════════════════════════════"
echo ""

python3 << 'PYEOF'
import os, sys

results = []

# ── PATCH 1: homepage/index.html — função abrirBlog sem token ──
homepage = "index.html"
if os.path.exists(homepage):
    with open(homepage) as f:
        html = f.read()

    OLD = """// ── BLOG COM TOKEN ──
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
}"""

    NEW = """// ── BLOG ──
function abrirBlog(e) {
  if (e) e.preventDefault();
  window.open('https://blogbolhas.pages.dev', '_blank');
}"""

    if OLD in html:
        html = html.replace(OLD, NEW, 1)
        with open(homepage, "w") as f:
            f.write(html)
        results.append(f"  ✓ homepage/index.html — abrirBlog simplificada")
    elif "abrirBlog" in html:
        results.append(f"  ℹ homepage/index.html — abrirBlog já estava simplificada ou diferente")
    else:
        results.append(f"  ✗ homepage/index.html — abrirBlog não encontrada")
else:
    results.append(f"  — homepage/index.html não encontrado nesta pasta")

# ── PATCH 2: blog/index.html — remove signInWithCustomToken ──
# Tenta localizar o arquivo do blog
blog_candidates = ["blog/index.html", "blog.html", "blog-index.html"]
blog_file = None
for c in blog_candidates:
    if os.path.exists(c):
        blog_file = c
        break

if not blog_file:
    # Se rodando na raiz do repo do blog
    if os.path.exists("index.html") and "signInWithCustomToken" in open("index.html").read():
        blog_file = "index.html"

if blog_file:
    with open(blog_file) as f:
        html = f.read()

    if "signInWithCustomToken" not in html:
        results.append(f"  ℹ {blog_file} — signInWithCustomToken já removido")
    else:
        # Remove do import
        OLD_IMPORT = ", signInWithCustomToken"
        NEW_IMPORT = ""
        html = html.replace(OLD_IMPORT, NEW_IMPORT, 1)

        # Substitui o bloco do token
        OLD_TOKEN = """    // Auto-login via token passado pelo site principal (?token=...)
    const urlToken = new URLSearchParams(window.location.search).get("token");
    if (urlToken) {
      signInWithCustomToken(auth, urlToken)
        .then(() => {
          // limpa o token da URL sem recarregar
          const url = new URL(window.location.href);
          url.searchParams.delete("token");
          window.history.replaceState({}, "", url.toString());
        })
        .catch(() => {}); // token inválido/expirado — ignora, segue sem login
    }"""

        NEW_TOKEN = """    // Limpa ?token= da URL se vier do site principal (login é por domínio — usuária loga aqui também)
    if (new URLSearchParams(window.location.search).has("token")) {
      const url = new URL(window.location.href);
      url.searchParams.delete("token");
      window.history.replaceState({}, "", url.toString());
    }"""

        if OLD_TOKEN in html:
            html = html.replace(OLD_TOKEN, NEW_TOKEN, 1)
            with open(blog_file, "w") as f:
                f.write(html)
            results.append(f"  ✓ {blog_file} — signInWithCustomToken removido")
        else:
            # Tenta match mais flexível — só remove o import e o bloco manualmente
            if ", signInWithCustomToken" in html:
                results.append(f"  ⚠ {blog_file} — import removido mas bloco não encontrado (aplique manualmente)")
            else:
                results.append(f"  ✗ {blog_file} — bloco não encontrado, versão diferente?")
else:
    results.append(f"  — arquivo do blog não encontrado (rode na pasta do blog separadamente)")

print("\n".join(results))
print("")
print("Pronto! Agora o login no blog é independente — a usuária loga uma vez no blog com Google")
print("e o Firebase mantém a sessão nas próximas visitas (localStorage por domínio).")
PYEOF
