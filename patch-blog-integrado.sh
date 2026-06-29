#!/bin/bash
# Terreiro Bolhas de Luz — integra o blog como página interna do index.html
# Uso: rode na raiz do repositório homepage/
# bash patch-blog-integrado.sh

set -e
FILE="index.html"

if [ ! -f "$FILE" ]; then
  echo "ERRO: $FILE não encontrado."
  exit 1
fi

python3 << 'PYEOF'
with open("index.html", encoding="utf-8") as f:
    html = f.read()

ok = 0

# ══════════════════════════════════════════════════════
# PATCH 1 — CSS do blog (adicionar antes de </style>)
# ══════════════════════════════════════════════════════
BLOG_CSS = """
/* ══════════════════════════════════════════════════
   BLOG INTEGRADO
══════════════════════════════════════════════════ */
.blog-wrap{max-width:960px;margin:0 auto;padding:1.5rem 20px 200px;}
.blog-hero-int{background:linear-gradient(135deg,rgba(196,57,107,.12),rgba(196,57,107,.05));border-bottom:1px solid var(--border);border-radius:12px;padding:2rem 1.5rem 1.5rem;text-align:center;margin-bottom:1.5rem;}
.blog-hero-int .eyebrow{margin-bottom:.4rem}
.blog-hero-int .section-title{font-size:1.6rem;margin-bottom:.3rem}
.blog-hero-int .hero-sub{font-family:'Crimson Pro',Georgia,serif;font-size:.95rem;color:var(--text-dim);font-style:italic}
.blog-cat-bar{display:flex;align-items:center;gap:.4rem;flex-wrap:wrap;margin-bottom:1.5rem;overflow-x:auto;scrollbar-width:none;padding-bottom:4px;}
.blog-cat-bar::-webkit-scrollbar{display:none}
.blog-cat-pill{background:var(--rosa-dim);border:1px solid var(--border);border-radius:20px;color:var(--text-dim);font-family:'Cinzel',serif;font-size:.62rem;letter-spacing:.06em;padding:5px 13px;cursor:pointer;white-space:nowrap;transition:all .16s;}
.blog-cat-pill:hover{background:rgba(196,57,107,.14);color:var(--text);}
.blog-cat-pill.active{background:var(--rosa);border-color:var(--rosa);color:#fff;}
.blog-list-layout{display:grid;grid-template-columns:1fr 240px;gap:1.5rem;align-items:start;}
@media(max-width:720px){.blog-list-layout{grid-template-columns:1fr}.blog-sidebar{display:none}}
#blog-post-list{display:grid;gap:1rem;}
.blog-post-card{background:var(--surface);border:1px solid var(--border);border-radius:12px;box-shadow:0 2px 12px rgba(180,60,90,.06);overflow:hidden;cursor:pointer;transition:transform .2s,box-shadow .2s;}
.blog-post-card:hover{transform:translateY(-2px);box-shadow:0 6px 22px rgba(180,60,90,.12);}
.blog-card-top{background:linear-gradient(135deg,rgba(196,57,107,.08),rgba(196,57,107,.03));padding:.55rem 1rem;display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;}
.blog-cat-badge{background:rgba(196,57,107,.1);color:var(--rosa);border-radius:20px;font-family:'Cinzel',serif;font-size:.58rem;font-weight:600;letter-spacing:.05em;padding:2px 10px;text-transform:uppercase;}
.blog-post-date{font-size:.68rem;color:var(--text-dim);margin-left:auto;}
.blog-card-body{padding:.9rem 1rem .8rem;}
.blog-card-title{font-family:'Playfair Display',serif;font-size:.98rem;font-weight:600;color:var(--text);margin-bottom:.3rem;line-height:1.35;}
.blog-card-excerpt{font-family:'Crimson Pro',Georgia,serif;font-size:.9rem;color:var(--text-dim);line-height:1.5;}
.blog-card-footer{padding:.55rem 1rem;border-top:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;}
.blog-read-more{font-family:'Cinzel',serif;font-size:.58rem;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--rosa);}
.blog-admin-btns{display:flex;gap:.3rem;}
.blog-btn-edit{background:none;border:1px solid var(--border);border-radius:5px;color:var(--text-dim);font-family:'Cinzel',serif;font-size:.55rem;letter-spacing:.06em;padding:3px 8px;cursor:pointer;transition:all .14s;}
.blog-btn-edit:hover{border-color:var(--rosa);color:var(--rosa);}
.blog-btn-del{background:none;border:1px solid rgba(184,64,64,.2);border-radius:5px;color:#b84040;font-family:'Cinzel',serif;font-size:.55rem;letter-spacing:.06em;padding:3px 8px;cursor:pointer;transition:background .14s;}
.blog-btn-del:hover{background:rgba(184,64,64,.08);}
.blog-empty{text-align:center;padding:3rem 1rem;color:var(--text-dim);font-family:'Crimson Pro',Georgia,serif;font-style:italic;}
.blog-pagination{display:flex;align-items:center;justify-content:space-between;padding:.8rem 0;gap:.5rem;flex-wrap:wrap;margin-top:.5rem;}
.blog-page-info{font-size:.72rem;color:var(--text-dim);}
.blog-page-btns{display:flex;gap:.4rem;}
.blog-page-btn{background:none;border:1px solid var(--border);border-radius:6px;color:var(--text-dim);font-family:'Cinzel',serif;font-size:.58rem;letter-spacing:.08em;font-weight:600;text-transform:uppercase;padding:6px 13px;cursor:pointer;transition:all .16s;}
.blog-page-btn:hover{border-color:var(--rosa);color:var(--rosa);}
.blog-page-btn.primary{background:var(--rosa);border-color:var(--rosa);color:#fff;}
/* sidebar */
.blog-sidebar{display:flex;flex-direction:column;gap:1.2rem;}
.blog-sb-section{background:var(--surface);border:1px solid var(--border);border-radius:12px;overflow:hidden;}
.blog-sb-head{background:linear-gradient(135deg,rgba(196,57,107,.1),rgba(196,57,107,.04));padding:.6rem 1rem;display:flex;align-items:center;justify-content:space-between;}
.blog-sb-label{font-family:'Cinzel',serif;font-size:.58rem;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--rosa);}
.blog-sb-list{display:flex;flex-direction:column;}
.blog-sb-item{padding:.6rem 1rem;border-top:1px solid var(--border);cursor:pointer;transition:background .14s;}
.blog-sb-item:first-child{border-top:none;}
.blog-sb-item:hover{background:var(--rosa-dim);}
.blog-sb-title{font-family:'Playfair Display',serif;font-size:.82rem;font-weight:600;color:var(--text);line-height:1.3;margin-bottom:.15rem;}
.blog-sb-date{font-size:.65rem;color:var(--text-dim);}
/* modal de post */
#blog-modal-overlay{display:none;position:fixed;inset:0;z-index:500;background:rgba(40,10,20,.6);backdrop-filter:blur(4px);padding:1rem;overflow-y:auto;}
#blog-modal-overlay.open{display:flex;align-items:flex-start;justify-content:center;}
#blog-modal{background:#fff;border-radius:16px;border-top:3px solid var(--rosa);box-shadow:0 12px 48px rgba(196,57,107,.18);width:100%;max-width:680px;margin:auto;overflow:hidden;animation:fadeInUp .25s ease;}
.bm-header{background:linear-gradient(135deg,rgba(196,57,107,.1),rgba(196,57,107,.04));padding:.8rem 1.2rem;display:flex;align-items:center;gap:.8rem;flex-wrap:wrap;position:sticky;top:0;z-index:10;border-bottom:1px solid var(--border);}
.bm-toggle{display:flex;background:rgba(196,57,107,.1);border-radius:20px;padding:3px;gap:2px;flex:1;max-width:260px;}
.bm-toggle-btn{flex:1;background:none;border:none;border-radius:16px;font-family:'Cinzel',serif;font-size:.58rem;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--text-dim);padding:5px 10px;cursor:pointer;transition:all .16s;white-space:nowrap;}
.bm-toggle-btn.active{background:#fff;color:var(--rosa);box-shadow:0 1px 4px rgba(196,57,107,.15);}
.bm-close{background:none;border:none;color:var(--text-dim);font-size:1.1rem;line-height:1;cursor:pointer;padding:4px 6px;border-radius:6px;margin-left:auto;flex-shrink:0;transition:all .14s;}
.bm-close:hover{background:rgba(184,64,64,.08);color:#b84040;}
.bm-body{padding:1.5rem 1.5rem 1rem;}
.bm-title{font-family:'Playfair Display',serif;font-size:clamp(1.2rem,3.5vw,1.7rem);font-weight:600;color:var(--text);line-height:1.25;margin-bottom:.6rem;}
.bm-author-row{display:flex;align-items:center;gap:.5rem;font-size:.78rem;color:var(--text-dim);}
.bm-divider{height:1px;background:var(--border);margin:1.1rem 0 1.4rem;}
.bm-content{font-family:'Crimson Pro',Georgia,serif;font-size:1.04rem;line-height:1.78;color:var(--text);}
.bm-content p{margin-bottom:1em;}
.bm-content h2{font-family:'Playfair Display',serif;font-size:1.18rem;font-weight:600;margin:1.5em 0 .45em;}
.bm-content h3{font-family:'Cinzel',serif;font-size:.74rem;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--rosa);margin:1.2em 0 .4em;}
.bm-content blockquote{border-left:3px solid var(--rosa);padding:.5rem .85rem;margin:1em 0;background:var(--rosa-dim);border-radius:0 6px 6px 0;font-style:italic;color:var(--text-dim);}
.bm-content.raw-mode{font-style:italic;color:rgba(80,30,50,.65);white-space:pre-wrap;font-size:.95rem;line-height:1.7;}
.bm-comments{border-top:1px solid var(--border);padding:1.3rem 1.5rem 1.6rem;background:#fdfafa;}
.bm-comments-title{font-family:'Cinzel',serif;font-size:.62rem;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:var(--rosa);margin-bottom:1rem;}
.bm-auth-gate{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:1rem;text-align:center;margin-bottom:1.2rem;}
.bm-auth-gate p{font-family:'Crimson Pro',Georgia,serif;font-size:.9rem;color:var(--text-dim);margin-bottom:.7rem;font-style:italic;}
.bm-comment-form{margin-bottom:1.2rem;}
.bm-comment-user-row{display:flex;align-items:center;gap:.5rem;margin-bottom:.6rem;}
.bm-comment-user-name{font-family:'DM Sans',sans-serif;font-size:.8rem;font-weight:500;flex:1;}
.bm-comment-textarea{width:100%;background:transparent;border:1px solid var(--border);border-radius:6px;color:var(--text);font-family:'Crimson Pro',Georgia,serif;font-size:1rem;padding:9px 11px;resize:vertical;min-height:70px;transition:border-color .16s;outline:none;}
.bm-comment-textarea:focus{border-color:var(--rosa);}
.bm-comment-list{display:grid;gap:.8rem;}
.bm-comment-item{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:.8rem 1rem;}
.bm-comment-header{display:flex;align-items:center;gap:.5rem;margin-bottom:.4rem;}
.bm-comment-avatar{width:22px;height:22px;border-radius:50%;object-fit:cover;border:1px solid var(--border);flex-shrink:0;}
.bm-comment-author{font-family:'DM Sans',sans-serif;font-size:.75rem;font-weight:500;}
.bm-comment-time{font-size:.67rem;color:var(--text-dim);margin-left:auto;}
.bm-comment-text{font-family:'Crimson Pro',Georgia,serif;font-size:.9rem;line-height:1.5;}
.bm-comments-empty{font-family:'Crimson Pro',Georgia,serif;font-size:.88rem;color:var(--text-dim);font-style:italic;text-align:center;padding:.8rem 0;}
/* painel admin blog */
#blog-compose{background:linear-gradient(135deg,#2a1a22,#3d2232);border-radius:12px;padding:1.2rem 1.25rem;margin-bottom:1.5rem;}
.bc-header{display:flex;align-items:center;justify-content:space-between;gap:.8rem;margin-bottom:1rem;flex-wrap:wrap;}
.bc-title{font-family:'Cinzel',serif;font-size:.64rem;font-weight:700;letter-spacing:.15em;text-transform:uppercase;color:rgba(255,255,255,.65);}
.blog-slot{background:rgba(255,255,255,.05);border:1px solid rgba(196,57,107,.25);border-radius:10px;overflow:hidden;margin-bottom:.8rem;}
.blog-slot-head{background:rgba(196,57,107,.15);padding:.6rem .9rem;display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;}
.blog-slot-fields{display:flex;gap:.4rem;flex:1;flex-wrap:wrap;}
.blog-slot-input{background:rgba(255,255,255,.08);border:1px solid rgba(196,57,107,.2);border-radius:6px;color:#fff;font-family:'DM Sans',sans-serif;font-size:.78rem;padding:5px 8px;outline:none;flex:1;min-width:130px;}
.blog-slot-input::placeholder{color:rgba(255,255,255,.3);}
.blog-slot-select{background:rgba(255,255,255,.08);border:1px solid rgba(196,57,107,.2);border-radius:6px;color:#fff;font-family:'DM Sans',sans-serif;font-size:.78rem;padding:5px 8px;outline:none;cursor:pointer;}
.blog-slot-select option{background:#3d2232;}
.blog-slot-date{width:120px;}
.blog-slot-rm{background:none;border:none;color:rgba(255,255,255,.25);cursor:pointer;font-size:.95rem;padding:0 4px;transition:color .14s;}
.blog-slot-rm:hover{color:#e88;}
.blog-slot-body{display:grid;grid-template-columns:1fr 1fr;gap:0;}
@media(max-width:600px){.blog-slot-body{grid-template-columns:1fr}}
.blog-slot-col{padding:.8rem .9rem;display:flex;flex-direction:column;gap:.4rem;}
.blog-slot-col:first-child{border-right:1px solid rgba(196,57,107,.12);}
.blog-slot-col-label{font-family:'Cinzel',serif;font-size:.55rem;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.35);}
.blog-slot-textarea{flex:1;background:rgba(255,255,255,.04);border:1px solid rgba(196,57,107,.12);border-radius:6px;color:rgba(255,255,255,.85);font-family:'Crimson Pro',Georgia,serif;font-size:.9rem;padding:7px 9px;resize:vertical;min-height:100px;outline:none;line-height:1.5;transition:border-color .16s;}
.blog-slot-textarea:focus{border-color:rgba(196,57,107,.5);}
.blog-slot-textarea.raw{font-style:italic;color:rgba(255,255,255,.55);}
.blog-slot-actions{display:flex;gap:.4rem;flex-wrap:wrap;margin-top:.3rem;}
.blog-btn-slot{background:rgba(196,57,107,.22);border:1px solid rgba(196,57,107,.32);border-radius:5px;color:rgba(255,255,255,.8);font-family:'Cinzel',serif;font-size:.55rem;letter-spacing:.07em;font-weight:700;text-transform:uppercase;padding:5px 10px;cursor:pointer;display:inline-flex;align-items:center;gap:.3rem;transition:background .14s;}
.blog-btn-slot:hover{background:rgba(196,57,107,.38);}
.blog-btn-slot:disabled{opacity:.4;cursor:not-allowed;}
.blog-btn-slot.green{background:rgba(42,122,96,.28);border-color:rgba(42,122,96,.38);}
.blog-btn-slot.green:hover{background:rgba(42,122,96,.42);}
.blog-slot-spinner{display:none;width:11px;height:11px;border:2px solid rgba(255,255,255,.12);border-top-color:rgba(255,255,255,.65);border-radius:50%;animation:spin .7s linear infinite;}
.blog-btn-pub{background:linear-gradient(135deg,var(--rosa),var(--rosa-l));border:none;border-radius:7px;color:#fff;font-family:'Cinzel',serif;font-size:.65rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;padding:9px 20px;cursor:pointer;display:inline-flex;align-items:center;gap:.4rem;transition:opacity .16s;}
.blog-btn-pub:hover{opacity:.88;}
.blog-btn-pub:disabled{opacity:.4;cursor:not-allowed;}
.blog-add-slot{background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.13);border-radius:7px;color:rgba(255,255,255,.65);font-family:'Cinzel',serif;font-size:.62rem;font-weight:600;letter-spacing:.1em;text-transform:uppercase;padding:7px 16px;cursor:pointer;transition:background .14s;display:inline-flex;align-items:center;gap:.35rem;}
.blog-add-slot:hover{background:rgba(255,255,255,.12);}
@keyframes spin{to{transform:rotate(360deg)}}
"""

OLD_CSS = "</style>"
if OLD_CSS in html:
    html = html.replace(OLD_CSS, BLOG_CSS + "\n</style>", 1)
    print("  ✓ CSS do blog adicionado")
    ok += 1
else:
    print("  ✗ </style> não encontrado")

# ══════════════════════════════════════════════════════
# PATCH 2 — página blog (adicionar antes do <footer>)
# ══════════════════════════════════════════════════════
BLOG_PAGE = """
<!-- PÁGINA BLOG -->
<div id="page-blog" class="page">
  <div class="blog-wrap">
    <button class="back-btn" onclick="showPage('inicio')">← Voltar</button>

    <div class="blog-hero-int">
      <div class="eyebrow">Terreiro Bolhas de Luz · Porto Alegre</div>
      <div class="section-title">Palavras do Terreiro</div>
      <p class="hero-sub">Ensinamentos, avisos e histórias da nossa gira.</p>
    </div>

    <!-- painel admin blog (só para bolhasdeluz@gmail.com) -->
    <div id="blog-compose" style="display:none;">
      <div class="bc-header">
        <span class="bc-title">✍️ Redação rápida — admin</span>
        <div style="display:flex;gap:.5rem;flex-wrap:wrap;">
          <button class="blog-add-slot" onclick="blogAddSlot()">+ Novo post</button>
          <button class="blog-btn-pub" id="blog-btn-pub" onclick="blogPublishAll()">
            <span id="blog-spin-pub" class="blog-slot-spinner" style="border-top-color:#fff"></span>
            🚀 Publicar todos
          </button>
        </div>
      </div>
      <div id="blog-slots"></div>
      <!-- categorias -->
      <div style="margin-top:.8rem;padding:.8rem;background:rgba(255,255,255,.04);border:1px solid rgba(196,57,107,.18);border-radius:8px;">
        <div style="font-family:'Cinzel',serif;font-size:.55rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:rgba(255,255,255,.35);margin-bottom:.5rem;">Categorias</div>
        <div id="blog-cat-chips" style="display:flex;flex-wrap:wrap;gap:.4rem;margin-bottom:.5rem;"></div>
        <div style="display:flex;gap:.4rem;">
          <input type="text" id="blog-cat-input" placeholder="Nova categoria…"
            style="flex:1;background:rgba(255,255,255,.07);border:1px solid rgba(196,57,107,.2);border-radius:5px;color:#fff;font-family:'DM Sans',sans-serif;font-size:.78rem;padding:5px 8px;outline:none;"
            onkeydown="if(event.key==='Enter')blogAddCat()">
          <button class="blog-btn-slot" onclick="blogAddCat()">+ Adicionar</button>
          <button class="blog-btn-slot green" onclick="blogSaveCats()">💾 Salvar</button>
        </div>
      </div>
    </div>

    <!-- filtro de categorias -->
    <div class="blog-cat-bar" id="blog-cat-bar"></div>

    <div class="blog-list-layout">
      <div id="blog-post-list"><div class="spinner"></div></div>
      <aside class="blog-sidebar" id="blog-sidebar"></aside>
    </div>
  </div>
</div>

<!-- MODAL DO POST (blog integrado) -->
<div id="blog-modal-overlay" onclick="blogCloseModal(event)">
  <div id="blog-modal">
    <div class="bm-header">
      <div id="bm-meta" style="display:flex;align-items:center;gap:.4rem;flex-shrink:0;"></div>
      <div class="bm-toggle" id="bm-toggle" style="display:none;">
        <button class="bm-toggle-btn active" id="bm-btn-original" onclick="blogSwitchVersion('original')">📋 Original</button>
        <button class="bm-toggle-btn" id="bm-btn-formatado" onclick="blogSwitchVersion('formatado')">✨ Formatado</button>
      </div>
      <button class="bm-close" onclick="blogCloseModal()">✕</button>
    </div>
    <div class="bm-body">
      <h1 class="bm-title" id="bm-title"></h1>
      <div class="bm-author-row" id="bm-author-row"></div>
      <div class="bm-divider"></div>
      <div class="bm-content" id="bm-content"></div>
    </div>
    <div class="bm-comments">
      <p class="bm-comments-title">💬 Comentários</p>
      <div id="bm-comment-gate" class="bm-auth-gate">
        <p>Entre com sua conta Google para comentar.</p>
        <button class="btn-rosa" style="display:inline-flex;align-items:center;gap:8px;font-size:11px;" onclick="loginGoogle()">
          <svg width="16" height="16" viewBox="0 0 24 24"><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/></svg>
          Entrar com Google
        </button>
      </div>
      <div id="bm-comment-form" class="bm-comment-form" style="display:none;">
        <div class="bm-comment-user-row">
          <img src="" alt="" class="bm-comment-avatar" id="bm-user-avatar">
          <span class="bm-comment-user-name" id="bm-user-name"></span>
          <button style="background:none;border:none;font-size:.7rem;color:var(--text-dim);cursor:pointer;text-decoration:underline;" onclick="logoutGoogle()">Sair</button>
        </div>
        <textarea class="bm-comment-textarea" id="bm-comment-input" placeholder="Escreva um comentário… (Ctrl+Enter para enviar)" rows="3"></textarea>
        <button class="btn-rosa" id="bm-comment-submit" onclick="blogSubmitComment()" style="margin-top:.5rem;font-size:11px;padding:9px 20px;">Publicar</button>
      </div>
      <div id="bm-comment-list" class="bm-comment-list"></div>
    </div>
  </div>
</div>
"""

OLD_FOOTER = "<footer>"
if OLD_FOOTER in html:
    html = html.replace(OLD_FOOTER, BLOG_PAGE + "\n<footer>", 1)
    print("  ✓ Página blog adicionada")
    ok += 1
else:
    print("  ✗ <footer> não encontrado")

# ══════════════════════════════════════════════════════
# PATCH 3 — renderDrawerItem: blog vira showPage
# ══════════════════════════════════════════════════════
OLD_DRAWER = """  // link externo — usa button com onclick em vez de <a href> para evitar navegação acidental
  const onclickExterno = item.url && item.url.includes('blogbolhas.pages.dev')
    ? `abrirBlog(event);closeDrawer()`
    : `window.open('${item.url}','_blank');closeDrawer()`;
  return `<button class="drawer-link" onclick="${onclickExterno}">${dot}${item.label}</button>`;"""

NEW_DRAWER = """  // link externo — usa button com onclick em vez de <a href> para evitar navegação acidental
  if (item.url && item.url.includes('blogbolhas.pages.dev')) {
    return `<button class="drawer-link" onclick="showPage('blog');closeDrawer()">${dot}${item.label}</button>`;
  }
  return `<button class="drawer-link" onclick="window.open('${item.url}','_blank');closeDrawer()">${dot}${item.label}</button>`;"""

if OLD_DRAWER in html:
    html = html.replace(OLD_DRAWER, NEW_DRAWER, 1)
    print("  ✓ renderDrawerItem atualizado")
    ok += 1
else:
    print("  ✗ renderDrawerItem não encontrado (patch anterior pode não ter sido aplicado)")

# ══════════════════════════════════════════════════════
# PATCH 4 — renderCards: blog vira showPage
# ══════════════════════════════════════════════════════
OLD_CARDS = """      else if (item.url && item.url.includes('blogbolhas.pages.dev'))
        onclick = `onclick="abrirBlog(event);return false" href="#"`;
      else onclick = `onclick="window.open('${item.url}','_blank')" href="#"`;"""

NEW_CARDS = """      else if (item.url && item.url.includes('blogbolhas.pages.dev'))
        onclick = `onclick="showPage('blog');return false" href="#"`;
      else onclick = `onclick="window.open('${item.url}','_blank')" href="#"`;"""

if OLD_CARDS in html:
    html = html.replace(OLD_CARDS, NEW_CARDS, 1)
    print("  ✓ renderCards atualizado")
    ok += 1
else:
    print("  ✗ renderCards não encontrado")

# ══════════════════════════════════════════════════════
# PATCH 5 — showPage: adicionar caso 'blog'
# ══════════════════════════════════════════════════════
OLD_SHOWPAGE = "  if (name === 'admin') { renderAdminPanel(); carregarFilhasAdmin(); }"
NEW_SHOWPAGE = """  if (name === 'admin') { renderAdminPanel(); carregarFilhasAdmin(); }
  if (name === 'blog')  { blogInit(); }"""

if OLD_SHOWPAGE in html:
    html = html.replace(OLD_SHOWPAGE, NEW_SHOWPAGE, 1)
    print("  ✓ showPage atualizado")
    ok += 1
else:
    print("  ✗ showPage não encontrado")

# ══════════════════════════════════════════════════════
# PATCH 6 — Firebase module: adicionar Firestore + funções blog
# ══════════════════════════════════════════════════════
OLD_FB_IMPORT = """import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, getRedirectResult }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';"""

NEW_FB_IMPORT = """import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, getRedirectResult }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { getFirestore, collection, addDoc, doc, setDoc, deleteDoc,
  query, where, orderBy, onSnapshot, serverTimestamp, getDocs }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';"""

if OLD_FB_IMPORT in html:
    html = html.replace(OLD_FB_IMPORT, NEW_FB_IMPORT, 1)
    print("  ✓ Firebase import atualizado")
    ok += 1
else:
    print("  ✗ Firebase import não encontrado")

# Adiciona inicialização do Firestore após initializeApp
OLD_FB_INIT = "const auth = getAuth(app);"
NEW_FB_INIT = """const auth = getAuth(app);
  const db   = getFirestore(app);

  // ── Firestore: funções do blog ──
  window._blogLoadPosts = (cb) => {
    const q = query(collection(db,'posts'), orderBy('dateSort','desc'));
    return onSnapshot(q, snap => cb(snap.docs.map(d => ({ id:d.id, ...d.data() }))));
  };
  window._blogSavePosts = async (posts) => {
    for (const p of posts) await setDoc(doc(db,'posts',p.id), p);
  };
  window._blogDeletePost = async (id) => deleteDoc(doc(db,'posts',id));
  window._blogLoadComments = (postId, cb) => {
    const q = query(collection(db,'comments'), where('postId','==',postId), orderBy('createdAt','asc'));
    return onSnapshot(q, snap => cb(snap.docs.map(d => ({ id:d.id, ...d.data() }))));
  };
  window._blogAddComment = async (postId, text) => {
    const u = currentUser; if (!u) return;
    await addDoc(collection(db,'comments'), {
      postId, text, authorName:u.displayName,
      authorPhoto:u.photoURL, authorUid:u.uid, createdAt:serverTimestamp()
    });
  };
  window._blogSaveCats = async (cats) => setDoc(doc(db,'config','categories'), { list:cats });
  window._blogLoadCats = async () => {
    const snap = await getDocs(collection(db,'config'));
    const d = snap.docs.find(d => d.id === 'categories');
    return d ? d.data().list : null;
  };"""

if OLD_FB_INIT in html:
    html = html.replace(OLD_FB_INIT, NEW_FB_INIT, 1)
    print("  ✓ Firestore inicializado")
    ok += 1
else:
    print("  ✗ getAuth não encontrado para inserir Firestore")

# ══════════════════════════════════════════════════════
# PATCH 7 — JS do blog (adicionar antes de loadMenu())
# ══════════════════════════════════════════════════════
BLOG_JS = """
// ══════════════════════════════════════════════════════
// BLOG INTEGRADO
// ══════════════════════════════════════════════════════
const BLOG_AUTHOR  = 'Mãe Anna';
const BLOG_AI_URL  = 'https://blog-claude.bolhasdeluz.workers.dev';
const BLOG_PAGE_SZ = 5;

let _blogPosts    = [];
let _blogCats     = ['Doutrina e Fundamentos','Desenvolvimento Mediúnico','Práticas e Preceitos','Orixás e Guias','Vida no Terreiro','Notícias e Avisos'];
let _blogFilter   = 'todas';
let _blogPage     = 0;
let _blogModal    = null;
let _blogModalV   = 'original';
let _blogSlotN    = 0;
let _blogUnsub    = null;
let _blogUnsubCm  = null;
let _blogInited   = false;

function blogIsAdmin() {
  const user = window._getCurrentUser && window._getCurrentUser();
  return user && user.email === 'bolhasdeluz@gmail.com';
}

function blogInit() {
  // mostra/oculta painel admin
  document.getElementById('blog-compose').style.display = blogIsAdmin() ? '' : 'none';

  if (_blogInited) { blogRenderCatBar(); blogRenderList(); return; }
  _blogInited = true;

  // carrega categorias
  if (window._blogLoadCats) {
    window._blogLoadCats().then(cats => {
      if (cats?.length) { _blogCats = cats; blogRenderCatChips(); blogRenderCatBar(); }
    }).catch(() => {});
  }

  // carrega posts via Firestore
  if (window._blogLoadPosts) {
    _blogUnsub = window._blogLoadPosts(posts => {
      _blogPosts = posts;
      blogRenderList();
      blogRenderSidebar();
    });
  } else {
    _blogPosts = [];
    blogRenderList();
  }

  blogRenderCatBar();
  blogRenderCatChips();
}

// ── Categorias ────────────────────────────────
function blogRenderCatBar() {
  const el = document.getElementById('blog-cat-bar');
  if (!el) return;
  el.innerHTML =
    `<button class="blog-cat-pill ${_blogFilter==='todas'?'active':''}" onclick="blogFilterCat('todas')">Todas</button>` +
    _blogCats.map(c => `<button class="blog-cat-pill ${_blogFilter===c?'active':''}" onclick="blogFilterCat(${JSON.stringify(c)})">${c}</button>`).join('');
}

function blogRenderCatChips() {
  const el = document.getElementById('blog-cat-chips');
  if (!el) return;
  el.innerHTML = _blogCats.map((c,i) => `
    <div style="display:flex;align-items:center;gap:.3rem;background:rgba(255,255,255,.07);border:1px solid rgba(196,57,107,.18);border-radius:5px;padding:3px 9px;">
      <span style="font-family:'DM Sans',sans-serif;font-size:.75rem;color:rgba(255,255,255,.7);">${c}</span>
      <button style="background:none;border:none;color:rgba(255,255,255,.25);cursor:pointer;font-size:.85rem;line-height:1;padding:0 2px;" onclick="blogRemoveCat(${i})">×</button>
    </div>`).join('');
}

function blogFilterCat(cat) { _blogFilter = cat; _blogPage = 0; blogRenderCatBar(); blogRenderList(); }

function blogAddCat() {
  const inp = document.getElementById('blog-cat-input');
  const v = (inp.value||'').trim();
  if (!v || _blogCats.includes(v)) return;
  _blogCats.push(v); inp.value = '';
  blogRenderCatChips(); blogRenderCatBar();
}

function blogRemoveCat(i) { _blogCats.splice(i,1); blogRenderCatChips(); blogRenderCatBar(); }

async function blogSaveCats() {
  if (!window._blogSaveCats) return;
  try { await window._blogSaveCats(_blogCats); blogShowToast('Categorias salvas! ✨'); }
  catch(e) { blogShowToast('Erro ao salvar.', true); }
}

// ── Lista de posts ────────────────────────────
function blogRenderList() {
  const el = document.getElementById('blog-post-list');
  if (!el) return;
  const lista = _blogFilter === 'todas' ? _blogPosts : _blogPosts.filter(p => p.category === _blogFilter);

  if (!lista.length) {
    el.innerHTML = '<p class="blog-empty">Nenhum post nesta categoria ainda. 🌙</p>';
    return;
  }

  const start = _blogPage * BLOG_PAGE_SZ;
  const page  = lista.slice(start, start + BLOG_PAGE_SZ);
  const total = lista.length;
  const isAdm = blogIsAdmin();

  el.innerHTML = page.map(p => `
    <div class="blog-post-card" data-pid="${blogEsc(p.id)}">
      <div class="blog-card-top">
        <span class="blog-cat-badge">${p.category||'Geral'}</span>
        <span style="font-size:.67rem;color:var(--text-dim);">✍️ ${p.author||BLOG_AUTHOR}</span>
        <span class="blog-post-date">${p.date||''}</span>
      </div>
      <div class="blog-card-body">
        <div class="blog-card-title">${p.title}</div>
        <div class="blog-card-excerpt">${p.excerpt||''}</div>
      </div>
      <div class="blog-card-footer">
        <span style="font-size:.7rem;color:var(--text-dim);">💬 comentários</span>
        <div style="display:flex;align-items:center;gap:.5rem;">
          ${isAdm ? `<div class="blog-admin-btns">
            <button class="blog-btn-edit" data-action="edit" data-pid="${blogEsc(p.id)}">Editar</button>
            <button class="blog-btn-del"  data-action="del"  data-pid="${blogEsc(p.id)}">Excluir</button>
          </div>` : ''}
          <span class="blog-read-more">Ler mais →</span>
        </div>
      </div>
    </div>`).join('') + `
  <div class="blog-pagination">
    <span class="blog-page-info">${start+1}–${Math.min(start+BLOG_PAGE_SZ,total)} de ${total}</span>
    <div class="blog-page-btns">
      ${_blogPage > 0 ? `<button class="blog-page-btn" onclick="blogChangePage(-1)">← Anterior</button>` : ''}
      ${start+BLOG_PAGE_SZ < total ? `<button class="blog-page-btn primary" onclick="blogChangePage(1)">Próximos →</button>` : ''}
    </div>
  </div>`;

  el.onclick = (e) => {
    const del  = e.target.closest("[data-action='del']");
    const edit = e.target.closest("[data-action='edit']");
    const card = e.target.closest('.blog-post-card');
    if (del)  { e.stopPropagation(); blogDeletePost(del.dataset.pid); return; }
    if (edit) { e.stopPropagation(); blogEditInSlot(edit.dataset.pid); return; }
    if (card) { blogOpenPost(card.dataset.pid); }
  };

  blogRenderSidebar();
}

function blogChangePage(dir) {
  _blogPage += dir;
  blogRenderList();
  document.getElementById('blog-post-list').scrollIntoView({ behavior:'smooth', block:'start' });
}

function blogRenderSidebar() {
  const sb = document.getElementById('blog-sidebar');
  if (!sb) return;
  const byCat = {};
  _blogPosts.forEach(p => {
    const c = p.category||'Geral';
    if (!byCat[c]) byCat[c] = [];
    if (byCat[c].length < 3) byCat[c].push(p);
  });
  if (!Object.keys(byCat).length) { sb.innerHTML = ''; return; }
  sb.innerHTML = Object.entries(byCat).map(([cat,posts]) => `
    <div class="blog-sb-section">
      <div class="blog-sb-head">
        <span class="blog-sb-label">${cat}</span>
        <button style="font-family:'Cinzel',serif;font-size:.52rem;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--text-dim);cursor:pointer;background:none;border:none;transition:color .14s;" onmouseover="this.style.color='var(--rosa)'" onmouseout="this.style.color=''" onclick="blogFilterCat(${JSON.stringify(cat)})">Ver todos →</button>
      </div>
      <div class="blog-sb-list">
        ${posts.map(p => `<div class="blog-sb-item" data-sid="${blogEsc(p.id)}"><div class="blog-sb-title">${p.title}</div><div class="blog-sb-date">${p.date||''}</div></div>`).join('')}
      </div>
    </div>`).join('');
  sb.onclick = (e) => { const it = e.target.closest('.blog-sb-item'); if (it) blogOpenPost(it.dataset.sid); };
}

async function blogDeletePost(id) {
  if (!confirm('Excluir este post?')) return;
  try { await window._blogDeletePost(id); blogShowToast('Excluído.'); }
  catch(e) { blogShowToast('Erro ao excluir.', true); }
}

function blogEditInSlot(id) {
  const p = _blogPosts.find(x => x.id === id);
  if (!p) return;
  blogAddSlot({ title:p.title, category:p.category, date:p.dateSort||'', raw:p.raw||'', excerpt:p.excerpt||'', body:p.body||'' });
  document.getElementById('blog-compose').scrollIntoView({ behavior:'smooth' });
  blogShowToast('Post carregado para edição.');
}

// ── Modal de post ─────────────────────────────
function blogOpenPost(id) {
  const p = _blogPosts.find(x => x.id === id);
  if (!p) return;
  _blogModal  = p;
  _blogModalV = 'original';

  document.getElementById('bm-meta').innerHTML = `<span class="blog-cat-badge">${p.category||'Geral'}</span>`;
  document.getElementById('bm-title').textContent = p.title;
  document.getElementById('bm-author-row').innerHTML =
    `<img src="https://ui-avatars.com/api/?name=Bolhas+de+Luz&background=c4396b&color=fff&size=56"
       style="width:22px;height:22px;border-radius:50%;border:1px solid var(--border);" alt="">
     <span>${p.author||BLOG_AUTHOR} · Terreiro Bolhas de Luz</span>
     <span>·</span><span>${p.date||''}</span>`;

  blogSwitchVersion('original');

  const overlay = document.getElementById('blog-modal-overlay');
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
  document.getElementById('blog-modal').scrollTop = 0;

  // toggle só se tiver raw
  document.getElementById('bm-toggle').style.display = p.raw ? 'flex' : 'none';

  // comentários
  if (_blogUnsubCm) { _blogUnsubCm(); _blogUnsubCm = null; }
  const listEl = document.getElementById('bm-comment-list');
  listEl.innerHTML = '<div class="spinner"></div>';
  if (window._blogLoadComments) {
    _blogUnsubCm = window._blogLoadComments(id, comments => {
      if (!comments.length) {
        listEl.innerHTML = '<p class="bm-comments-empty">Seja a primeira a comentar. 🌟</p>';
      } else {
        listEl.innerHTML = comments.map(c => {
          const ts = c.createdAt?.toDate?.();
          const t  = ts ? ts.toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '';
          return `<div class="bm-comment-item">
            <div class="bm-comment-header">
              <img src="${c.authorPhoto||''}" class="bm-comment-avatar"
                onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(c.authorName)}&background=fce8ef&color=c4396b&size=52'">
              <span class="bm-comment-author">${c.authorName}</span>
              <span class="bm-comment-time">${t}</span>
            </div>
            <p class="bm-comment-text">${c.text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\\n/g,'<br>')}</p>
          </div>`;
        }).join('');
      }
    });
  } else {
    listEl.innerHTML = '<p class="bm-comments-empty">Firebase não configurado.</p>';
  }

  blogUpdateCommentUI();
}

function blogSwitchVersion(v) {
  _blogModalV = v;
  if (!_blogModal) return;
  const content = document.getElementById('bm-content');
  document.getElementById('bm-btn-original').classList.toggle('active',  v === 'original');
  document.getElementById('bm-btn-formatado').classList.toggle('active', v === 'formatado');
  if (v === 'formatado') {
    content.className = 'bm-content';
    content.innerHTML = _blogModal.body || (_blogModal.excerpt ? `<p>${_blogModal.excerpt}</p>` : '<p style="color:var(--text-dim);font-style:italic;">Sem conteúdo formatado ainda.</p>');
  } else {
    content.className = 'bm-content raw-mode';
    content.textContent = _blogModal.raw || 'Texto original não disponível.';
  }
}

function blogCloseModal(e) {
  if (e && e.target !== document.getElementById('blog-modal-overlay')) return;
  document.getElementById('blog-modal-overlay').classList.remove('open');
  document.body.style.overflow = '';
  if (_blogUnsubCm) { _blogUnsubCm(); _blogUnsubCm = null; }
  _blogModal = null;
}

function blogUpdateCommentUI() {
  const user = window._getCurrentUser && window._getCurrentUser();
  const gate = document.getElementById('bm-comment-gate');
  const form = document.getElementById('bm-comment-form');
  if (!gate || !form) return;
  if (user) {
    gate.style.display = 'none'; form.style.display = '';
    const av = document.getElementById('bm-user-avatar');
    const nm = document.getElementById('bm-user-name');
    if (av) av.src = user.photoURL||'';
    if (nm) nm.textContent = user.displayName||'';
  } else {
    gate.style.display = ''; form.style.display = 'none';
  }
}

async function blogSubmitComment() {
  const inp = document.getElementById('bm-comment-input');
  const btn = document.getElementById('bm-comment-submit');
  const txt = (inp.value||'').trim();
  if (!txt || !_blogModal) return;
  btn.disabled = true; btn.textContent = 'Publicando…';
  try {
    await window._blogAddComment(_blogModal.id, txt);
    inp.value = '';
    blogShowToast('Comentário publicado! ✨');
  } catch(e) { blogShowToast('Erro ao publicar.', true); }
  btn.disabled = false; btn.textContent = 'Publicar';
}

// ── Slots de rascunho ─────────────────────────
function blogAddSlot(data = {}) {
  _blogSlotN++;
  const id    = `bslot-${_blogSlotN}`;
  const today = new Date().toISOString().slice(0,10);
  const wrap  = document.createElement('div');
  wrap.className = 'blog-slot';
  wrap.id = id;
  wrap.innerHTML = `
    <div class="blog-slot-head">
      <span style="font-family:'Cinzel',serif;font-size:.55rem;font-weight:700;letter-spacing:.1em;color:rgba(255,255,255,.4);text-transform:uppercase;">#${_blogSlotN}</span>
      <div class="blog-slot-fields">
        <input type="text" class="blog-slot-input" id="${id}-title" placeholder="Título…" value="${blogEscAttr(data.title||'')}">
        <select class="blog-slot-select blog-slot-cat-sel" id="${id}-cat">
          ${_blogCats.map(c=>`<option ${c===(data.category||_blogCats[0])?"selected":""}>${c}</option>`).join('')}
        </select>
        <input type="date" class="blog-slot-input blog-slot-date" id="${id}-date" value="${data.date||today}">
      </div>
      <button class="blog-slot-rm" onclick="blogRemoveSlot('${id}')">✕</button>
    </div>
    <div class="blog-slot-body">
      <div class="blog-slot-col">
        <span class="blog-slot-col-label">📋 Texto bruto</span>
        <textarea class="blog-slot-textarea raw" id="${id}-raw" placeholder="Cole o texto do WhatsApp, rascunho…">${blogEscAttr(data.raw||'')}</textarea>
        <div class="blog-slot-actions">
          <button class="blog-btn-slot" id="${id}-btn-fmt" onclick="blogSlotFormat('${id}')">
            <span id="${id}-spin-fmt" class="blog-slot-spinner"></span>✨ Formatar
          </button>
          <button class="blog-btn-slot green" id="${id}-btn-exc" onclick="blogSlotExcerpt('${id}')">
            <span id="${id}-spin-exc" class="blog-slot-spinner"></span>📝 Resumo
          </button>
        </div>
      </div>
      <div class="blog-slot-col">
        <span class="blog-slot-col-label">✅ Resumo</span>
        <textarea class="blog-slot-textarea" id="${id}-excerpt" placeholder="Resumo gerado pela IA…">${blogEscAttr(data.excerpt||'')}</textarea>
        <div style="margin-top:.4rem;">
          <span class="blog-slot-col-label" style="display:block;margin-bottom:.3rem;">HTML formatado</span>
          <textarea class="blog-slot-textarea" id="${id}-body" style="min-height:70px;font-size:.8rem;" placeholder="HTML gerado ou colado diretamente.">${blogEscAttr(data.body||'')}</textarea>
        </div>
      </div>
    </div>`;
  document.getElementById('blog-slots').appendChild(wrap);
}

function blogRemoveSlot(id) { document.getElementById(id)?.remove(); }

async function blogSlotFormat(id) {
  const raw = document.getElementById(`${id}-raw`).value.trim();
  if (!raw) { blogShowToast('Cole o texto bruto primeiro.', true); return; }
  const btn = document.getElementById(`${id}-btn-fmt`);
  const spin = document.getElementById(`${id}-spin-fmt`);
  btn.disabled = true; spin.style.display = 'inline-block';
  try {
    const result = await blogCallAI(
      `Você é editora do blog espiritual "Terreiro Bolhas de Luz" (Umbanda e Quimbanda, Porto Alegre, RS). Transforme o texto bruto em HTML limpo. Use apenas <p> <h2> <h3> <blockquote> <em> <strong>. Preserve a voz da autora. Falas de entidades em <blockquote>. Retorne SOMENTE o HTML.`,
      `Texto bruto:\\n\\n${raw}`
    );
    document.getElementById(`${id}-body`).value = result;
    blogShowToast('Formatado! ✨');
  } catch(e) { blogShowToast('Erro na API.', true); }
  btn.disabled = false; spin.style.display = 'none';
}

async function blogSlotExcerpt(id) {
  const src = document.getElementById(`${id}-body`).value.trim() || document.getElementById(`${id}-raw`).value.trim();
  if (!src) { blogShowToast('Formate o texto primeiro.', true); return; }
  const btn = document.getElementById(`${id}-btn-exc`);
  const spin = document.getElementById(`${id}-spin-exc`);
  btn.disabled = true; spin.style.display = 'inline-block';
  try {
    const result = await blogCallAI(
      `Escreva um resumo curto (2-3 frases, máx 280 caracteres) para o blog "Terreiro Bolhas de Luz". Tom acolhedor, espiritual, direto. Retorne APENAS o texto.`,
      src.replace(/<[^>]+>/g,' ').replace(/\\s+/g,' ').slice(0,3000)
    );
    document.getElementById(`${id}-excerpt`).value = result;
    blogShowToast('Resumo gerado! ✨');
  } catch(e) { blogShowToast('Erro na API.', true); }
  btn.disabled = false; spin.style.display = 'none';
}

async function blogPublishAll() {
  const slots = document.querySelectorAll('#blog-slots .blog-slot');
  if (!slots.length) { blogShowToast('Nenhum slot para publicar.', true); return; }
  const btn  = document.getElementById('blog-btn-pub');
  const spin = document.getElementById('blog-spin-pub');
  btn.disabled = true; spin.style.display = 'inline-block';

  const toSave = [];
  slots.forEach(slot => {
    const id      = slot.id;
    const title   = (document.getElementById(`${id}-title`)?.value||'').trim();
    const body    = (document.getElementById(`${id}-body`)?.value||'').trim();
    const excerpt = (document.getElementById(`${id}-excerpt`)?.value||'').trim();
    const cat     = document.getElementById(`${id}-cat`)?.value || _blogCats[0];
    const raw     = (document.getElementById(`${id}-raw`)?.value||'').trim();
    const dateVal = document.getElementById(`${id}-date`)?.value || new Date().toISOString().slice(0,10);
    if (!title) return;
    const slug = title.toLowerCase()
      .normalize('NFD').replace(/[\\u0300-\\u036f]/g,'')
      .replace(/[^a-z0-9\\s-]/g,'').trim().replace(/\\s+/g,'-')
      + '-' + dateVal.replace(/-/g,'');
    const [y,m,d] = dateVal.split('-');
    toSave.push({ id:slug, title, category:cat, body, excerpt, raw,
      date:`${d}/${m}/${y}`, dateSort:dateVal, author:BLOG_AUTHOR });
  });

  if (!toSave.length) { blogShowToast('Nenhum slot com título.', true); btn.disabled=false; spin.style.display='none'; return; }

  try {
    await window._blogSavePosts(toSave);
    document.getElementById('blog-slots').innerHTML = '';
    blogShowToast(`${toSave.length} post(s) publicado(s)! 🎉`);
  } catch(e) { blogShowToast('Erro ao salvar no Firebase.', true); }

  btn.disabled = false; spin.style.display = 'none';
}

// ── IA ────────────────────────────────────────
async function blogCallAI(system, userMsg) {
  const res = await fetch(BLOG_AI_URL, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({ system, messages:[{ role:'user', content:userMsg }] })
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return (data.content?.find(b => b.type==='text')?.text||'').trim();
}

// ── Utils blog ────────────────────────────────
let _blogToastTimer = null;
function blogShowToast(msg, isErr=false) {
  // reutiliza o toast global do sistema
  const t = document.getElementById('toast') || document.createElement('div');
  t.textContent = msg;
  t.className = 'toast' + (isErr ? ' error' : '');
  t.classList.add('show');
  clearTimeout(_blogToastTimer);
  _blogToastTimer = setTimeout(() => t.classList.remove('show'), 3400);
}
function blogEsc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function blogEscAttr(s) { return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;'); }

// atualiza UI de comentário quando auth muda
document.addEventListener('authChanged', () => {
  blogUpdateCommentUI();
  // atualiza painel admin se blog estiver visível
  const blogPage = document.getElementById('page-blog');
  if (blogPage?.classList.contains('active')) {
    document.getElementById('blog-compose').style.display = blogIsAdmin() ? '' : 'none';
    blogRenderList();
  }
});

// fecha modal com ESC
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') blogCloseModal({ target: document.getElementById('blog-modal-overlay') });
  if (e.target?.id === 'bm-comment-input' && (e.ctrlKey||e.metaKey) && e.key==='Enter') blogSubmitComment();
});

// ── abrirBlog → agora vira showPage ──────────
function abrirBlog(e) {
  if (e) e.preventDefault();
  showPage('blog');
}

"""

OLD_LOADMENU = "// inicializar\nloadMenu();"
if OLD_LOADMENU in html:
    html = html.replace(OLD_LOADMENU, BLOG_JS + "\n// inicializar\nloadMenu();", 1)
    print("  ✓ JS do blog adicionado")
    ok += 1
else:
    print("  ✗ loadMenu() não encontrado")

with open("index.html", "w", encoding="utf-8") as f:
    f.write(html)

print(f"\n✦ {ok}/8 patches aplicados.")
print(f"  Arquivo: {len(html):,} bytes")
PYEOF
