// generate-songs.js
// Jalankan via GitHub Actions — ambil data Firebase, generate HTML per lagu + sitemap.xml

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, orderBy } from 'firebase/firestore';
import fs from 'fs';
import path from 'path';

// ── Firebase config (API key dari GitHub Secret) ──
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: "yumesubs7.firebaseapp.com",
  projectId: "yumesubs7",
  storageBucket: "yumesubs7.firebasestorage.app",
  messagingSenderId: "1076202015626",
  appId: "1:1076202015626:web:ce89fb668eb6b2bd021673"
};

const BASE_URL = 'https://yumelyrics.github.io';

// ── Slug generator ──
function toSlug(titleRo, titleJp, docId) {
  if (titleRo) {
    return titleRo
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .substring(0, 60);
  }
  // Fallback ke Firebase doc ID kalau tidak ada romaji
  return docId;
}

// ── Generate HTML per lagu ──
function generateHTML(song, slug) {
  const titleDisplay = song.titleJp || '';
  const titleRo      = song.titleRo || '';
  const titleId      = song.titleId || '';
  const artist       = song.artist  || '';
  const lyrics       = song.lyrics  || [];

  // Buat teks lirik untuk meta description
  const firstLines = lyrics.slice(0, 3).map(l => l.id || l.ro || l.jp).filter(Boolean).join(' / ');
  const metaDesc   = `Lirik ${titleRo || titleDisplay} - ${artist} lengkap dengan romaji dan terjemahan bahasa Indonesia. ${firstLines}`.substring(0, 155);

  // Render baris lirik sebagai HTML statis (bisa dibaca Google)
  const lyricsHTML = lyrics.map(l => `
    <div class="line">
      <div class="ljp">${escHtml(l.jp || '')}</div>
      ${l.ro ? `<div class="lro">${escHtml(l.ro)}</div>` : ''}
      ${l.id ? `<div class="lid">${escHtml(l.id)}</div>` : ''}
    </div>`).join('\n    <hr class="lsep">\n');

  const ytEmbed = song.ytId
    ? `<iframe width="100%" style="aspect-ratio:16/9;border:1px solid rgba(255,255,255,.07);background:#000;display:block;margin-top:1rem"
        src="https://www.youtube.com/embed/${escHtml(song.ytId)}"
        frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowfullscreen title="MV ${escHtml(titleRo || titleDisplay)}"></iframe>` : '';

  const spotifyBtn = song.sp
    ? `<a href="${escHtml(song.sp)}" target="_blank" rel="noopener" class="spbtn">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="#000" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
        </svg>
        Dengarkan di Spotify
      </a>` : '';

  // Schema.org structured data untuk Google
  const schema = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "MusicComposition",
    "name": titleRo || titleDisplay,
    "alternateName": titleDisplay,
    "composer": { "@type": "MusicGroup", "name": artist },
    "inLanguage": "ja",
    "description": metaDesc,
    "url": `${BASE_URL}/lagu/${slug}`
  });

  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>Lirik ${escHtml(titleRo || titleDisplay)} - ${escHtml(artist)} + Terjemahan Indonesia | YumeSubs</title>
<meta name="description" content="${escHtml(metaDesc)}">
<meta name="keywords" content="lirik ${escHtml(titleRo||titleDisplay)}, terjemahan ${escHtml(titleRo||titleDisplay)}, ${escHtml(artist)} lirik indonesia, ${escHtml(titleRo||titleDisplay)} romaji, lirik lagu jepang, YumeSubs">
<meta property="og:title" content="Lirik ${escHtml(titleRo || titleDisplay)} - ${escHtml(artist)} | YumeSubs">
<meta property="og:description" content="${escHtml(metaDesc)}">
<meta property="og:url" content="${BASE_URL}/lagu/${slug}">
<meta property="og:type" content="article">
${song.img ? `<meta property="og:image" content="${escHtml(song.img)}">` : ''}
<link rel="canonical" href="${BASE_URL}/lagu/${slug}">
<link rel="icon" type="image/jpeg" href="../anime_icon.png">
<script type="application/ld+json">${schema}</script>
<link href="https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@400;600;800&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;1,9..40,300&display=swap" rel="stylesheet">
<style>
:root{--bg:#050d1a;--border:rgba(255,255,255,0.07);--accent:#c9a96e;--accent2:#4f7ec4;--text:#dde6f5;--muted:#5a6a82;--jp:'Shippori Mincho',serif;--en:'DM Sans',sans-serif}
*{margin:0;padding:0;box-sizing:border-box}
html{scroll-behavior:smooth;background:var(--bg)}
body{color:var(--text);font-family:var(--en);min-height:100dvh;overflow-x:hidden}
nav{position:sticky;top:0;z-index:100;display:flex;align-items:center;justify-content:space-between;padding:0 2.5rem;height:60px;background:rgba(5,13,26,.9);backdrop-filter:blur(24px);border-bottom:1px solid var(--border)}
.nav-logo{display:flex;align-items:center;gap:.5rem;text-decoration:none}
.nljp{font-family:var(--jp);font-size:1.2rem;font-weight:800;color:var(--accent)}
.nlen{font-size:.6rem;color:var(--muted);letter-spacing:.2em;text-transform:uppercase}
.nb{background:none;border:none;font-family:var(--en);font-size:.7rem;color:var(--muted);letter-spacing:.12em;text-transform:uppercase;padding:.45rem .9rem;cursor:pointer;border-radius:2rem;transition:all .2s;text-decoration:none}
.nb:hover{color:var(--text);background:rgba(255,255,255,.06)}
.wrap{max-width:900px;margin:0 auto;padding:2.5rem 2.5rem 6rem}
.breadcrumb{font-size:.65rem;color:var(--muted);margin-bottom:2rem}
.breadcrumb a{color:var(--muted);text-decoration:none}
.breadcrumb a:hover{color:var(--accent)}
.song-header{margin-bottom:2.5rem;padding-bottom:2rem;border-bottom:1px solid var(--border)}
.song-title{font-family:var(--jp);font-size:clamp(1.8rem,4vw,3rem);font-weight:800;color:var(--text);line-height:1.2;margin-bottom:.4rem}
.song-romaji{font-size:1rem;color:var(--muted);font-style:italic;margin-bottom:.2rem}
.song-id{font-size:.9rem;color:var(--muted);margin-bottom:.6rem}
.song-artist{font-size:.75rem;color:var(--accent);letter-spacing:.15em;text-transform:uppercase}
.layout{display:grid;grid-template-columns:260px 1fr;gap:3rem;align-items:start}
.cover{width:100%;aspect-ratio:1;object-fit:cover;border:1px solid var(--border);filter:saturate(.75);display:block}
.line{margin-bottom:.2rem}
.ljp{font-family:var(--jp);font-size:1.15rem;font-weight:600;color:var(--text);line-height:1.55;margin-bottom:.2rem}
.lro{font-size:.82rem;color:var(--muted);font-style:italic;line-height:1.6;margin-bottom:.15rem}
.lid{font-size:.88rem;color:var(--accent);line-height:1.6}
.lsep{border:none;border-top:1px solid var(--border);opacity:.35;margin:.8rem 0}
.back-btn{display:inline-flex;align-items:center;gap:.5rem;background:none;border:1px solid var(--border);font-family:var(--en);font-size:.68rem;letter-spacing:.15em;text-transform:uppercase;color:var(--muted);padding:.5rem 1rem;cursor:pointer;text-decoration:none;transition:all .2s;margin-bottom:1.5rem}
.back-btn:hover{border-color:var(--accent);color:var(--accent)}
.spbtn{display:inline-flex;align-items:center;gap:.5rem;background:#1DB954;border:none;font-family:var(--en);font-size:.65rem;letter-spacing:.12em;text-transform:uppercase;color:#000;padding:.5rem 1.1rem;cursor:pointer;text-decoration:none;font-weight:600;transition:opacity .2s;margin-top:.8rem}
.spbtn:hover{opacity:.85}
.spbtn svg{flex-shrink:0}
@media(max-width:700px){.layout{grid-template-columns:1fr}.wrap{padding:1.5rem 1.2rem 5rem}nav{padding:0 1rem}.nlen{display:none}}
</style>
</head>
<body>
<div id="bgwrap" style="position:fixed;top:0;left:0;width:100%;height:100%;z-index:0;pointer-events:none;background:url('https://images7.alphacoders.com/131/thumb-1920-1316304.jpeg') center/cover no-repeat;filter:brightness(.32) saturate(.75)"></div>
<div style="position:relative;z-index:2">
<nav>
  <a class="nav-logo" href="../index.html">
    <div class="nljp">夢字幕</div>
    <div class="nlen">YumeSubs</div>
  </a>
  <div style="display:flex;gap:.25rem">
    <a class="nb" href="../index.html">Katalog</a>
    <a class="nb" href="../stories.html">Cerita</a>
    <a class="nb" href="../contact.html">Hubungi</a>
  </div>
</nav>

<div class="wrap">
  <nav aria-label="breadcrumb" class="breadcrumb">
    <a href="../index.html">YumeSubs</a> › <a href="../index.html">Katalog</a> › ${escHtml(titleRo || titleDisplay)}
  </nav>

  <a class="back-btn" href="../index.html">← Kembali ke Katalog</a>

  <div class="song-header">
    <div class="song-title">${escHtml(titleDisplay)}</div>
    ${titleRo ? `<div class="song-romaji">${escHtml(titleRo)}</div>` : ''}
    ${titleId ? `<div class="song-id">${escHtml(titleId)}</div>` : ''}
    <div class="song-artist">${escHtml(artist)}</div>
  </div>

  <div class="layout">
    <div>
      ${song.img ? `<img class="cover" src="${escHtml(song.img)}" alt="Cover ${escHtml(titleRo || titleDisplay)} - ${escHtml(artist)}">` : ''}
      ${ytEmbed}
      ${spotifyBtn}
    </div>
    <div>
      <div id="lyrics">
        ${lyricsHTML}
      </div>
    </div>
  </div>
</div>
</div>
</body>
</html>`;
}

// ── Escape HTML ──
function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Main ──
async function main() {
  console.log('🔥 Menghubungkan ke Firebase...');
  const app = initializeApp(firebaseConfig);
  const db  = getFirestore(app);

  const snap = await getDocs(query(collection(db, 'songs'), orderBy('order', 'asc')));
  const songs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  console.log(`📦 ${songs.length} lagu ditemukan`);

  // Buat folder /lagu/ kalau belum ada
  if (!fs.existsSync('lagu')) fs.mkdirSync('lagu');

  const urls = [`  <url><loc>${BASE_URL}/</loc><priority>1.0</priority></url>`];
  const slugMap = {};

  for (const song of songs) {
    const slug = toSlug(song.titleRo, song.titleJp, song.id);

    // Hindari slug duplikat
    let finalSlug = slug;
    let counter = 2;
    while (slugMap[finalSlug] && slugMap[finalSlug] !== song.id) {
      finalSlug = `${slug}-${counter++}`;
    }
    slugMap[finalSlug] = song.id;

    const html = generateHTML(song, finalSlug);
    const filePath = path.join('lagu', `${finalSlug}.html`);
    fs.writeFileSync(filePath, html, 'utf8');
    console.log(`  ✓ lagu/${finalSlug}.html`);

    urls.push(`  <url><loc>${BASE_URL}/lagu/${finalSlug}</loc><priority>0.8</priority></url>`);
  }

  // Generate sitemap.xml
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`;
  fs.writeFileSync('sitemap.xml', sitemap, 'utf8');
  console.log(`\n✅ Selesai! ${songs.length} halaman + sitemap.xml dibuat`);

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
