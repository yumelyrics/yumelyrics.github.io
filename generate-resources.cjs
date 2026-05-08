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
const BASE_URL  = 'https://yumelyrics.github.io';
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
  const pageUrl = `${BASE_URL}/resources/${slug(title)}.html`;

  const thumbTag = thumb
    ? `<img class="res-thumb" src="${esc(thumb)}" alt="${esc(title)}" onerror="this.style.display='none'">`
    : `<div class="res-thumb-placeholder"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.5" width="48" height="48" opacity=".15"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></div>`;

  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>${esc(title)} — YumeSubs Resources</title>
<link rel="icon" type="image/jpeg" href="/anime_icon.png">
<meta name="description" content="${esc(desc || title + ' — rekomendasi dari YumeSubs')}">
<meta property="og:title" content="${esc(title)} — YumeSubs">
<meta property="og:description" content="${esc(desc)}">
${thumb ? `<meta property="og:image" content="${esc(thumb)}">` : ''}
<meta property="og:url" content="${esc(pageUrl)}">
<meta property="og:type" content="website">
<link rel="canonical" href="${esc(pageUrl)}">
<link href="https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@400;600;800&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;1,9..40,300&display=swap" rel="stylesheet">
<style>
:root{--bg:#050d1a;--border:rgba(255,255,255,0.07);--accent:#c9a96e;--accent2:#4f7ec4;--text:#dde6f5;--muted:#5a6a82;--jp:'Shippori Mincho',serif;--en:'DM Sans',sans-serif}
*{margin:0;padding:0;box-sizing:border-box}
html,body{margin:0;padding:0}html{scroll-behavior:smooth;background:#050d1a}
body{color:var(--text);font-family:var(--en);min-height:100dvh;overflow-x:hidden;position:relative}
#bgwrap{position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:0;pointer-events:none;background:#07101f}
@media(min-width:768px){#bgwrap{background:url('https://images7.alphacoders.com/131/thumb-1920-1316304.jpeg') center/cover no-repeat fixed;filter:brightness(.32) saturate(.75)}}
.wrap{position:relative;z-index:2}
nav{position:sticky;top:0;z-index:100;display:flex;align-items:center;justify-content:space-between;padding:0 2.5rem;height:60px;background:rgba(5,13,26,.9);backdrop-filter:blur(24px);border-bottom:1px solid var(--border)}
.nav-logo{display:flex;align-items:center;gap:.5rem;text-decoration:none;flex-shrink:0}
.nljp{font-family:var(--jp);font-size:1.2rem;font-weight:800;color:var(--accent);line-height:1}
.nlen{font-size:.6rem;color:var(--muted);letter-spacing:.2em;text-transform:uppercase;line-height:1}
.nav-links{display:flex;gap:.25rem;align-items:center}
.nb{background:none;border:none;font-family:var(--en);font-size:.7rem;color:var(--muted);letter-spacing:.12em;text-transform:uppercase;padding:.45rem .9rem;cursor:pointer;border-radius:2rem;transition:all .2s;text-decoration:none;display:inline-flex;align-items:center;white-space:nowrap}
.nb:hover{color:var(--text);background:rgba(255,255,255,.06)}
.main{padding:3.5rem 2.5rem 6rem;max-width:760px;margin:0 auto}
.crumb{font-size:.6rem;color:var(--muted);letter-spacing:.15em;text-transform:uppercase;margin-bottom:1.5rem;display:flex;align-items:center;gap:.5rem}
.crumb a{color:var(--accent2);text-decoration:none}
.crumb a:hover{text-decoration:underline}
.cat-badge{display:inline-block;font-size:.55rem;color:var(--accent);border:1px solid rgba(201,169,110,.35);padding:.2rem .65rem;letter-spacing:.18em;text-transform:uppercase;margin-bottom:1rem}
h1{font-family:var(--jp);font-size:clamp(1.6rem,4vw,2.6rem);font-weight:800;color:var(--text);line-height:1.25;margin-bottom:1rem}
.res-thumb{width:100%;max-height:380px;object-fit:cover;display:block;border:1px solid var(--border);filter:saturate(.85);margin-bottom:2rem}
.res-thumb-placeholder{width:100%;height:200px;background:linear-gradient(135deg,#0d1629,#152035);display:flex;align-items:center;justify-content:center;border:1px solid var(--border);margin-bottom:2rem}
.desc{font-size:.9rem;color:var(--text);line-height:1.85;font-weight:300;margin-bottom:2rem;white-space:pre-line}
.cta{display:inline-flex;align-items:center;gap:.5rem;background:var(--accent);color:#07060f;font-family:var(--en);font-size:.72rem;letter-spacing:.15em;text-transform:uppercase;padding:.85rem 2rem;text-decoration:none;font-weight:500;transition:opacity .2s}
.cta:hover{opacity:.85}
.cta svg{width:14px;height:14px;flex-shrink:0}
.back-link{display:inline-flex;align-items:center;gap:.4rem;margin-top:2.5rem;font-size:.65rem;color:var(--muted);letter-spacing:.12em;text-transform:uppercase;text-decoration:none;transition:color .2s}
.back-link:hover{color:var(--accent2)}
::-webkit-scrollbar{width:3px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:var(--border)}
@media(max-width:600px){nav{padding:0 1rem}.main{padding:2rem 1.2rem 5rem}.nlen{display:none}}
</style>
</head>
<body>
<div id="bgwrap"></div>
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
document.addEventListener('copy', function(e) {
  const sel = window.getSelection().toString();
  if (sel.length > 10) {
    e.clipboardData.setData('text/plain', sel + '\\n\\n© YumeSubs — yumelyrics.github.io');
    e.preventDefault();
  }
});
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
    console.log(`  ✔ resources/${filename}`);
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
