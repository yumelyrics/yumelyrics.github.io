// generate-resources.cjs
// Dijalankan oleh GitHub Actions untuk generate halaman HTML per resource
// Output: folder resources/ di root repo

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore }        = require('firebase-admin/firestore');
const fs   = require('fs');
const path = require('path');

initializeApp({
  credential: cert({
    projectId:   'yumesubs7',
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey:  (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  }),
});

const db = getFirestore();

const BASE_URL = 'https://yumelyrics.my.id';
const OUT_DIR  = path.join(__dirname, 'resources');
const SITE_XML = path.join(__dirname, 'sitemap.xml');

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function slug(title) {
  return String(title || '')
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

const CAT_STYLE = {
  Aplikasi: { color: '#3a5f8a', border: 'rgba(58,95,138,.3)',  bg: 'rgba(58,95,138,.07)' },
  Video:    { color: '#4a7c59', border: 'rgba(74,124,89,.35)', bg: 'rgba(74,124,89,.08)' },
  Tools:    { color: '#8a5a3a', border: 'rgba(138,90,58,.3)',  bg: 'rgba(138,90,58,.07)' },
};

function catPillHTML(cat) {
  const c = CAT_STYLE[cat];
  const lbl = cat || 'Resource';
  if (!c) {
    return `<span style="font-size:.54rem;font-weight:700;letter-spacing:.2em;text-transform:uppercase;padding:.2rem .65rem;border:1px solid rgba(10,8,18,.15);color:#8c8278;font-family:'Syne',sans-serif">${esc(lbl)}</span>`;
  }
  return `<span style="font-size:.54rem;font-weight:700;letter-spacing:.2em;text-transform:uppercase;padding:.2rem .65rem;border:1px solid ${c.border};color:${c.color};background:${c.bg};font-family:'Syne',sans-serif">${esc(lbl)}</span>`;
}

const SITE_NAV_CSS = `
nav{position:sticky;top:0;z-index:100;display:flex;align-items:center;justify-content:space-between;padding:1.2rem 3rem;min-width:0;background:rgba(245,240,234,.92);backdrop-filter:blur(20px);border-bottom:1px solid rgba(10,8,18,.08);isolation:isolate}
[data-theme="dark"] nav{background:rgba(15,13,11,.92)}
.nav-logo{display:flex;flex-direction:column;gap:.05rem;text-decoration:none;cursor:pointer;flex-shrink:0;min-width:0}
.nljp{font-family:var(--jp);font-size:1.05rem;font-weight:600;color:var(--ink);white-space:nowrap;line-height:1;letter-spacing:.1em}
.nlen{font-size:.55rem;color:var(--ash);letter-spacing:.3em;text-transform:uppercase;white-space:nowrap;line-height:1;font-weight:700}
.nav-links{display:flex;gap:.25rem;align-items:center;flex-shrink:0}
#nav-menu-btn{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;background:none;border:1px solid rgba(10,8,18,.1);cursor:pointer;flex-shrink:0;flex-direction:column;padding:0}
[data-theme="dark"] #nav-menu-btn{border-color:rgba(232,226,217,.1)}
#nav-menu-btn span{display:block;width:14px;height:1.5px;background:var(--ash);transition:transform .25s ease,opacity .2s ease,width .25s ease}
#nav-menu-btn span:nth-child(2){margin:3px 0}
#nav-menu-btn.open span:nth-child(1){transform:translateY(4.5px) rotate(45deg)}
#nav-menu-btn.open span:nth-child(2){opacity:0;width:0}
#nav-menu-btn.open span:nth-child(3){transform:translateY(-4.5px) rotate(-45deg)}
#nav-dropdown{position:absolute;top:calc(100% + 1px);right:3rem;z-index:200;background:var(--paper);border:1px solid rgba(10,8,18,.1);display:none;flex-direction:column;min-width:160px;max-width:calc(100vw - 2rem);box-shadow:0 8px 32px rgba(10,8,18,.1)}
[data-theme="dark"] #nav-dropdown{background:var(--cream)}
#nav-dropdown.open{display:flex}
.nd-item{font-family:var(--sans);font-size:.68rem;color:var(--ash);letter-spacing:.18em;text-transform:uppercase;padding:.75rem 1.2rem;width:100%;font-weight:600;text-decoration:none;display:block;white-space:nowrap}
.nd-item:hover,.nd-item.on{color:var(--ink);background:var(--cream)}
#theme-toggle{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;background:none;border:1px solid rgba(10,8,18,.1);cursor:pointer;position:relative;overflow:hidden;padding:0;flex-shrink:0}
[data-theme="dark"] #theme-toggle{border-color:rgba(232,226,217,.3)}
#theme-toggle svg{width:14px;height:14px;stroke:var(--ash);fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;position:absolute}
#theme-toggle .icon-sun{opacity:1}
#theme-toggle .icon-moon{opacity:0}
[data-theme="dark"] #theme-toggle .icon-sun{opacity:0}
[data-theme="dark"] #theme-toggle .icon-moon{opacity:1}
@media(max-width:768px){nav{padding:.85rem 1rem}#nav-dropdown{right:1rem}}
@media(max-width:380px){.nlen{display:none}#nav-dropdown{right:.85rem}}
`;

const SITE_NAV_SCRIPT = `<script>
(function(){if(localStorage.getItem('ym_theme')==='dark')document.documentElement.setAttribute('data-theme','dark');})();
function toggleTheme(){
  var r=document.documentElement,isDark=r.getAttribute('data-theme')==='dark';
  if(isDark){r.removeAttribute('data-theme');localStorage.setItem('ym_theme','light');}
  else{r.setAttribute('data-theme','dark');localStorage.setItem('ym_theme','dark');}
}
function toggleNavMenu(){
  var btn=document.getElementById('nav-menu-btn'),dd=document.getElementById('nav-dropdown');
  if(!btn||!dd)return;
  var open=dd.classList.toggle('open');
  btn.classList.toggle('open',open);
  btn.setAttribute('aria-expanded',open?'true':'false');
}
function closeNavMenu(){
  var btn=document.getElementById('nav-menu-btn'),dd=document.getElementById('nav-dropdown');
  if(!dd)return;
  dd.classList.remove('open');
  if(btn){btn.classList.remove('open');btn.setAttribute('aria-expanded','false');}
}
document.addEventListener('click',function(e){
  var btn=document.getElementById('nav-menu-btn'),dd=document.getElementById('nav-dropdown');
  if(!dd||!dd.classList.contains('open')||!btn)return;
  if(!btn.contains(e.target)&&!dd.contains(e.target))closeNavMenu();
});
</script>`;

function buildSiteNav(prefix, active) {
  const p = prefix || '';
  const links = [
    ['katalog', 'Katalog', p + 'index.html'],
    ['artis', 'Artis', p + 'artis/index.html'],
    ['resources', 'Resources', p + 'resources.html'],
    ['cerita', 'Cerita', p + 'stories.html'],
    ['hubungi', 'Hubungi', p + 'contact.html'],
    ['latihan', 'Latihan', p + 'latihan.html'],
  ];
  const items = links.map(([key, label, href]) =>
    `<a class="nd-item${active === key ? ' on' : ''}" href="${href}">${label}</a>`
  ).join('\n    ');
  return `<nav>
  <a class="nav-logo" href="${p}index.html">
    <div class="nljp">夢Lyrics</div>
    <div class="nlen">YumeSubs</div>
  </a>
  <div class="nav-links">
    <button id="theme-toggle" onclick="toggleTheme()" title="Toggle Night/Light Mode" aria-label="Toggle theme">
      <svg class="icon-sun" viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
      <svg class="icon-moon" viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
    </button>
    <button id="nav-menu-btn" onclick="toggleNavMenu()" aria-label="Menu" aria-expanded="false">
      <span></span><span></span><span></span>
    </button>
  </div>
  <div id="nav-dropdown">
    ${items}
  </div>
</nav>`;
}

function buildPage(item) {
  const title   = item.title    || 'Resource';
  const cat     = item.category || 'Resource';
  const desc    = item.desc     || '';
  const link    = item.link     || '#';
  const thumb   = item.thumb    || '';
  const tags    = Array.isArray(item.tags) ? item.tags.filter(Boolean) : [];
  const pageUrl = `${BASE_URL}/resources/${slug(title)}.html`;

  const thumbTag = thumb
    ? `<img style="width:100%;max-height:420px;object-fit:cover;border:1px solid rgba(10,8,18,.1);margin-bottom:2.5rem;display:block;filter:sepia(.1) contrast(1.02)" src="${esc(thumb)}" alt="${esc(title)}" onerror="this.style.display='none'">`
    : '';

  const tagsHTML = tags.length
    ? `<div style="display:flex;flex-wrap:wrap;gap:.4rem;margin-bottom:1.2rem">${tags.map(t =>
        `<span style="font-size:.52rem;letter-spacing:.12em;text-transform:uppercase;padding:.2rem .6rem;border:1px solid rgba(10,8,18,.12);color:var(--ash)">${esc(t)}</span>`
      ).join('')}</div>`
    : '';

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: title,
    description: desc || `${title} — rekomendasi dari YumeSubs`,
    url: pageUrl,
    keywords: [cat, ...tags].join(', '),
    isPartOf: { '@type': 'WebSite', name: 'YumeSubs', url: BASE_URL },
    breadcrumb: {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Resources', item: `${BASE_URL}/resources.html` },
        { '@type': 'ListItem', position: 2, name: cat, item: `${BASE_URL}/resources.html` },
        { '@type': 'ListItem', position: 3, name: title, item: pageUrl },
      ],
    },
  };
  if (thumb) structuredData.image = thumb;

  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<script>(function(){if(localStorage.getItem('ym_theme')==='dark')document.documentElement.setAttribute('data-theme','dark');})()</script>
<title>${esc(title)} — YumeSubs Resources</title>
<link rel="icon" type="image/jpeg" href="/anime_icon.png">
<meta name="description" content="${esc(desc || title + ' — rekomendasi dari YumeSubs')}">
${tags.length ? `<meta name="keywords" content="${esc([cat, ...tags].join(', '))}">` : ''}
<meta property="og:title" content="${esc(title)} — YumeSubs">
<meta property="og:description" content="${esc(desc || title)}">
${thumb ? `<meta property="og:image" content="${esc(thumb)}">` : ''}
<meta property="og:url" content="${esc(pageUrl)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="YumeSubs">
<link rel="canonical" href="${esc(pageUrl)}">
<script type="application/ld+json">${JSON.stringify(structuredData, null, 2)}</script>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400&family=Syne:wght@400;600;700;800&family=Noto+Serif+JP:wght@300;400;600&display=swap" rel="stylesheet">
<style>
:root{
  --ink:#0a0812;--paper:#f5f0ea;--cream:#ede7dc;--smoke:#c8bfb0;--ash:#8c8278;
  --gold:#c9a96e;--gold2:#e8c98a;--rose:#c4637a;
  --serif:'Cormorant Garamond',Georgia,serif;
  --sans:'Syne',sans-serif;
  --jp:'Noto Serif JP',serif;
  --border:rgba(10,8,18,.1);--text:var(--ink);--muted:var(--ash);
}
*{margin:0;padding:0;box-sizing:border-box}
html{scroll-behavior:smooth;background:var(--ink)}
body{background:var(--paper);color:var(--ink);font-family:var(--sans);min-height:100dvh;overflow-x:hidden;position:relative;-webkit-touch-callout:none}
body::before{content:'';position:fixed;inset:0;z-index:0;pointer-events:none;background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 512 512' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.04'/%3E%3C/svg%3E");opacity:.45}
input,textarea{-webkit-user-select:text;-moz-user-select:text;user-select:text}
@media(pointer:coarse){body{-webkit-user-select:none;-moz-user-select:none;user-select:none}}
.wrap{position:relative;z-index:1}
[data-theme="dark"]{--ink:#e8e2d9;--paper:#0f0d0b;--cream:#1a1714;--smoke:#4a4540;--ash:#7a7068;--border:rgba(232,226,217,.1);--text:var(--ink);--muted:var(--ash)}
[data-theme="dark"] body{background:var(--paper);color:var(--ink)}
[data-theme="dark"] body::before{opacity:.18}
[data-theme="dark"] .res-sidebar{background:var(--paper)}
[data-theme="dark"] footer{background:#070604}

${SITE_NAV_CSS}

.res-hero{
  position:relative;overflow:hidden;
  padding:5rem 3.5rem 4rem;
  border-bottom:1px solid rgba(10,8,18,.08);
  display:grid;grid-template-columns:1fr auto;gap:3rem;align-items:center;
}
.res-hero::before{
  content:'';position:absolute;top:0;right:0;bottom:0;width:55%;
  background:radial-gradient(ellipse at 70% 50%,rgba(201,169,110,.09) 0%,transparent 70%);
  pointer-events:none;
}
.res-eyebrow{
  font-size:.58rem;font-weight:700;letter-spacing:.3em;text-transform:uppercase;
  color:var(--rose);display:flex;align-items:center;gap:.6rem;margin-bottom:1.2rem;
}
.res-eyebrow::before{content:'';width:2rem;height:1px;background:var(--rose);display:block}
.res-title{
  font-family:var(--serif);font-size:clamp(2rem,5vw,3.2rem);font-weight:300;
  line-height:1.15;color:var(--ink);margin-bottom:1rem;
}
.hero-kanji{
  font-family:var(--jp);font-size:10rem;font-weight:600;
  color:rgba(10,8,18,.03);line-height:1;pointer-events:none;user-select:none;
  position:absolute;right:3rem;top:50%;transform:translateY(-50%);z-index:0;
}
.content-grid{display:grid;grid-template-columns:200px 1fr;gap:0;min-height:50vh}
.res-sidebar{
  padding:3.5rem 2rem 3.5rem 3.5rem;
  border-right:1px solid rgba(10,8,18,.08);
  position:sticky;top:64px;height:calc(100vh - 64px);
  overflow-y:auto;display:flex;flex-direction:column;gap:2.5rem;
}
.sidebar-label{font-size:.52rem;font-weight:700;letter-spacing:.28em;text-transform:uppercase;color:var(--smoke);margin-bottom:1rem;display:block}
.back-link{
  display:flex;align-items:center;gap:.5rem;
  font-size:.62rem;font-weight:700;letter-spacing:.15em;text-transform:uppercase;
  color:var(--ash);text-decoration:none;transition:color .2s;
  border:1px solid rgba(10,8,18,.15);padding:.6rem .9rem;
}
.back-link:hover{border-color:var(--ink);color:var(--ink)}
.sidebar-tags{display:flex;flex-direction:column;gap:.45rem}
.sidebar-divider{height:1px;background:rgba(10,8,18,.07)}
.res-main{padding:3.5rem 4rem 6rem}
.res-desc{font-family:var(--serif);font-size:1.1rem;color:var(--ink);line-height:1.95;font-weight:400;max-width:62ch;white-space:pre-line;margin-bottom:2.5rem}
.res-cta{
  display:inline-flex;align-items:center;gap:.6rem;
  background:var(--ink);border:none;
  font-family:var(--sans);font-size:.65rem;font-weight:700;letter-spacing:.2em;text-transform:uppercase;
  color:var(--paper);padding:.85rem 1.8rem;text-decoration:none;transition:all .2s;
}
.res-cta:hover{background:var(--gold);color:var(--ink)}
.res-cta svg{width:14px;height:14px;flex-shrink:0;stroke:currentColor;fill:none;stroke-width:2}
.section-divider{display:flex;align-items:center;gap:2rem;padding:0 3.5rem;margin:0}
.divider-line{flex:1;height:1px;background:rgba(10,8,18,.1)}
.divider-ornament{font-family:var(--serif);font-size:.85rem;font-weight:300;font-style:italic;color:var(--ash);white-space:nowrap;letter-spacing:.1em}

footer{
  background:var(--ink);color:var(--ash);
  padding:3.5rem;display:flex;align-items:flex-start;
  justify-content:space-between;gap:3rem;
}
.footer-brand{display:flex;flex-direction:column;gap:.4rem}
.footer-brand-jp{font-family:var(--jp);font-size:1.4rem;font-weight:300;color:var(--paper);letter-spacing:.08em}
.footer-brand-tagline{font-size:.58rem;font-weight:600;letter-spacing:.22em;text-transform:uppercase;color:rgba(200,191,176,.4)}
.footer-copy{font-size:.6rem;letter-spacing:.1em;color:rgba(200,191,176,.3);margin-top:1.5rem}
.footer-links{display:flex;gap:2.5rem}
.footer-col{display:flex;flex-direction:column;gap:.75rem}
.footer-col-label{font-size:.5rem;font-weight:700;letter-spacing:.3em;text-transform:uppercase;color:rgba(200,191,176,.35);margin-bottom:.25rem}
.footer-link{font-size:.72rem;color:rgba(200,191,176,.55);text-decoration:none;transition:color .2s;letter-spacing:.04em}
.footer-link:hover{color:var(--gold)}

::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:rgba(10,8,18,.15)}

@media(max-width:900px){
  nav{padding:1.2rem 1.5rem}
  .res-hero{padding:3.5rem 1.5rem 3rem;grid-template-columns:1fr}
  .hero-kanji{display:none}
  .content-grid{grid-template-columns:1fr}
  .res-sidebar{position:static;height:auto;padding:2rem 1.5rem;border-right:none;border-bottom:1px solid rgba(10,8,18,.08);flex-direction:row;flex-wrap:wrap;gap:1.2rem}
  .res-main{padding:2.5rem 1.5rem 4rem}
  .res-desc{font-size:1rem}
  footer{flex-direction:column;padding:2.5rem 1.5rem;gap:2rem}
  .section-divider{padding:0 1.5rem}
}
@media(max-width:600px){
  .res-hero{padding:3rem 1.2rem 2.5rem}
  .res-main{padding:2rem 1.2rem 4rem}
  footer{padding:2rem 1.2rem}
}
</style>
</head>
<body>
<div class="wrap">
${buildSiteNav('../', 'resources')}

<section class="res-hero">
  <div>
    <div class="res-eyebrow">Resources · ${esc(cat)}</div>
    <h1 class="res-title">${esc(title)}</h1>
    ${catPillHTML(cat)}
  </div>
  <div class="hero-kanji">資</div>
</section>

<div class="section-divider">
  <div class="divider-line"></div>
  <div class="divider-ornament">— detail rekomendasi —</div>
  <div class="divider-line"></div>
</div>

<div class="content-grid">
  <aside class="res-sidebar">
    <div>
      <span class="sidebar-label">Navigasi</span>
      <a class="back-link" href="/resources.html">← Semua Resources</a>
    </div>
    ${tags.length ? `<div>
      <span class="sidebar-label">Tag</span>
      <div class="sidebar-tags">${tags.map(t =>
        `<span style="font-size:.58rem;letter-spacing:.12em;text-transform:uppercase;padding:.25rem .65rem;border:1px solid rgba(10,8,18,.12);color:var(--ash)">${esc(t)}</span>`
      ).join('')}</div>
    </div>` : ''}
    <div class="sidebar-divider"></div>
    <div>
      <span class="sidebar-label">Tautan</span>
      <a class="back-link" href="${esc(link)}" target="_blank" rel="noopener" style="font-size:.58rem">↗ Buka ${esc(cat)}</a>
    </div>
  </aside>

  <main class="res-main">
    ${thumbTag}
    ${tagsHTML}
    ${desc ? `<div class="res-desc">${esc(desc)}</div>` : ''}
    <a class="res-cta" href="${esc(link)}" target="_blank" rel="noopener">
      <svg viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
      Buka ${esc(cat)}
    </a>
  </main>
</div>

<footer>
  <div class="footer-brand">
    <div class="footer-brand-jp">夢字幕</div>
    <div class="footer-brand-tagline">Resources · Lirik · Terjemahan</div>
    <div class="footer-copy">© 2025 YumeSubs — yumelyrics.my.id</div>
  </div>
  <div class="footer-links">
    <div class="footer-col">
      <span class="footer-col-label">Jelajahi</span>
      <a class="footer-link" href="/index.html">Katalog Lengkap</a>
      <a class="footer-link" href="/resources.html">Semua Resources</a>
    </div>
    <div class="footer-col">
      <span class="footer-col-label">Lainnya</span>
      <a class="footer-link" href="/stories.html">Cerita</a>
      <a class="footer-link" href="/contact.html">Hubungi Kami</a>
    </div>
  </div>
</footer>
</div>

<script>
(function(){
  const MARK = '\\n\\n© YumeSubs — yumelyrics.my.id';
  const LIM = 10;
  function isInput(el){var t=el.tagName;return t==='INPUT'||t==='TEXTAREA';}
  document.addEventListener('contextmenu',function(e){e.preventDefault();});
  document.addEventListener('keydown',function(e){
    if((e.ctrlKey||e.metaKey)&&['a','c','u','s'].includes(e.key.toLowerCase()))e.preventDefault();
  });
  document.addEventListener('copy',function(e){
    var sel=window.getSelection().toString();
    if(sel.length>LIM){e.clipboardData.setData('text/plain',sel.substring(0,LIM)+MARK);e.preventDefault();}
  });
  document.addEventListener('selectstart',function(e){
    if(isInput(e.target))return;
    var el=e.target;
    while(el&&el!==document.body){if(el.id==='ll'){e.preventDefault();return;}el=el.parentElement;}
  });
  var tt=null;
  document.addEventListener('touchstart',function(e){
    if(isInput(e.target))return;
    tt=setTimeout(function(){if(window.getSelection)window.getSelection().removeAllRanges();},300);
  },{passive:true});
  document.addEventListener('touchend',function(){if(tt){clearTimeout(tt);tt=null;}},{passive:true});
  document.addEventListener('touchcancel',function(){if(tt){clearTimeout(tt);tt=null;}},{passive:true});
  document.addEventListener('selectionchange',function(){
    var sel=window.getSelection();
    if(!sel||sel.isCollapsed)return;
    var node=sel.anchorNode;if(!node)return;
    var el=node.nodeType===3?node.parentElement:node;
    if(isInput(el))return;
    if(sel.toString().length>LIM)sel.removeAllRanges();
  });
})();
</script>
${SITE_NAV_SCRIPT}
</body>
</html>`;
}

function updateSitemap(newUrls) {
  let existing = '';
  if (fs.existsSync(SITE_XML)) {
    existing = fs.readFileSync(SITE_XML, 'utf8');
  }
  existing = existing.replace(/<url>\s*<loc>[^<]*\/resources\/[^<]*<\/loc>[\s\S]*?<\/url>/g, '');
  const entries = newUrls.map(u =>
    `  <url><loc>${u}</loc><changefreq>monthly</changefreq><priority>0.6</priority></url>`
  ).join('\n');
  if (existing.includes('</urlset>')) {
    existing = existing.replace('</urlset>', `${entries}\n</urlset>`);
  } else {
    existing = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>`;
  }
  fs.writeFileSync(SITE_XML, existing.trim() + '\n', 'utf8');
  console.log(`✅ Sitemap diupdate dengan ${newUrls.length} URL resource.`);
}

async function main() {
  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    console.log('📁 Folder dibuat: resources/');
  }

  let snap;
  try {
    snap = await db.collection('resources').orderBy('order', 'asc').get();
  } catch (e) {
    snap = await db.collection('resources').get();
  }

  if (snap.empty) {
    console.log('⚠️  Tidak ada resource di Firestore.');
    return;
  }

  const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  console.log(`📦 Ditemukan ${items.length} resource. Mulai generate...`);

  const generatedUrls = [];
  const validFilenames = new Set();

  for (const item of items) {
    if (!item.title || !item.link) {
      console.warn(`⚠️  Skip "${item.id}" — title atau link kosong.`);
      continue;
    }
    const filename = slug(item.title) + '.html';
    const filepath = path.join(OUT_DIR, filename);
    fs.writeFileSync(filepath, buildPage(item), 'utf8');
    generatedUrls.push(`${BASE_URL}/resources/${filename}`);
    validFilenames.add(filename);
    const tagInfo = (item.tags && item.tags.length) ? ` [tags: ${item.tags.join(', ')}]` : '';
    console.log(`  ✔ resources/${filename}${tagInfo}`);
  }

  const existingFiles = fs.readdirSync(OUT_DIR).filter(f => f.endsWith('.html'));
  for (const file of existingFiles) {
    if (!validFilenames.has(file)) {
      fs.unlinkSync(path.join(OUT_DIR, file));
      console.log(`  🗑 Dihapus: resources/${file}`);
    }
  }

  updateSitemap(generatedUrls);
  console.log(`\n🎉 Selesai! ${generatedUrls.length} halaman di-generate ke folder resources/`);
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
