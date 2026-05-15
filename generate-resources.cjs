// generate-resources.cjs
// Dijalankan oleh GitHub Actions untuk generate halaman HTML per resource
// Output: folder resources/ di root repo

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore }        = require('firebase-admin/firestore');
const fs   = require('fs');
const path = require('path');

// ── Init Firebase Admin ──────────────────────────────────────────────────────
initializeApp({
  credential: cert({
    projectId:   'yumesubs7',
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey:  (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  }),
});

const db = getFirestore();

// ── Config ───────────────────────────────────────────────────────────────────
const BASE_URL  = 'https://yumelyrics.my.id';
const OUT_DIR   = path.join(__dirname, 'resources'); // folder output: /resources/
const SITE_XML  = path.join(__dirname, 'sitemap.xml');

// ── Helper ───────────────────────────────────────────────────────────────────
function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function slug(title) {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// ── HTML template per resource ───────────────────────────────────────────────
function buildPage(item) {
  const title   = item.title    || 'Resource';
  const cat     = item.category || 'Resource';
  const desc    = item.desc     || '';
  const link    = item.link     || '#';
  const thumb   = item.thumb    || '';
  const tags    = Array.isArray(item.tags) ? item.tags.filter(Boolean) : [];
  const pageUrl = `${BASE_URL}/resources/${slug(title)}.html`;

  const thumbTag = thumb
    ? `<img class="res-thumb" src="${esc(thumb)}" alt="${esc(title)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
       <div class="res-thumb-placeholder" style="display:none"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.5" width="48" height="48" opacity=".15"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></div>`
    : `<div class="res-thumb-placeholder"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.5" width="48" height="48" opacity=".15"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></div>`;

  const tagsHTML = tags.length
    ? `<div class="res-tags">${tags.map(t => `<span class="res-tag">${esc(t)}</span>`).join('')}</div>`
    : '';

  // JSON-LD structured data for Google
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "name": title,
    "description": desc || `${title} — rekomendasi dari YumeSubs`,
    "url": pageUrl,
    "keywords": [cat, ...tags].join(', '),
    "image": thumb || undefined,
    "isPartOf": {
      "@type": "WebSite",
      "name": "YumeSubs",
      "url": BASE_URL
    },
    "breadcrumb": {
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Resources", "item": `${BASE_URL}/resources.html` },
        { "@type": "ListItem", "position": 2, "name": cat, "item": `${BASE_URL}/resources.html` },
        { "@type": "ListItem", "position": 3, "name": title, "item": pageUrl }
      ]
    }
  };
  // Remove undefined keys (image if not set)
  if (!thumb) delete structuredData.image;

  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
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
<link href="https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@400;600;800&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;1,9..40,300&display=swap" rel="stylesheet">
<style>
:root{--bg:#06030f;--border:rgba(255,255,255,0.08);--accent:#ff6eb4;--accent2:#00e5ff;--accent3:#bf5fff;--text:#f0eaff;--muted:#7a6a9a;--jp:'Shippori Mincho',serif;--en:'DM Sans',sans-serif;--red:#ff4d6d;--glow-pink:rgba(255,110,180,.18);--glow-cyan:rgba(0,229,255,.15)}
*{margin:0;padding:0;box-sizing:border-box}
html,body{margin:0;padding:0}html{scroll-behavior:smooth;background:#06030f}
body{color:var(--text);font-family:var(--en);min-height:100dvh;overflow-x:hidden;position:relative;-webkit-touch-callout:none}
input,textarea{-webkit-user-select:text;-moz-user-select:text;user-select:text}
@media(pointer:coarse){body{-webkit-user-select:none;-moz-user-select:none;user-select:none}}
.wrap{position:relative;z-index:2}
nav{position:sticky;top:0;z-index:100;display:flex;align-items:center;justify-content:space-between;padding:0 2.5rem;height:60px;background:rgba(6,3,15,.85);backdrop-filter:blur(24px);border-bottom:1px solid rgba(255,110,180,.12);min-width:0;box-shadow:0 1px 24px rgba(255,110,180,.06)}
.nav-logo{display:flex;align-items:center;gap:.5rem;text-decoration:none;flex-shrink:0;min-width:0}
.nljp{font-family:var(--jp);font-size:1.2rem;font-weight:800;color:var(--accent);white-space:nowrap;line-height:1;text-shadow:0 0 12px rgba(255,110,180,.5)}
.nlen{font-size:.6rem;color:var(--muted);letter-spacing:.2em;text-transform:uppercase;white-space:nowrap;line-height:1}
.nav-links{display:flex;gap:.25rem;align-items:center;flex-shrink:0}
.nb{background:none;border:none;font-family:var(--en);font-size:.7rem;color:var(--muted);letter-spacing:.12em;text-transform:uppercase;padding:.45rem .9rem;cursor:pointer;border-radius:2rem;transition:all .2s;text-decoration:none;display:inline-flex;align-items:center;white-space:nowrap}
.nb:hover{color:var(--text);background:rgba(255,110,180,.08);text-shadow:0 0 8px rgba(255,110,180,.4)}
.main{padding:3.5rem 2.5rem 6rem;max-width:760px}
.crumb{font-size:.6rem;color:var(--muted);letter-spacing:.15em;text-transform:uppercase;margin-bottom:1.5rem;display:flex;align-items:center;gap:.5rem}
.crumb a{color:var(--accent2);text-decoration:none}
.crumb a:hover{text-decoration:underline;color:var(--accent)}
.cat-badge{display:inline-block;font-size:.55rem;color:var(--accent);border:1px solid rgba(255,110,180,.3);padding:.2rem .65rem;letter-spacing:.18em;text-transform:uppercase;margin-bottom:1rem;border-radius:2rem}
h1{font-family:var(--jp);font-size:clamp(1.6rem,4vw,2.6rem);font-weight:800;color:var(--text);line-height:1.25;margin-bottom:1rem}
.res-thumb{width:100%;max-height:380px;object-fit:cover;display:block;border:1px solid rgba(255,110,180,.2);filter:saturate(.75);margin-bottom:2rem;border-radius:2px;box-shadow:0 4px 24px rgba(255,110,180,.1)}
.res-thumb-placeholder{width:100%;height:200px;background:linear-gradient(135deg,#0d0620,#12052a);display:flex;align-items:center;justify-content:center;border:1px solid var(--border);margin-bottom:2rem;border-radius:2px}
.res-tags{display:flex;flex-wrap:wrap;gap:.45rem;margin-bottom:1.5rem}
.res-tag{font-size:.58rem;color:var(--accent2);border:1px solid rgba(0,229,255,.25);padding:.25rem .7rem;border-radius:2rem;letter-spacing:.12em;text-transform:uppercase}
.desc{font-size:.88rem;color:var(--text);line-height:1.9;font-weight:300;margin-bottom:2rem;white-space:pre-line}
.cta{display:inline-flex;align-items:center;gap:.6rem;background:linear-gradient(135deg,rgba(255,110,180,.1),rgba(191,95,255,.08));border:1px solid rgba(255,110,180,.3);color:var(--text);font-family:var(--en);font-size:.72rem;letter-spacing:.14em;text-transform:uppercase;padding:.65rem 1.4rem;text-decoration:none;border-radius:2rem;transition:border-color .3s,box-shadow .3s}
.cta:hover{border-color:rgba(255,110,180,.6);box-shadow:0 4px 24px rgba(255,110,180,.2)}
.cta svg{width:14px;height:14px;flex-shrink:0;color:var(--accent)}
.back-link{display:inline-flex;align-items:center;gap:.4rem;margin-top:2.5rem;font-size:.65rem;color:var(--muted);letter-spacing:.12em;text-transform:uppercase;text-decoration:none;transition:color .2s}
.back-link:hover{color:var(--accent)}
::-webkit-scrollbar{width:3px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:rgba(255,110,180,.2);border-radius:4px}
@media(max-width:600px){nav{padding:0 1rem;gap:.5rem}.main{padding:2rem 1.2rem 5rem}.nlen{display:none}.nb{padding:.4rem .6rem;font-size:.62rem;letter-spacing:.08em}}
@media(max-width:380px){nav{padding:0 .75rem}.nb{padding:.35rem .5rem;font-size:.58rem}}
</style>
</head>
<body>
<div id="bgwrap"></div>
<style>
#bgwrap{position:fixed;top:0;left:0;width:100%;height:100%;z-index:0;pointer-events:none;background:radial-gradient(ellipse at 20% 50%,rgba(191,95,255,.08) 0%,transparent 60%),radial-gradient(ellipse at 80% 20%,rgba(255,110,180,.07) 0%,transparent 55%),radial-gradient(ellipse at 60% 80%,rgba(0,229,255,.05) 0%,transparent 50%),#06030f}
@media(min-width:768px){#bgwrap{background:url('https://images7.alphacoders.com/131/thumb-1920-1316304.jpeg') center/cover no-repeat;filter:brightness(.15) saturate(.5) hue-rotate(200deg)}}
</style>
<div class="wrap">
<nav>
  <a class="nav-logo" href="/index.html">
    <div class="nljp">夢字幕</div>
    <div class="nlen">YumeSubs</div>
  </a>
  <div class="nav-links">
    <a class="nb" href="/index.html">Katalog</a>
    <a class="nb" href="/resources.html">Resources</a>
    <a class="nb" href="/stories.html">Cerita</a>
    <a class="nb" href="/contact.html">Hubungi</a>
  </div>
</nav>

<div class="main">
  <div class="crumb"><a href="/resources.html">Resources</a> <span>›</span> <span>${esc(cat)}</span></div>
  <div class="cat-badge">${esc(cat)}</div>
  <h1>${esc(title)}</h1>

  ${thumbTag}

  ${tagsHTML}

  ${desc ? `<div class="desc">${esc(desc)}</div>` : ''}

  <a class="cta" href="${esc(link)}" target="_blank" rel="noopener">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/>
      <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
    </svg>
    Buka ${esc(cat)}
  </a>

  <br>
  <a class="back-link" href="/resources.html">← Kembali ke Resources</a>
</div>
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
</body>
</html>`;
}

// ── Update sitemap.xml ────────────────────────────────────────────────────────
function updateSitemap(newUrls) {
  let existing = '';
  if (fs.existsSync(SITE_XML)) {
    existing = fs.readFileSync(SITE_XML, 'utf8');
  }

  // Hapus semua entry /resources/ yang lama
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

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  // Buat folder resources/ kalau belum ada
  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    console.log(`📁 Folder dibuat: resources/`);
  }

  // Ambil semua resources dari Firestore
  const snap = await db.collection('resources').orderBy('order', 'asc').get();
  if (snap.empty) {
    console.log('⚠️  Tidak ada resource di Firestore. Tidak ada yang digenerate.');
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
    const html = buildPage(item);
    fs.writeFileSync(filepath, html, 'utf8');
    generatedUrls.push(`${BASE_URL}/resources/${filename}`);
    validFilenames.add(filename);
    const tagInfo = (item.tags && item.tags.length) ? ` [tags: ${item.tags.join(', ')}]` : '';
    console.log(`  ✔ resources/${filename}${tagInfo}`);
  }

  // Hapus file yang ga ada di Firestore
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
