// generate-stories.cjs
// Dijalankan oleh GitHub Actions untuk generate halaman HTML per cerita
// Output: folder stories/ di root repo

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
const BASE_URL = 'https://yumelyrics.github.io';
const OUT_DIR  = path.join(__dirname, 'stories');
const SITE_XML = path.join(__dirname, 'sitemap.xml');

// ── Helper ───────────────────────────────────────────────────────────────────
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

function stripMarkdown(raw) {
  return raw
    .replace(/!\[([^\]]*)\]\([^\)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/^>\s?/gm, '')
    .replace(/<[^>]+>/g, '');
}

function excerpt(body, len = 160) {
  return stripMarkdown(body || '').replace(/\s+/g, ' ').trim().slice(0, len);
}

function renderInline(text) {
  return text
    .replace(/!\[([^\]]*)\]\((https?:\/\/[^\)]+)\)/g,
      (_, alt, url) => `<img src="${esc(url)}" alt="${esc(alt)}" loading="lazy">`)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g,
      (_, t, url) => `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(t)}</a>`)
    .replace(/\*\*(.+?)\*\*/g, (_, t) => `<strong>${esc(t)}</strong>`)
    .replace(/\*(.+?)\*/g,     (_, t) => `<em>${esc(t)}</em>`)
    .replace(/(^|[\s])((https?:\/\/[^\s<]+))/g,
      (_, pre, url) => `${pre}<a href="${esc(url)}" target="_blank" rel="noopener">${esc(url)}</a>`);
}

function renderBody(raw) {
  if (!raw) return '';
  return raw
    .split(/\n\n+/)
    .map(para => {
      const trimmed = para.trim();
      if (!trimmed) return '';
      if (trimmed.startsWith('> '))
        return `<blockquote>${renderInline(trimmed.slice(2))}</blockquote>`;
      return `<p>${renderInline(trimmed)}</p>`;
    })
    .join('');
}

const TAG_CLASS = {
  curhat: { color: '#a78bfa', border: 'rgba(167,139,250,.3)', bg: 'rgba(167,139,250,.08)' },
  review: { color: '#34d399', border: 'rgba(52,211,153,.3)',  bg: 'rgba(52,211,153,.08)'  },
  opini:  { color: '#60a5fa', border: 'rgba(96,165,250,.3)',  bg: 'rgba(96,165,250,.08)'  },
  random: { color: '#f9a8d4', border: 'rgba(249,168,212,.3)', bg: 'rgba(249,168,212,.08)' },
};
const TAG_LABEL = { curhat: '💜 Curhat', review: '🎵 Review', opini: '💭 Opini', random: '✨ Random' };

function tagPillHTML(tag) {
  const c = TAG_CLASS[tag];
  const lbl = TAG_LABEL[tag] || tag;
  if (!c) return `<span style="font-size:.54rem;letter-spacing:.12em;text-transform:uppercase;padding:.18rem .55rem;border-radius:2rem;border:1px solid var(--border);color:var(--muted)">${esc(lbl)}</span>`;
  return `<span style="font-size:.54rem;letter-spacing:.12em;text-transform:uppercase;padding:.18rem .55rem;border-radius:2rem;border:1px solid ${c.border};color:${c.color};background:${c.bg}">${esc(lbl)}</span>`;
}

// ── HTML template per cerita ─────────────────────────────────────────────────
function buildPage(story) {
  const title   = story.title || 'Cerita';
  const body    = story.body  || '';
  const tags    = Array.isArray(story.tags) ? story.tags.filter(Boolean) : [];
  const date    = story.date  || '';
  const img     = story.img   || '';
  const storySlug = slug(title);
  const pageUrl = `${BASE_URL}/stories/${storySlug}.html`;
  const desc    = excerpt(body, 155);

  const words   = stripMarkdown(body).split(/\s+/).length;
  const readTime = `${Math.max(1, Math.round(words / 200))} menit baca`;

  const tagsHTML = tags.length
    ? `<div style="display:flex;gap:.4rem;flex-wrap:wrap;margin-bottom:1.2rem">${tags.map(tagPillHTML).join('')}</div>`
    : '';

  const imgTag = img
    ? `<img style="width:100%;max-height:420px;object-fit:cover;border:1px solid var(--border);margin-bottom:2rem;display:block;filter:saturate(.8) brightness(.85)" src="${esc(img)}" alt="${esc(title)}">`
    : '';

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": title,
    "description": desc,
    "url": pageUrl,
    "datePublished": date,
    "inLanguage": "id",
    "author": { "@type": "Organization", "name": "YumeSubs" },
    "publisher": { "@type": "Organization", "name": "YumeSubs", "url": BASE_URL },
    "isPartOf": { "@type": "WebSite", "name": "YumeSubs", "url": BASE_URL },
    "breadcrumb": {
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Cerita", "item": `${BASE_URL}/stories.html` },
        { "@type": "ListItem", "position": 2, "name": title,   "item": pageUrl }
      ]
    }
  };
  if (img) structuredData.image = img;

  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>${esc(title)} — YumeSubs</title>
<link rel="icon" type="image/jpeg" href="/anime_icon.png">
<meta name="description" content="${esc(desc)}">
${tags.length ? `<meta name="keywords" content="${esc(tags.join(', ') + ', cerita, YumeSubs')}">` : ''}
<meta property="og:title" content="${esc(title)} — YumeSubs">
<meta property="og:description" content="${esc(desc)}">
${img ? `<meta property="og:image" content="${esc(img)}">` : ''}
<meta property="og:url" content="${esc(pageUrl)}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="YumeSubs">
<link rel="canonical" href="${esc(pageUrl)}">
<script type="application/ld+json">${JSON.stringify(structuredData, null, 2)}</script>
<link href="https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@400;600;800&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;1,9..40,300&display=swap" rel="stylesheet">
<style>
:root{--bg:#050d1a;--border:rgba(255,255,255,0.07);--accent:#c9a96e;--accent2:#4f7ec4;--text:#dde6f5;--muted:#5a6a82;--jp:'Shippori Mincho',serif;--en:'DM Sans',sans-serif}
*{margin:0;padding:0;box-sizing:border-box}
html,body{margin:0;padding:0}html{scroll-behavior:smooth;background:#050d1a}
body{color:var(--text);font-family:var(--en);min-height:100dvh;overflow-x:hidden;position:relative}
#bgwrap{position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:0;pointer-events:none;background:#07101f}
@media(min-width:768px){#bgwrap{background:url('https://images7.alphacoders.com/131/thumb-1920-1316304.jpeg') center/cover no-repeat fixed;filter:brightness(.32) saturate(.75)}}
.wrap{position:relative;z-index:2}
nav{position:sticky;top:0;z-index:100;display:flex;align-items:center;justify-content:space-between;padding:0 2.5rem;height:60px;background:rgba(5,13,26,.9);backdrop-filter:blur(24px);border-bottom:1px solid var(--border);min-width:0}
.nav-logo{display:flex;align-items:center;gap:.5rem;text-decoration:none;flex-shrink:0}
.nljp{font-family:var(--jp);font-size:1.2rem;font-weight:800;color:var(--accent);white-space:nowrap;line-height:1}
.nlen{font-size:.6rem;color:var(--muted);letter-spacing:.2em;text-transform:uppercase;white-space:nowrap;line-height:1}
.nav-links{display:flex;gap:.25rem;align-items:center;flex-shrink:0}
.nb{background:none;border:none;font-family:var(--en);font-size:.7rem;color:var(--muted);letter-spacing:.12em;text-transform:uppercase;padding:.45rem .9rem;cursor:pointer;border-radius:2rem;transition:all .2s;text-decoration:none;display:inline-flex;align-items:center;white-space:nowrap}
.nb:hover,.nb.on{color:var(--text);background:rgba(255,255,255,.06)}
.main{padding:3.5rem 2.5rem 6rem;max-width:720px;margin:0 auto}
.crumb{font-size:.6rem;color:var(--muted);letter-spacing:.15em;text-transform:uppercase;margin-bottom:1.5rem;display:flex;align-items:center;gap:.5rem}
.crumb a{color:var(--accent2);text-decoration:none}
.crumb a:hover{text-decoration:underline}
.art-title{font-family:var(--jp);font-size:clamp(1.6rem,4vw,2.5rem);font-weight:800;line-height:1.2;color:var(--text);margin-bottom:.6rem}
.art-meta{font-size:.68rem;color:var(--muted);margin-bottom:2rem;display:flex;gap:1rem;align-items:center;flex-wrap:wrap}
.art-body{font-size:.92rem;color:var(--text);line-height:1.9;font-weight:300}
.art-body p{margin-bottom:1.2rem}
.art-body strong{color:var(--accent);font-weight:600}
.art-body em{color:var(--text);font-style:italic;opacity:.85}
.art-body a{color:var(--accent2);text-decoration:none;border-bottom:1px solid rgba(79,126,196,.3);transition:border-color .2s}
.art-body a:hover{border-color:var(--accent2)}
.art-body img{max-width:100%;border:1px solid var(--border);margin:1rem 0;display:block}
.art-body blockquote{border-left:3px solid var(--accent);padding:.5rem 0 .5rem 1.2rem;color:var(--muted);font-style:italic;margin:1.2rem 0}
.back-link{display:inline-flex;align-items:center;gap:.4rem;margin-top:2.5rem;font-size:.65rem;color:var(--muted);letter-spacing:.12em;text-transform:uppercase;text-decoration:none;transition:color .2s;border:1px solid var(--border);padding:.5rem 1rem}
.back-link:hover{color:var(--accent);border-color:rgba(201,169,110,.4)}
::-webkit-scrollbar{width:3px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:var(--border)}
@media(max-width:600px){nav{padding:0 1rem}.nlen{display:none}.main{padding:2rem 1.2rem 5rem}}
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
    <a class="nb on" href="/stories.html">Cerita</a>
    <a class="nb" href="/contact.html">Hubungi</a>
  </div>
</nav>

<div class="main">
  <div class="crumb"><a href="/stories.html">Cerita</a> <span>›</span> <span>${esc(title)}</span></div>

  ${tagsHTML}

  <h1 class="art-title">${esc(title)}</h1>
  <div class="art-meta">
    <span>${esc(date)}</span>
    ${readTime ? `<span>${esc(readTime)}</span>` : ''}
  </div>

  ${imgTag}

  <div class="art-body">${renderBody(body)}</div>

  <a class="back-link" href="/stories.html">← Kembali ke Cerita</a>
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

  // Hapus semua entry /stories/ yang lama
  existing = existing.replace(/<url>\s*<loc>[^<]*\/stories\/[^<]*<\/loc>[\s\S]*?<\/url>/g, '');

  const entries = newUrls.map(u =>
    `  <url><loc>${u}</loc><changefreq>monthly</changefreq><priority>0.7</priority></url>`
  ).join('\n');

  if (existing.includes('</urlset>')) {
    existing = existing.replace('</urlset>', `${entries}\n</urlset>`);
  } else {
    existing = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>`;
  }

  fs.writeFileSync(SITE_XML, existing.trim() + '\n', 'utf8');
  console.log(`✅ Sitemap diupdate dengan ${newUrls.length} URL cerita.`);
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    console.log(`📁 Folder dibuat: stories/`);
  }

  let snap;
  try {
    snap = await db.collection('stories').orderBy('ts', 'desc').get();
  } catch (e) {
    // fallback tanpa orderBy kalau index belum ada
    snap = await db.collection('stories').get();
  }

  if (snap.empty) {
    console.log('⚠️  Tidak ada cerita di Firestore.');
    return;
  }

  const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  console.log(`📦 Ditemukan ${items.length} cerita. Mulai generate...`);

  const generatedUrls  = [];
  const validFilenames = new Set();

  for (const item of items) {
    if (!item.title) {
      console.warn(`⚠️  Skip "${item.id}" — title kosong.`);
      continue;
    }

    const filename = slug(item.title) + '.html';
    const filepath = path.join(OUT_DIR, filename);
    fs.writeFileSync(filepath, buildPage(item), 'utf8');
    generatedUrls.push(`${BASE_URL}/stories/${filename}`);
    validFilenames.add(filename);
    console.log(`  ✔ stories/${filename}`);
  }

  // Hapus file yang udah ga ada di Firestore
  const existingFiles = fs.readdirSync(OUT_DIR).filter(f => f.endsWith('.html'));
  for (const file of existingFiles) {
    if (!validFilenames.has(file)) {
      fs.unlinkSync(path.join(OUT_DIR, file));
      console.log(`  🗑 Dihapus: stories/${file}`);
    }
  }

  updateSitemap(generatedUrls);
  console.log(`\n🎉 Selesai! ${generatedUrls.length} halaman di-generate ke folder stories/`);
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
