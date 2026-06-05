// generate-songs.js — v2026-05-21 (夢の夜 · Syne + Cormorant + sakura bgwrap)
// Jalankan via GitHub Actions — ambil data Firebase, generate HTML per lagu + sitemap.xml
// Cek baris 20: harus ada "Cormorant" di FONT_URL (bukan Plus Jakarta)

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, orderBy } from 'firebase/firestore';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

import { buildJlptPhrasesInject, buildJlptSourceInject, applyJlptSourceToGrammar } from './jlpt-phrase-builder.js';

function loadGrammarBrowserJs() {
  let grammar = fs.readFileSync(path.join(__dirname, 'ym-grammar-browser.js'), 'utf8');
  const jlptSrc = buildJlptSourceInject();
  if (jlptSrc !== "''") {
    grammar = applyJlptSourceToGrammar(grammar, jlptSrc);
    const rows = (jlptSrc.match(/\\n/g) || []).length;
    console.log('✓ JLPT bunpou source injected (~' + Math.max(0, rows) + ' baris teks)');
  } else {
    const jlptInject = buildJlptPhrasesInject();
    if (jlptInject !== '[]') {
      grammar = grammar.replace('/*JLPT_PHRASES_INJECT*/[]', jlptInject);
      console.log('✓ JLPT bunpou array:', (jlptInject.match(/\n/g) || []).length + 1, 'baris');
    } else {
      console.warn('⚠ JLPT no BUNPOU.txt tidak ditemukan — PHRASES_JLPT kosong.');
    }
  }
  return grammar;
}

let GRAMMAR_BROWSER_JS = '';
try {
  GRAMMAR_BROWSER_JS = loadGrammarBrowserJs();
} catch (e) {
  console.warn('⚠ ym-grammar-browser.js tidak ditemukan — panel tata bahasa dilewati.', e.message);
}

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: "yumesubs7.firebaseapp.com",
  projectId: "yumesubs7",
  storageBucket: "yumesubs7.firebasestorage.app",
  messagingSenderId: "1076202015626",
  appId: "1:1076202015626:web:ce89fb668eb6b2bd021673"
};

const BASE_URL = 'https://yumelyrics.my.id';
const DEFAULT_COMMENT_PROFILE_URL = `${BASE_URL}/profile-comment.jpg`;
const MANIFEST_PATH = '.yume-generate-manifest.json';

/** Hash isi lagu — dipakai untuk skip generate jika tidak berubah */
function songContentHash(song) {
  const payload = {
    titleJp: song.titleJp || '',
    titleRo: song.titleRo || '',
    titleId: song.titleId || '',
    artist: song.artist || '',
    artistSlug: song.artistSlug || '',
    ytId: song.ytId || '',
    nicoId: song.nicoId || '',
    img: song.img || '',
    sp: song.sp || '',
    descId: song.descId || '',
    descJp: song.descJp || '',
    anime: song.anime || '',
    animeId: song.animeId || '',
    animeEn: song.animeEn || '',
    type: song.type || '',
    genre: song.genre || '',
    mood: song.mood || '',
    jlpt: song.jlpt || '',
    difficulty: song.difficulty || '',
    order: song.order ?? null,
    lyrics: song.lyrics || [],
  };
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 16);
}

function loadManifest() {
  try {
    if (fs.existsSync(MANIFEST_PATH)) {
      const data = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
      if (data && typeof data.songs === 'object') return data;
    }
  } catch (e) { /* corrupt manifest → rebuild */ }
  return { version: 1, songs: {} };
}

function saveManifest(manifest) {
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
}

/** Run pertama: isi manifest dari HTML yang sudah ada di repo (tanpa generate ulang semua) */
function seedManifestFromDisk(manifest, songMeta) {
  let seeded = 0;
  for (const { song, slug } of songMeta) {
    if (manifest.songs[song.id]) continue;
    const fp = path.join('lagu', `${slug}.html`);
    if (!fs.existsSync(fp)) continue;
    manifest.songs[song.id] = { slug, hash: songContentHash(song) };
    seeded++;
  }
  return seeded;
}

function needsSongGenerate(song, slug, manifest, fullMode) {
  if (fullMode) return true;
  if (song.htmlDirty === true) return true;
  const fp = path.join('lagu', `${slug}.html`);
  if (!fs.existsSync(fp)) return true;
  const prev = manifest.songs[song.id];
  if (!prev) return true;
  if (prev.slug !== slug) return true;
  const hash = songContentHash(song);
  if (prev.hash !== hash) return true;
  return false;
}

function removeOrphanHtml(dir, validNames, ext = '.html') {
  if (!fs.existsSync(dir)) return 0;
  let removed = 0;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith(ext)) continue;
    const base = f.slice(0, -ext.length);
    if (!validNames.has(base)) {
      fs.unlinkSync(path.join(dir, f));
      removed++;
    }
  }
  return removed;
}

const FONT_URL = 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400&family=Syne:wght@400;600;700;800&family=Noto+Serif+JP:wght@300;400;600&display=swap';
const FONT_HEAD = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preload" as="style" href="${FONT_URL}" onload="this.onload=null;this.rel='stylesheet'">
<noscript><link rel="stylesheet" href="${FONT_URL}"></noscript>`;

const THEME_BOOT_SCRIPT = `<script>(function(){if(localStorage.getItem('ym_theme')==='dark')document.documentElement.setAttribute('data-theme','dark');})()</script>`;

/** Token + latar — selaras dengan index.html (夢の夜 · sakura dusk). */
const CSS_TOKENS = `
:root{
  --ink:#0a0812;--paper:#f5f0ea;--cream:#ede7dc;--smoke:#c8bfb0;--ash:#8c8278;
  --gold:#c9a96e;--gold2:#e8c98a;--rose:#c4637a;--plum:#7c4d6e;
  --dusk:#6b5b7a;--sakura:#e8b4c8;--sakura-dim:rgba(196,99,122,.12);
  --mist:rgba(10,8,18,.06);--border:rgba(10,8,18,.1);
  --jp:'Noto Serif JP',serif;--en:'Syne',sans-serif;--serif:'Cormorant Garamond',Georgia,serif;
  --sans:var(--en);
  --bg:var(--paper);--text:var(--ink);--muted:var(--ash);
  --accent:var(--rose);--accent2:var(--gold);--accent3:var(--plum);--red:#c0392b;
  --nm-transition:background .35s ease,color .35s ease,border-color .35s ease,box-shadow .35s ease;
}
[data-theme="dark"]{
  --ink:#e8e2d9;--paper:#0f0d0b;--cream:#1a1714;--smoke:#4a4540;--ash:#7a7068;
  --gold:#d4a96e;--gold2:#e8c98a;--rose:#d4758a;--plum:#9a6a8a;
  --dusk:#9a8ab8;--sakura:#c49ab8;--sakura-dim:rgba(212,169,110,.08);
  --mist:rgba(232,226,217,.05);--border:rgba(232,226,217,.1);
  --bg:var(--paper);--text:var(--ink);--muted:var(--ash);--accent:var(--rose);--red:#e05252;
}
[data-theme="dark"] #bgwrap{
  background:
    radial-gradient(ellipse 90% 55% at 12% -5%, rgba(154,138,184,.22) 0%, transparent 55%),
    radial-gradient(ellipse 70% 45% at 95% 15%, rgba(201,169,110,.12) 0%, transparent 50%),
    radial-gradient(ellipse 60% 40% at 50% 100%, rgba(196,99,122,.1) 0%, transparent 55%),
    var(--paper);
}
#bgwrap{position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:0;pointer-events:none;background:
  radial-gradient(ellipse 85% 50% at 8% -8%, rgba(232,180,200,.2) 0%, transparent 58%),
  radial-gradient(ellipse 55% 40% at 92% 12%, rgba(201,169,110,.12) 0%, transparent 52%),
  radial-gradient(ellipse 50% 35% at 50% 105%, rgba(107,91,122,.09) 0%, transparent 55%),
  var(--paper)}
#bgwrap::before{content:'';position:absolute;inset:0;background-image:linear-gradient(var(--border) 1px,transparent 1px),linear-gradient(90deg,var(--border) 1px,transparent 1px);background-size:56px 56px;opacity:.2;pointer-events:none}
body::before{content:'';position:fixed;inset:0;z-index:0;pointer-events:none;background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 512 512' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.04'/%3E%3C/svg%3E");opacity:.38}
[data-theme="dark"] body::before{opacity:.22}
.wrap{position:relative;z-index:1}
`;

function toSlug(titleRo, titleJp, docId) {
  if (titleRo) {
    return titleRo.toLowerCase().replace(/[^a-z0-9\s-]/g,'').trim().replace(/\s+/g,'-').replace(/-+/g,'-').substring(0,60);
  }
  return docId;
}

function toArtistSlug(name) {
  const s = String(name || '').toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').replace(/-+/g, '-').substring(0, 60);
  return s || '';
}

function normalizeArtistKey(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function sanitizeArtistSlug(slug) {
  return String(slug || '').toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '').substring(0, 60);
}

/** Slug artis: pakai field artistSlug di Firebase kalau ada, else dari nama. */
function resolveArtistSlug(explicitSlug, artistName) {
  const fromField = sanitizeArtistSlug(explicitSlug);
  if (fromField) return fromField;
  return toArtistSlug(artistName);
}

function allocateUniqueSlug(base, usedSet) {
  let slug = base || 'artis';
  if (!usedSet.has(slug)) {
    usedSet.add(slug);
    return slug;
  }
  let n = 2;
  while (usedSet.has(`${base}-${n}`)) n++;
  slug = `${base}-${n}`;
  usedSet.add(slug);
  return slug;
}

function escHtml(str) {
  return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

/** URL cover utama — pertahankan / naikkan resolusi (sama seperti admin HD). */
function coverImgUrl(url) {
  if (!url || typeof url !== 'string') return url;
  let u = url.trim();
  if (u.includes('mqdefault')) u = u.replace('mqdefault', 'hqdefault');
  if (u.includes('sddefault')) u = u.replace('sddefault', 'hqdefault');
  return u;
}

/** Thumbnail kecil (related) — boleh lebih ringan. */
function thumbImgUrl(url) {
  if (!url || typeof url !== 'string') return url;
  let u = url.trim();
  if (u.includes('img.youtube.com') && u.includes('maxresdefault')) u = u.replace('maxresdefault', 'hqdefault');
  if (u.includes('genius.com') && /1000x\d+x\d/.test(u)) u = u.replace(/1000x\d+x\d+[^/]*/, '300x300');
  if (u.includes('mzstatic.com')) u = u.replace(/\/(\d+)x(\d+)(bb|cc)/, '/300x300$3');
  if (u.includes('spotifycdn.com/image/ab67616d0000b273')) u = u.replace('0000b273', '00001e02');
  return u;
}

function imgTag(src, alt, opts = {}) {
  const cls = opts.cls || 'related-thumb';
  const w = opts.w || 52;
  const h = opts.h || 52;
  const eager = !!opts.eager;
  const hd = !!opts.hd;
  const sizes = opts.sizes || (hd ? '(max-width:600px) 100vw, 480px' : `${w}px`);
  if (!src) return '';
  const u = hd ? coverImgUrl(src) : thumbImgUrl(src);
  const fp = eager ? ' fetchpriority="high"' : '';
  return `<img class="${cls}" src="${escHtml(u)}" alt="${escHtml(alt)}" width="${w}" height="${h}" loading="${eager ? 'eager' : 'lazy'}" decoding="async" sizes="${sizes}"${fp}>`;
}

function renderText(str) {
  return escHtml(str||'').replace(/(^|\s)(@[^\s<]{1,40})/g, '$1<span class="cm-mention">$2</span>');
}

/** Navbar & menu — sama dengan index.html (prefix relatif ke folder artis/). */
const SITE_NAV_CSS = `
nav{position:sticky;top:0;z-index:100;display:flex;align-items:center;justify-content:space-between;padding:1.2rem 3rem;min-width:0;max-width:100%;background:rgba(245,240,234,.92);backdrop-filter:blur(20px);border-bottom:1px solid rgba(10,8,18,.08);isolation:isolate}
[data-theme="dark"] nav{background:rgba(15,13,11,.92)}
.nav-logo{display:flex;flex-direction:column;gap:.05rem;text-decoration:none;cursor:pointer;flex-shrink:0;min-width:0}
.nljp{font-family:var(--jp);font-size:1.05rem;font-weight:600;color:var(--ink);white-space:nowrap;line-height:1;letter-spacing:.1em}
.nlen{font-size:.55rem;color:var(--ash);letter-spacing:.3em;text-transform:uppercase;white-space:nowrap;line-height:1;font-weight:700}
.nav-links{display:flex;gap:.25rem;align-items:center;flex-shrink:0}
#nav-menu-btn{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;background:none;border:1px solid var(--border);cursor:pointer;flex-shrink:0;flex-direction:column;padding:0;gap:0}
#nav-menu-btn span{display:block;width:14px;height:1.5px;background:var(--ash);transition:transform .25s ease,opacity .2s ease,width .25s ease}
#nav-menu-btn span:nth-child(2){margin:3px 0}
#nav-menu-btn.open span:nth-child(1){transform:translateY(4.5px) rotate(45deg)}
#nav-menu-btn.open span:nth-child(2){opacity:0;width:0}
#nav-menu-btn.open span:nth-child(3){transform:translateY(-4.5px) rotate(-45deg)}
#nav-dropdown{position:absolute;top:calc(100% + 1px);right:3rem;z-index:200;background:var(--paper);border:1px solid var(--border);display:none;flex-direction:column;min-width:160px;max-width:calc(100vw - 2rem);box-shadow:0 8px 32px rgba(10,8,18,.1)}
[data-theme="dark"] #nav-dropdown{background:var(--cream)}
#nav-dropdown.open{display:flex}
.nd-item{background:none;border:none;font-family:var(--sans);font-size:.68rem;color:var(--ash);letter-spacing:.18em;text-transform:uppercase;padding:.75rem 1.2rem;cursor:pointer;text-align:left;width:100%;font-weight:600;text-decoration:none;display:block;white-space:nowrap}
.nd-item:hover,.nd-item.on{color:var(--ink);background:var(--cream)}
#theme-toggle{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;background:none;border:1px solid var(--border);cursor:pointer;flex-shrink:0;position:relative;overflow:hidden;padding:0}
#theme-toggle svg{width:14px;height:14px;stroke:var(--ash);fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;position:absolute;transition:opacity .25s,transform .25s}
#theme-toggle .icon-sun{opacity:1;transform:scale(1)}
#theme-toggle .icon-moon{opacity:0;transform:scale(.7) rotate(45deg)}
[data-theme="dark"] #theme-toggle{border-color:rgba(232,226,217,.35)}
[data-theme="dark"] #theme-toggle svg{stroke:rgba(232,226,217,.75)}
[data-theme="dark"] #theme-toggle .icon-sun{opacity:0;transform:scale(.7) rotate(-45deg)}
[data-theme="dark"] #theme-toggle .icon-moon{opacity:1;transform:scale(1)}
`;

const SITE_NAV_SCRIPT = `<script>
(function(){
  if(localStorage.getItem('ym_theme')==='dark') document.documentElement.setAttribute('data-theme','dark');
  window.toggleTheme=function(){
    var r=document.documentElement;
    if(r.getAttribute('data-theme')==='dark'){
      r.removeAttribute('data-theme');
      localStorage.setItem('ym_theme','light');
    } else {
      r.setAttribute('data-theme','dark');
      localStorage.setItem('ym_theme','dark');
    }
  };
})();
function toggleNavMenu(){
  var btn=document.getElementById('nav-menu-btn');
  var dd=document.getElementById('nav-dropdown');
  if(!btn||!dd)return;
  var open=dd.classList.toggle('open');
  btn.classList.toggle('open',open);
  btn.setAttribute('aria-expanded',open?'true':'false');
}
function closeNavMenu(){
  var btn=document.getElementById('nav-menu-btn');
  var dd=document.getElementById('nav-dropdown');
  if(!dd)return;
  dd.classList.remove('open');
  if(btn){btn.classList.remove('open');btn.setAttribute('aria-expanded','false');}
}
document.addEventListener('click',function(e){
  var btn=document.getElementById('nav-menu-btn');
  var dd=document.getElementById('nav-dropdown');
  if(!dd||!dd.classList.contains('open')||!btn)return;
  if(!btn.contains(e.target)&&!dd.contains(e.target))closeNavMenu();
});
</script>`;

function buildSiteNav(prefix, active) {
  const p = prefix || '';
  const catOn = active === 'katalog' ? ' on' : '';
  const artOn = active === 'artis' ? ' on' : '';
  const artHref = p === '../' ? 'index.html' : p + 'artis/index.html';
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
    <a class="nd-item${catOn}" href="${p}index.html">Katalog</a>
    <a class="nd-item${artOn}" href="${artHref}">Artis</a>
    <a class="nd-item" href="${p}playlists.html">Setlist</a>
    <a class="nd-item" href="${p}bunpou-saved.html">Bunpou tersimpan</a>
    <a class="nd-item" href="${p}kata/index.html">Glosarium</a>
    <a class="nd-item" href="${p}resources.html">Resources</a>
    <a class="nd-item" href="${p}stories.html">Cerita</a>
    <a class="nd-item" href="${p}contact.html">Hubungi</a>
  </div>
</nav>`;
}

/** CSS mobile untuk halaman artis (index + per-artis). */
const ARTIST_MOBILE_CSS = `
@media(max-width:768px){
  nav{padding:.85rem 1rem}
  #nav-dropdown{right:1rem;left:auto;max-width:min(280px,calc(100vw - 2rem))}
  .artist-hero{padding:1.75rem 1rem 1rem}
  .artist-title{font-size:1.6rem;line-height:1.2}
  .artist-count{font-size:.55rem}
  .artist-desc{font-size:.78rem;margin-top:.85rem}
  .breadcrumb{font-size:.5rem;margin-bottom:.85rem;gap:.35rem}
  .catalog{padding:1rem 1rem 3rem}
  .section-title{font-size:1.3rem;margin-bottom:1rem}
  .related-grid{grid-template-columns:1fr!important;gap:.4rem}
  .related-card{
    padding:.5rem .6rem;gap:.6rem;align-items:center;
    transform:none!important;box-shadow:none!important;
  }
  .related-card:hover{transform:none;box-shadow:none;border-color:var(--gold)}
  .related-thumb,.rc-no-img{width:3.4rem;height:3.4rem;min-width:3.4rem}
  .related-info{min-width:0}
  .related-title{font-size:.8rem;line-height:1.25;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  .related-ro{font-size:.6rem;display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden}
  .related-artist{font-size:.5rem}
  .related-arr{display:none}
  footer{flex-direction:column;padding:2rem 1rem;gap:1.25rem}
}
@media(max-width:480px){
  .nljp{font-size:.92rem}
  .artist-title{font-size:1.4rem}
}
@media(max-width:380px){
  .nlen{display:none}
  #nav-dropdown{right:.85rem}
}
`;

function buildMoodChipsHTML(moodStr) {
  const moods = String(moodStr || '').split(/[,，、]/).map(s => s.trim()).filter(Boolean).slice(0, 6);
  if (!moods.length) return '';
  return `<div class="mood-row">${moods.map(m => `<span class="mood-chip">${escHtml(m)}</span>`).join('')}</div>`;
}

function buildLearnMetaHTML(song) {
  const chips = [];
  const jlpt = String(song.jlpt || '').trim().toUpperCase();
  if (jlpt && /^N[1-5]$/.test(jlpt)) chips.push(`<span class="learn-chip jlpt">${escHtml(jlpt)}</span>`);
  const d = String(song.difficulty || '').toLowerCase();
  if (d === 'easy' || d === 'mudah' || d === '1') chips.push('<span class="learn-chip diff-easy">Mudah</span>');
  else if (d === 'hard' || d === 'sulit' || d === '3') chips.push('<span class="learn-chip diff-hard">Sulit</span>');
  else if (d === 'medium' || d === 'sedang' || d === '2') chips.push('<span class="learn-chip diff-med">Sedang</span>');
  if (!chips.length) return '';
  return `<div class="learn-meta-row">${chips.join('')}</div>`;
}

const GLOSSARY_TERM_DEFS = [
  { slug: 'te-shimau', title: '〜てしまう', match: 'てしまう', desc: 'N5 · Menyelesaikan aksi; sering ada nuansa "akhirnya" atau penyesalan ringan.' },
  { slug: 'te-iru', title: '〜ている', match: 'ている', desc: 'N5 · Keadaan berlangsung atau hasil masih ada.' },
  { slug: 'te-kuru', title: '〜てくる', match: 'てくる', desc: 'N5 · Perubahan menuju pembicara / masa sekarang.' },
  { slug: 'te-kudasai', title: '〜てください', match: 'てください', desc: 'N5 · Permintaan sopan: tolong lakukan.' },
  { slug: 'tai', title: '〜たい', match: 'たい', desc: 'N5 · Ingin melakukan sesuatu.' },
  { slug: 'masu', title: '〜ます', match: 'ます', desc: 'N5 · Bentuk sopan (sekarang / kebiasaan).' },
  { slug: 'mashita', title: '〜ました', match: 'ました', desc: 'N5 · Bentuk sopan lampau.' },
  { slug: 'masen', title: '〜ません', match: 'ません', desc: 'N5 · Negatif sopan.' },
  { slug: 'desu', title: '〜です', match: 'です', desc: 'N5 · Kopula sopan (adalah).' },
  { slug: 'deshita', title: '〜でした', match: 'でした', desc: 'N5 · Kopula sopan lampau.' },
  { slug: 'nai', title: '〜ない', match: 'ない', desc: 'N5 · Negatif dasar (kasual).' },
  { slug: 'ta', title: '〜た', match: 'た', desc: 'N5 · Bentuk lampau (-ta).' },
  { slug: 'node', title: '〜ので', match: 'ので', desc: 'N5 · Karena (alasannya).' },
  { slug: 'noni', title: '〜のに', match: 'のに', desc: 'N5 · Padahal / meskipun.' },
  { slug: 'kara', title: '〜から', match: 'から', desc: 'N5 · Dari; karena.' },
  { slug: 'made', title: '〜まで', match: 'まで', desc: 'N5 · Sampai.' },
  { slug: 'dake', title: '〜だけ', match: 'だけ', desc: 'N5 · Hanya / sebanyak.' },
  { slug: 'to-omou', title: '〜と思う', match: 'と思う', desc: 'N5 · Saya pikir / merasa.' },
  { slug: 'you-ni', title: '〜ように', match: 'ように', desc: 'N5 · Agar / supaya / seperti.' },
  { slug: 'ni-naru', title: '〜になる', match: 'になる', desc: 'N5 · Menjadi.' },
  { slug: 'ga-aru', title: '〜がある', match: 'がある', desc: 'N5 · Ada (benda).' },
  { slug: 'ga-iru', title: '〜がいる', match: 'がいる', desc: 'N5 · Ada (makhluk hidup).' },
  { slug: 'arimasu', title: '〜あります', match: 'あります', desc: 'N5 · Ada (sopan).' },
  { slug: 'imasu', title: '〜います', match: 'います', desc: 'N5 · Ada orang/hewan (sopan).' },
  { slug: 'tara', title: '〜たら', match: 'たら', desc: 'N5 · Jika / ketika (kondisi).' },
  { slug: 'mashou', title: '〜ましょう', match: 'ましょう', desc: 'N5 · Ajakan sopan.' },
  { slug: 'wa', title: 'は', match: 'は', desc: 'N5 · Partikel topik.' },
  { slug: 'ga', title: 'が', match: 'が', desc: 'N5 · Partikel subjek.' },
  { slug: 'wo', title: 'を', match: 'を', desc: 'N5 · Partikel objek.' },
  { slug: 'ni', title: 'に', match: 'に', desc: 'N5 · Arah, waktu, tujuan.' },
  { slug: 'de', title: 'で', match: 'で', desc: 'N5 · Tempat, alat, cara.' },
  { slug: 'to', title: 'と', match: 'と', desc: 'N5 · Dan, bersama, kutipan.' },
  { slug: 'no', title: 'の', match: 'の', desc: 'N5 · Kepemilikan / penghubung.' },
  { slug: 'mo', title: 'も', match: 'も', desc: 'N5 · Juga.' },
  { slug: 'te', title: '〜て', match: 'て', desc: 'N5 · Penghubung て-form.' },
  { slug: 'te-oku', title: '〜ておく', match: 'ておく', desc: 'N4 · Melakukan dulu (persiapan).' },
  { slug: 'te-aru', title: '〜てある', match: 'てある', desc: 'N4 · Sudah dilakukan (hasil terlihat).' },
  { slug: 'te-miru', title: '〜てみる', match: 'てみる', desc: 'N4 · Mencoba melakukan.' },
  { slug: 'te-kureru', title: '〜てくれる', match: 'てくれる', desc: 'N4 · Orang lain melakukan untukku.' },
  { slug: 'te-hoshii', title: '〜てほしい', match: 'てほしい', desc: 'N4 · Ingin orang lain melakukan.' },
  { slug: 'you-ni-suru', title: '〜ようにする', match: 'ようにする', desc: 'N4 · Berusaha supaya.' },
  { slug: 'you-ni-naru', title: '〜ようになる', match: 'ようになる', desc: 'N4 · Mulai bisa / berubah jadi.' },
  { slug: 'kamo', title: '〜かもしれない', match: 'かもしれない', desc: 'N4 · Mungkin.' },
  { slug: 'rashii', title: '〜らしい', match: 'らしい', desc: 'N4 · Konon / rupanya (dengar).' },
  { slug: 'you-da', title: '〜ようだ', match: 'ようだ', desc: 'N4 · Sepertinya (bukti).' },
  { slug: 'mitai-da', title: '〜みたい', match: 'みたい', desc: 'N4 · Seperti / kayak.' },
  { slug: 'sou-da-rumor', title: '〜そうだ', match: 'そうだ', desc: 'N4 · Konon (mendengar).' },
  { slug: 'sou-ni', title: '〜そうに', match: 'そうに', desc: 'N4 · Kelihatan akan (tampak).' },
  { slug: 'ni-totte', title: '〜にとって', match: 'にとって', desc: 'N4 · Bagi (sudut pandang).' },
  { slug: 'ni-tsuite', title: '〜について', match: 'について', desc: 'N4 · Tentang.' },
  { slug: 'ni-yotte', title: '〜によって', match: 'によって', desc: 'N4 · Oleh / tergantung.' },
  { slug: 'hou-ga-ii', title: '〜ほうがいい', match: 'ほうがいい', desc: 'N4 · Lebih baik (sebaiknya).' },
  { slug: 'ba', title: '〜ば', match: 'ば', desc: 'N4 · Jika (kondisi).' },
  { slug: 'reba', title: '〜れば', match: 'れば', desc: 'N4 · Jika (kondisi).' },
  { slug: 'nagara', title: '〜ながら', match: 'ながら', desc: 'N4 · Sambil melakukan.' },
  { slug: 'darou', title: '〜だろう', match: 'だろう', desc: 'N4 · Mungkin / kan.' },
  { slug: 'deshou', title: '〜でしょう', match: 'でしょう', desc: 'N4 · Mungkin (sopan).' },
  { slug: 'kedo', title: '〜けど', match: 'けど', desc: 'N4 · Tapi (kasual).' },
  { slug: 'shikashi', title: 'しかし', match: 'しかし', desc: 'N4 · Namun.' },
  { slug: 'dakara', title: 'だから', match: 'だから', desc: 'N4 · Jadi / makanya.' },
  { slug: 'ni-chigainai', title: '〜に違いない', match: 'に違いない', desc: 'N3 · Pasti / tidak diragukan.' },
  { slug: 'wake-dewa-nai', title: '〜わけではない', match: 'わけではない', desc: 'N3 · Bukan berarti…' },
  { slug: 'wake-ga-nai', title: '〜わけがない', match: 'わけがない', desc: 'N3 · Tidak mungkin.' },
  { slug: 'wake-da', title: '〜わけだ', match: 'わけだ', desc: 'N3 · Jadi beginilah.' },
  { slug: 'zu-ni-irarenai', title: '〜ずにはいられない', match: 'ずにはいられない', desc: 'N3 · Tak bisa tidak.' },
  { slug: 'koto-ni-suru', title: '〜ことにする', match: 'ことにする', desc: 'N3 · Memutuskan untuk.' },
  { slug: 'koto-ga-aru', title: '〜ことがある', match: 'ことがある', desc: 'N3 · Kadang-kadang.' },
  { slug: 'koto-ga-dekiru', title: '〜ことができる', match: 'ことができる', desc: 'N3 · Bisa / mampu.' },
  { slug: 'you-ni-shite-iru', title: '〜ようにしている', match: 'ようにしている', desc: 'N3 · Berusaha (kebiasaan).' },
  { slug: 'mono-da', title: '〜ものだ', match: 'ものだ', desc: 'N3 · Biasanya / nostalgia.' },
  { slug: 'mono-dewa-nai', title: '〜ものではない', match: 'ものではない', desc: 'N3 · Sebaiknya tidak.' },
  { slug: 'koto-da', title: '〜ことだ', match: 'ことだ', desc: 'N3 · Sebaiknya / harusnya.' },
  { slug: 'dake-de-naku', title: '〜だけでなく', match: 'だけでなく', desc: 'N3 · Tidak hanya… tetapi juga.' },
  { slug: 'dokoro-ka', title: '〜どころか', match: 'どころか', desc: 'N3 · Malah sebaliknya.' },
  { slug: 'ni-suginai', title: '〜に過ぎない', match: 'に過ぎない', desc: 'N3 · Hanya sekadar.' },
  { slug: 'to-wa-kagiranai', title: '〜とは限らない', match: 'とは限らない', desc: 'N3 · Belum tentu.' },
  { slug: 'ni-tsurete', title: '〜につれて', match: 'につれて', desc: 'N3 · Seiring dengan.' },
  { slug: 'ka-no-you-da', title: '〜かのようだ', match: 'かのようだ', desc: 'N3 · Seolah-olah.' },
  { slug: 'ki-ga-suru', title: '〜気がする', match: '気がする', desc: 'N3 · Merasa seperti.' },
  { slug: 'bakari-da', title: '〜ばかりだ', match: 'ばかりだ', desc: 'N2 · Terus / hanya.' },
  { slug: 'koto-ni-natte-iru', title: '〜ことになっている', match: 'ことになっている', desc: 'N2 · Aturan / kebiasaan.' },
  { slug: 'koto-ni-natta', title: '〜ことになった', match: 'ことになった', desc: 'N2 · Diputuskan.' },
  { slug: 'te-tamaranai', title: '〜てたまらない', match: 'てたまらない', desc: 'N2 · Sangat (perasaan).' },
  { slug: 'ni-shite-wa', title: '〜にしては', match: 'にしては', desc: 'N2 · Untuk… (luar biasa).' },
  { slug: 'ni-oite', title: '〜において', match: 'において', desc: 'N2 · Di (formal).' },
  { slug: 'ni-kanshite', title: '〜に関して', match: 'に関して', desc: 'N2 · Mengenai.' },
  { slug: 'ni-taishite', title: '〜に対して', match: 'に対して', desc: 'N2 · Terhadap.' },
  { slug: 'ni-yoru-to', title: '〜によると', match: 'によると', desc: 'N2 · Menurut (sumber).' },
  { slug: 'ni-motozuite', title: '〜に基づいて', match: 'に基づいて', desc: 'N2 · Berdasarkan.' },
  { slug: 'ni-oujite', title: '〜に応じて', match: 'に応じて', desc: 'N2 · Sesuai kondisi.' },
  { slug: 'to-iu-yori', title: '〜というより', match: 'というより', desc: 'N2 · Lebih tepatnya.' },
  { slug: 'to-itte-mo', title: '〜といっても', match: 'といっても', desc: 'N2 · Meski disebut.' },
  { slug: 'mono-no', title: '〜ものの', match: 'ものの', desc: 'N2 · Meski… tetapi.' },
  { slug: 'dake-atte', title: '〜だけあって', match: 'だけあって', desc: 'N2 · Sesuai reputasi.' },
  { slug: 'koso', title: '〜こそ', match: 'こそ', desc: 'N2 · Penekanan "justru".' },
  { slug: 'sae', title: '〜さえ', match: 'さえ', desc: 'N2 · Bahkan.' },
  { slug: 'ppoi', title: '〜っぽい', match: 'っぽい', desc: 'N2 · Kecenderungan / seperti.' },
  { slug: 'zaru-wo-enai', title: '〜ざるを得ない', match: 'ざるを得ない', desc: 'N1 · Terpaksa.' },
  { slug: 'to-wa-ie', title: '〜とはいえ', match: 'とはいえ', desc: 'N1 · Meski demikian.' },
  { slug: 'ni-hoka-naranai', title: '〜にほかならない', match: 'にほかならない', desc: 'N1 · Tidak lain adalah.' },
  { slug: 'bakari-ka', title: '〜ばかりか', match: 'ばかりか', desc: 'N1 · Tidak hanya… bahkan.' },
  { slug: 'kara-ni-wa', title: '〜からには', match: 'からには', desc: 'N1 · Karena sudah… wajib.' },
  { slug: 'tsutsu-aru', title: '〜つつある', match: 'つつある', desc: 'N1 · Sedang berlangsung (perubahan).' },
];

function buildGlossaryPages(songMeta, today) {
  if (!fs.existsSync('kata')) fs.mkdirSync('kata');
  const old = fs.readdirSync('kata').filter(f => f.endsWith('.html'));
  for (const f of old) fs.unlinkSync(path.join('kata', f));

  const index = {};
  for (const term of GLOSSARY_TERM_DEFS) index[term.slug] = { term, examples: [] };

  for (const { song, slug } of songMeta) {
    (song.lyrics || []).forEach((line, i) => {
      const jp = line.jp || '';
      if (!jp) return;
      for (const term of GLOSSARY_TERM_DEFS) {
        if (!jp.includes(term.match)) continue;
        const bucket = index[term.slug];
        if (bucket.examples.length >= 6) continue;
        const dup = bucket.examples.some(ex => ex.slug === slug && ex.line === i);
        if (dup) continue;
        bucket.examples.push({
          slug,
          line: i,
          jp,
          id: line.id || '',
          ro: line.ro || '',
          title: song.titleJp || song.titleRo || '',
          artist: song.artist || '',
        });
      }
    });
  }

  const cards = [];
  const urls = [`  <url><loc>${BASE_URL}/kata/</loc><lastmod>${today}</lastmod><priority>0.7</priority></url>`];

  for (const term of GLOSSARY_TERM_DEFS) {
    const data = index[term.slug];
    const exHtml = data.examples.length
      ? data.examples.map(ex => `<a class="gloss-ex" href="../lagu/${escHtml(ex.slug)}.html">
          <div class="gloss-ex-jp">${escHtml(ex.jp)}</div>
          <div class="gloss-ex-meta">${escHtml(ex.title)} · ${escHtml(ex.artist)}</div>
        </a>`).join('')
      : '<p class="gloss-empty">Belum ada contoh di katalog — akan bertambah seiring generate.</p>';

    const page = `<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escHtml(term.title)} — Glosarium | YumeSubs</title>
<meta name="description" content="${escHtml(term.desc)} Contoh dari lirik lagu Jepang di YumeSubs.">
<link rel="canonical" href="${BASE_URL}/kata/${term.slug}.html">
${FONT_HEAD}
${THEME_BOOT_SCRIPT}
<style>${CSS_TOKENS}body{font-family:var(--sans);background:var(--paper);color:var(--ink);padding:2rem 1.5rem 4rem}
.wrap{max-width:720px;margin:0 auto}
h1{font-family:var(--jp);font-size:2rem;font-weight:400;margin-bottom:.5rem}
.gloss-desc{font-family:var(--serif);font-size:1rem;line-height:1.8;color:var(--ash);margin-bottom:2rem}
.gloss-ex{display:block;padding:1rem 0;border-bottom:1px solid var(--border);text-decoration:none;color:inherit}
.gloss-ex:hover{background:var(--sakura-dim)}
.gloss-ex-jp{font-family:var(--jp);font-size:1rem}
.gloss-ex-meta{font-size:.68rem;color:var(--ash);margin-top:.25rem}
a.back{font-size:.65rem;letter-spacing:.15em;text-transform:uppercase;color:var(--gold)}
</style></head><body><div id="bgwrap"></div><div class="wrap">
<a class="back" href="index.html">← Glosarium</a>
<h1>${escHtml(term.title)}</h1>
<p class="gloss-desc">${escHtml(term.desc)}</p>
<h2 style="font-size:.58rem;letter-spacing:.25em;text-transform:uppercase;color:var(--smoke);margin-bottom:1rem">Contoh dari lagu</h2>
${exHtml}
</div></body></html>`;
    fs.writeFileSync(path.join('kata', `${term.slug}.html`), page, 'utf8');
    urls.push(`  <url><loc>${BASE_URL}/kata/${term.slug}.html</loc><lastmod>${today}</lastmod><priority>0.55</priority></url>`);
    if (data.examples.length) {
      cards.push(`<a class="gloss-card" href="${term.slug}.html"><span class="gloss-card-jp">${escHtml(term.title)}</span><span class="gloss-card-n">${data.examples.length} contoh</span></a>`);
    }
  }

  const indexHtml = `<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Glosarium Tata Bahasa Jepang | YumeSubs</title>
<meta name="description" content="Glosarium partikel dan pola bahasa Jepang dari lirik lagu — contoh nyata dari katalog YumeSubs.">
<link rel="canonical" href="${BASE_URL}/kata/">
${FONT_HEAD}
${THEME_BOOT_SCRIPT}
<style>${CSS_TOKENS}body{font-family:var(--sans);background:var(--paper);color:var(--ink);padding:3rem 1.5rem}
.wrap{max-width:900px;margin:0 auto}
h1{font-family:var(--serif);font-size:2.2rem;font-weight:300;margin-bottom:.5rem}
.sub{color:var(--ash);margin-bottom:2rem;line-height:1.7}
.gloss-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:.75rem}
.gloss-card{display:flex;flex-direction:column;padding:1rem;border:1px solid var(--border);text-decoration:none;color:inherit;transition:background .2s,border-color .2s}
.gloss-card:hover{border-color:var(--gold);background:var(--sakura-dim)}
.gloss-card-jp{font-family:var(--jp);font-size:1.1rem}
.gloss-card-n{font-size:.58rem;color:var(--ash);margin-top:.35rem}
</style></head><body><div id="bgwrap"></div><div class="wrap">
<a href="../index.html" style="font-size:.65rem;color:var(--gold);text-transform:uppercase;letter-spacing:.15em">← Beranda</a>
<h1>Glosarium 文法</h1>
<p class="sub">Pola bunpou JLPT N5–N1 yang sering muncul di lirik — dengan contoh langsung dari lagu di katalog.</p>
<div class="gloss-grid">${cards.join('')}</div>
</div></body></html>`;
  fs.writeFileSync(path.join('kata', 'index.html'), indexHtml, 'utf8');
  console.log(`  ✓ kata/index.html + ${GLOSSARY_TERM_DEFS.length} entri`);
  return urls;
}

const NOISE_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
function randNoise() {
  return NOISE_CHARS[Math.floor(Math.random() * NOISE_CHARS.length)];
}
function obfuscateLine(str) {
  if (!str) return '';
  // Split by semua jenis whitespace termasuk fullwidth space U+3000
  // Lirik Jepang sering pakai spasi fullwidth sebagai pemisah frasa
  const tokens = str.split(/([ \t\u3000]+)/);
  return tokens.map((token) => {
    if (!token) return '';
    // Kalau token adalah whitespace, render sebagai spasi visual
    if (/^[ \t\u3000]+$/.test(token)) {
      return '<span data-sp="1" style="display:inline;white-space:pre"> </span>';
    }
    const chars = [...token];
    const indices = chars.map((_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    const innerSpans = indices.map(origIdx =>
      '<span data-c="' + origIdx + '">' + escHtml(chars[origIdx]) + '</span>'
    ).join('');
    return '<span class="obf-word" style="display:inline-flex;flex-shrink:1;min-width:0;max-width:100%;overflow-wrap:break-word;word-break:break-word;flex-wrap:wrap">' + innerSpans + '</span>';
  }).join('');
}

function generateArtistIndexHTML(artists) {
  const sorted = [...artists].sort((a, b) => a.name.localeCompare(b.name, 'id'));
  const totalSongs = sorted.reduce((n, a) => n + a.count, 0);
  const cards = sorted.map(a => `<a class="related-card" href="${escHtml(a.slug)}.html">
    ${a.img
      ? imgTag(a.img, a.name, { cls: 'related-thumb', w: 96, h: 96, hd: true, sizes: '56px' })
      : `<div class="rc-no-img">♪</div>`}
    <div class="related-info">
      <div class="related-title">${escHtml(a.name)}</div>
      <div class="related-ro">${a.count} lagu</div>
    </div>
    <div class="related-arr">→</div>
  </a>`).join('');

  const schema = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Daftar Artis — YumeSubs',
    description: `${sorted.length} artis, ${totalSongs} lagu lirik Jepang dengan terjemahan Indonesia.`,
    url: `${BASE_URL}/artis/`,
    inLanguage: 'id',
    isPartOf: { '@type': 'WebSite', name: 'YumeSubs', url: BASE_URL },
  });

  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<meta name="robots" content="index, follow">
<title>Daftar Artis — Lirik Jepang + Terjemahan Indonesia | YumeSubs</title>
<meta name="description" content="${sorted.length} artis dengan lirik Jepang, romaji, dan terjemahan bahasa Indonesia di YumeSubs.">
<meta property="og:title" content="Daftar Artis | YumeSubs">
<meta property="og:url" content="${BASE_URL}/artis/">
<meta property="og:type" content="website">
<link rel="canonical" href="${BASE_URL}/artis/">
<link rel="icon" type="image/jpeg" href="../anime_icon.png">
<script type="application/ld+json">${schema}</script>
${FONT_HEAD}
${THEME_BOOT_SCRIPT}
<style>
${CSS_TOKENS}
*{margin:0;padding:0;box-sizing:border-box}
html{scroll-behavior:smooth;background:var(--paper)}
body{background:var(--paper);color:var(--ink);font-family:var(--sans);min-height:100dvh;transition:var(--nm-transition)}
[data-theme="dark"] body{background:var(--paper);color:var(--ink)}
[data-theme="dark"] nav{background:rgba(15,13,11,.92)}
${SITE_NAV_CSS}
.artist-hero{padding:4rem 3.5rem 2rem;max-width:1100px}
.artist-title{font-family:var(--serif);font-size:clamp(2.2rem,5vw,3.4rem);font-weight:300;font-style:italic}
.artist-count{font-size:.62rem;font-weight:700;letter-spacing:.22em;text-transform:uppercase;color:var(--smoke);margin-top:.6rem}
.catalog{padding:2rem 3.5rem 5rem}
.related-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:1rem}
.related-card{display:flex;align-items:center;gap:1rem;padding:1rem;border:1px solid var(--border);text-decoration:none;color:inherit;transition:border-color .2s,background .2s}
.related-card:hover{border-color:var(--gold);background:rgba(201,169,110,.06)}
.related-thumb{width:52px;height:52px;object-fit:cover;flex-shrink:0}
.rc-no-img{width:52px;height:52px;display:flex;align-items:center;justify-content:center;background:var(--cream);color:var(--smoke);flex-shrink:0}
.related-title{font-size:.88rem;font-weight:600}
.related-ro{font-size:.68rem;color:var(--ash);margin-top:.2rem}
.related-arr{margin-left:auto;color:var(--gold)}
footer{padding:3rem 3.5rem;border-top:1px solid var(--border);display:flex;gap:3rem;flex-wrap:wrap}
.footer-link{display:block;font-size:.72rem;color:var(--ash);text-decoration:none;margin-bottom:.35rem}
.footer-link:hover{color:var(--gold)}
@media(max-width:900px){.related-grid{grid-template-columns:repeat(2,1fr)}nav,.artist-hero,.catalog,footer{padding-left:1.2rem;padding-right:1.2rem}}
${ARTIST_MOBILE_CSS}
</style>
</head>
<body>
<div id="bgwrap"></div>
<div class="wrap">
${buildSiteNav('../', 'artis')}
<section class="artist-hero">
  <h1 class="artist-title">Semua Artis</h1>
  <div class="artist-count">${sorted.length} artis · ${totalSongs} lagu</div>
</section>
<section class="catalog">
  <div class="related-grid">${cards}</div>
</section>
<footer>
  <div>
    <a class="footer-link" href="../index.html">← Katalog Lagu</a>
    <a class="footer-link" href="../latihan.html">Latihan Terjemahan</a>
    <a class="footer-link" href="../stories.html">Cerita</a>
  </div>
</footer>
</div>
${SITE_NAV_SCRIPT}
</body>
</html>`;
}

function generateArtistHTML(artistName, songs, artistSlug) {
  const count = songs.length;
  const metaDesc = `${count} lagu ${artistName} dengan lirik Jepang, romaji, dan terjemahan bahasa Indonesia di YumeSubs.`;
  const cards = songs.map(r => `<a class="related-card" href="../lagu/${r.slug}.html">
    ${r.img
      ? imgTag(r.img, r.titleMain, { cls: 'related-thumb', w: 96, h: 96, hd: true, sizes: '56px' })
      : `<div class="rc-no-img">♪</div>`}
    <div class="related-info">
      <div class="related-title">${escHtml(r.titleDisplay || r.titleMain)}</div>
      ${r.titleRo ? `<div class="related-ro">${escHtml(r.titleRo)}</div>` : ''}
      ${r.anime ? `<div class="related-artist">${escHtml(r.animeId || r.anime)}</div>` : ''}
    </div>
    <div class="related-arr">→</div>
  </a>`).join('');

  const schema = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `Lirik ${artistName} — YumeSubs`,
    description: metaDesc,
    url: `${BASE_URL}/artis/${artistSlug}.html`,
    inLanguage: 'id',
    isPartOf: { '@type': 'WebSite', name: 'YumeSubs', url: BASE_URL },
    mainEntity: {
      '@type': 'MusicGroup',
      name: artistName,
      url: `${BASE_URL}/artis/${artistSlug}.html`,
    },
  });

  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<meta name="robots" content="index, follow">
<title>Lirik ${escHtml(artistName)} — ${count} Lagu + Terjemahan Indonesia | YumeSubs</title>
<meta name="description" content="${escHtml(metaDesc)}">
<meta property="og:title" content="Lirik ${escHtml(artistName)} | YumeSubs">
<meta property="og:description" content="${escHtml(metaDesc)}">
<meta property="og:url" content="${BASE_URL}/artis/${artistSlug}.html">
<meta property="og:type" content="website">
<meta property="og:site_name" content="YumeSubs">
<link rel="canonical" href="${BASE_URL}/artis/${artistSlug}.html">
<link rel="icon" type="image/jpeg" href="../anime_icon.png">
<script type="application/ld+json">${schema}</script>
${FONT_HEAD}
${THEME_BOOT_SCRIPT}
<style>
${CSS_TOKENS}
*{margin:0;padding:0;box-sizing:border-box}
html{scroll-behavior:smooth;background:var(--paper)}
body{background:var(--paper);color:var(--ink);font-family:var(--sans);min-height:100dvh;transition:var(--nm-transition)}
[data-theme="dark"] body{background:var(--paper);color:var(--ink)}
[data-theme="dark"] nav{background:rgba(15,13,11,.92)}
[data-theme="dark"] footer{background:#070604}
${SITE_NAV_CSS}
.artist-hero{padding:4rem 3.5rem 2rem;max-width:1100px}
.breadcrumb{display:flex;align-items:center;gap:.5rem;font-size:.58rem;font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:var(--ash);margin-bottom:2rem;flex-wrap:wrap}
.breadcrumb a{text-decoration:none;color:inherit;transition:color .2s}
.breadcrumb a:hover{color:var(--gold)}
.breadcrumb span{color:var(--gold)}
.artist-title{font-family:var(--serif);font-size:clamp(2.2rem,5vw,3.4rem);font-weight:300;font-style:italic;color:var(--ink);line-height:1.1;margin-bottom:.6rem}
.artist-count{font-size:.62rem;font-weight:700;letter-spacing:.22em;text-transform:uppercase;color:var(--smoke)}
.artist-desc{font-size:.85rem;color:var(--ash);line-height:1.75;max-width:520px;margin-top:1.2rem}
.catalog{padding:2rem 3.5rem 5rem}
.section-title{font-family:var(--serif);font-size:2rem;font-weight:300;font-style:italic;color:var(--ink);margin-bottom:2rem}
.related-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:1.5rem}
.related-card{display:flex;gap:1rem;align-items:flex-start;padding:1.25rem;border:1px solid var(--border);background:var(--paper);text-decoration:none;transition:border-color .2s,background .2s}
.related-card:hover{border-color:var(--gold);background:rgba(201,169,110,.05)}
.related-thumb{width:52px;height:52px;object-fit:cover;flex-shrink:0;image-rendering:auto}
.rc-no-img{width:52px;height:52px;display:flex;align-items:center;justify-content:center;font-size:.85rem;color:var(--smoke);background:var(--cream);flex-shrink:0}
.related-info{min-width:0;flex:1;display:flex;flex-direction:column;gap:.25rem}
.related-title{font-family:var(--jp);font-size:.92rem;color:var(--ink);line-height:1.35}
.related-ro{font-family:var(--serif);font-size:.75rem;font-style:italic;color:var(--ash)}
.related-artist{font-size:.55rem;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:var(--smoke)}
.related-arr{font-size:.7rem;color:var(--smoke);flex-shrink:0;font-family:var(--serif)}
footer{display:flex;justify-content:space-between;align-items:flex-start;gap:3rem;padding:3rem 3.5rem;border-top:1px solid var(--border);background:var(--cream)}
.footer-brand-jp{font-family:var(--jp);font-size:1.1rem;font-weight:600;color:var(--ink)}
.footer-brand-tagline{font-size:.58rem;color:var(--ash);letter-spacing:.15em;text-transform:uppercase;margin-top:.2rem}
.footer-copy{font-size:.55rem;color:var(--smoke);margin-top:1rem}
.footer-col-label{font-size:.52rem;font-weight:700;letter-spacing:.22em;text-transform:uppercase;color:var(--smoke);display:block;margin-bottom:.6rem}
.footer-link{display:block;font-size:.72rem;color:var(--ash);text-decoration:none;margin-bottom:.35rem}
.footer-link:hover{color:var(--gold)}
@media(max-width:900px){.related-grid{grid-template-columns:repeat(2,1fr)}nav{padding:1rem 1.2rem}.artist-hero,.catalog,footer{padding-left:1.2rem;padding-right:1.2rem}}
${ARTIST_MOBILE_CSS}
</style>
</head>
<body>
<div id="bgwrap"></div>
<div class="wrap">
${buildSiteNav('../', 'artis')}

<section class="artist-hero">
  <div class="breadcrumb">
    <a href="../index.html">Beranda</a>
    <span class="breadcrumb-sep">›</span>
    <a href="index.html">Artis</a>
    <span class="breadcrumb-sep">›</span>
    <span>${escHtml(artistName)}</span>
  </div>
  <h1 class="artist-title">${escHtml(artistName)}</h1>
  <div class="artist-count">${count} lagu</div>
  <p class="artist-desc">Semua lirik lagu ${escHtml(artistName)} dengan teks Jepang, romaji, dan terjemahan bahasa Indonesia.</p>
</section>

<section class="catalog">
  <h2 class="section-title">Daftar Lagu</h2>
  <div class="related-grid">${cards}</div>
</section>

<footer>
  <div>
    <div class="footer-brand-jp">夢Lyrics</div>
    <div class="footer-brand-tagline">Lirik Jepang · Terjemahan Indonesia</div>
    <div class="footer-copy">© 2025 YumeSubs — yumelyrics.my.id</div>
  </div>
  <div>
    <span class="footer-col-label">Jelajahi</span>
    <a class="footer-link" href="../index.html">Katalog Lengkap</a>
    <a class="footer-link" href="index.html">Semua Artis</a>
    <a class="footer-link" href="../latihan.html">Latihan Terjemahan</a>
    <a class="footer-link" href="../stories.html">Cerita</a>
    <a class="footer-link" href="../contact.html">Hubungi</a>
  </div>
</footer>
</div>
${SITE_NAV_SCRIPT}
</body>
</html>`;
}

function generateHTML(song, slug, relatedByArtist=[], relatedByAnime=[], artistSlug='') {
  const titleDisplay = song.titleJp || '';
  const titleRo      = song.titleRo || '';
  const titleId      = song.titleId || '';
  const artist       = song.artist  || '';
  const anime        = song.anime   || '';
  const animeId      = song.animeId || '';
  const animeEn      = song.animeEn || '';
  const animeDisplay = animeId || anime;
  const songType     = song.type    || ''; // 'opening', 'ending', 'insert', 'ost'
  const lyrics       = song.lyrics  || [];
  const songId       = song.id;

  const titleMain    = titleRo || titleDisplay;
  const firstLines   = lyrics.slice(0,3).map(l=>l.id||l.ro||l.jp).filter(Boolean).join(' / ');
  const descId       = song.descId || '';
  const descJp       = song.descJp || '';

  // Metadesc — pakai descId kalau admin udah isi, fallback ke auto-generated
  let metaDesc;
  if (descId) {
    metaDesc = descId.substring(0, 160);
  } else {
    const animeCtx   = anime ? ` dari anime ${animeDisplay}` : '';
    const typeCtx    = songType ? ` (${songType})` : '';
    const titleIdCtx = titleId ? ` Artinya: "${titleId}".` : '';
    metaDesc = `Lirik ${titleMain}${animeCtx}${typeCtx} - ${artist} lengkap: teks Jepang, romaji, dan terjemahan bahasa Indonesia.${titleIdCtx} ${firstLines ? firstLines + '.' : ''} Baca arti dan makna lagu di YumeSubs.`.substring(0, 160);
  }


  const moodChipsHTML = buildMoodChipsHTML(song.mood);
  const learnMetaHTML = buildLearnMetaHTML(song);
  const lyricsPlain = lyrics.map(l => ({ jp: l.jp || '', ro: l.ro || '', id: l.id || '' }));
  const songSeedObj = {
    id: songId,
    titleJp: titleDisplay,
    titleRo, titleId, artist,
    artistSlug: song.artistSlug || '',
    ytId: song.ytId || '',
    nicoId: song.nicoId || '',
    img: song.img || '',
    sp: song.sp || '',
    descId, descJp,
    anime, animeId, animeEn,
    type: songType,
    genre: song.genre || '',
    mood: song.mood || '',
    lyrics: lyrics.map(l => ({ jp: l.jp || '', ro: l.ro || '', id: l.id || '', ans: l.ans || '' }))
  };

  const lyricsHTML = lyrics.map((l, i) =>
    '<div class="ll-item" data-line="' + i + '">' +
    '<div class="lyric-left">' +
    '<div class="ljp" data-obf="1">' + obfuscateLine(l.jp||'') + '</div>' +
    (l.ro ? '<div class="lro" data-obf="1">' + obfuscateLine(l.ro) + '</div>' : '') +
    '</div>' +
    (l.id ? '<div class="lyric-right"><div class="lid" data-obf="1">' + obfuscateLine(l.id) + '</div></div>' : '<div class="lyric-right"></div>') +
    '<div class="line-actions">' +
    '<button type="button" class="line-bunpou-btn" onclick="event.stopPropagation();openBunpouPopup(' + i + ')" title="Bunpou · tata bahasa baris ini" aria-label="Bunpou baris ' + (i + 1) + '">文法</button>' +
    '<button type="button" class="line-share-btn" onclick="event.stopPropagation();shareLine(' + i + ')" title="Bagikan baris ini" aria-label="Bagikan baris">↗</button>' +
    '</div></div>'
  ).join('');



  const today = new Date().toISOString().split('T')[0];
  const schema = JSON.stringify([
    {
      "@context":"https://schema.org",
      "@type":"MusicComposition",
      "name": titleMain,
      "alternateName": [titleDisplay, titleRo, titleId, anime, animeId, animeEn].filter(Boolean),
      "composer":{"@type":"MusicGroup","name":artist,"url":artistSlug ? `${BASE_URL}/artis/${artistSlug}.html` : `${BASE_URL}/index.html?q=${encodeURIComponent(artist)}`},
      "lyricist":{"@type":"MusicGroup","name":artist},
      ...(song.genre ? {"genre": song.genre} : {}),
      "inLanguage":"ja",
      "description":metaDesc,
      "url":`${BASE_URL}/lagu/${slug}`,
      ...(songType ? {"musicCompositionForm": songType} : {}),
      ...(anime ? {"isPartOf": {"@type":"TVSeries","name":anime,...(animeId||animeEn?{alternateName:[animeId,animeEn].filter(Boolean)}:{})}} : {}),
      ...(song.img ? {"image":{"@type":"ImageObject","url":song.img,"width":600,"height":600}} : {}),
      ...(song.sp ? {"sameAs": Array.isArray(song.sp)?song.sp:[song.sp]} : {}),
      "recordedAs":{
        "@type":"MusicRecording",
        "name": titleMain,
        "byArtist":{"@type":"MusicGroup","name":artist},
        "inLanguage":"ja",
        ...(song.sp ? {"url": Array.isArray(song.sp)?song.sp[0]:song.sp} : {})
      }
    },
    {
      "@context":"https://schema.org",
      "@type":"WebPage",
      "name":`Lirik ${titleMain} - ${artist} + Terjemahan Indonesia`,
      "description":metaDesc,
      "url":`${BASE_URL}/lagu/${slug}`,
      "inLanguage":"id",
      "datePublished":"2025-01-01",
      "dateModified":today,
      "isPartOf":{
        "@type":"WebSite",
        "name":"YumeSubs",
        "alternateName":["YumeLyrics","Yume Subs","yumelyrics"],
        "url":BASE_URL,
        "description":"Website lirik lagu Jepang lengkap dengan romaji dan terjemahan bahasa Indonesia.",
        "potentialAction":{
          "@type":"SearchAction",
          "target":{"@type":"EntryPoint","urlTemplate":`${BASE_URL}/index.html?q={search_term_string}`},
          "query-input":"required name=search_term_string"
        },
        "publisher":{
          "@type":"Organization",
          "name":"YumeSubs",
          "url":BASE_URL,
          "logo":{"@type":"ImageObject","url":`${BASE_URL}/anime_icon.png`,"width":512,"height":512}
        }
      },
      "breadcrumb":{
        "@type":"BreadcrumbList",
        "itemListElement":[
          {"@type":"ListItem","position":1,"name":"Beranda","item":BASE_URL},
          {"@type":"ListItem","position":2,"name":"Katalog","item":`${BASE_URL}/index.html`},
          {"@type":"ListItem","position":3,"name":`${titleMain} - ${artist}`,"item":`${BASE_URL}/lagu/${slug}`}
        ]
      },
      "mainEntity":{
        "@type":"MusicComposition",
        "name":titleMain,
        "composer":{"@type":"MusicGroup","name":artist}
      }
    },
    {
      "@context":"https://schema.org",
      "@type":"Article",
      "headline":`Lirik ${titleMain} - ${artist} + Terjemahan Indonesia`,
      "description":metaDesc,
      "url":`${BASE_URL}/lagu/${slug}`,
      "inLanguage":"id",
      "datePublished":"2025-01-01",
      "dateModified":today,
      "author":{"@type":"Organization","name":"YumeSubs","url":BASE_URL},
      "publisher":{
        "@type":"Organization",
        "name":"YumeSubs",
        "url":BASE_URL,
        "logo":{"@type":"ImageObject","url":`${BASE_URL}/anime_icon.png`,"width":512,"height":512}
      },
      "image": song.img ? {"@type":"ImageObject","url":song.img,"width":600,"height":600} : {"@type":"ImageObject","url":`${BASE_URL}/anime_icon.png`,"width":512,"height":512},
      "about":[
        {"@type":"Thing","name":titleMain},
        {"@type":"Thing","name":artist},
        ...(anime ? [{"@type":"Thing","name":animeDisplay}] : [])
      ],
      "keywords":[titleMain, artist, anime, animeId, animeEn, "lirik jepang", "terjemahan indonesia", "romaji"].filter(Boolean).join(", "),
      "articleSection":"Lirik Lagu Jepang",
      "isAccessibleForFree":true
    }
  ]);

  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
${THEME_BOOT_SCRIPT}
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1">
<meta name="googlebot" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="author" content="YumeSubs">
<meta name="theme-color" content="#f5f0ea">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="YumeSubs">
<meta name="mobile-web-app-capable" content="yes">
<meta name="readable" content="false">
<meta name="application-name" content="YumeSubs">
<meta name="format-detection" content="telephone=no">
<meta name="copyright" content="YumeSubs — yumelyrics.my.id">
<meta name="geo.region" content="ID">
<meta name="content-language" content="id">
<meta name="classification" content="Entertainment/Music">
<meta name="language" content="Indonesian">
<style>html{-webkit-text-size-adjust:100%}</style>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preconnect" href="https://www.gstatic.com">
<link rel="preconnect" href="https://firestore.googleapis.com">
<link rel="dns-prefetch" href="https://www.youtube.com">
<link rel="dns-prefetch" href="https://nicovideo.cdn.nimg.jp">
<title>Lirik ${escHtml(titleMain)} - ${escHtml(artist)} + Terjemahan Indonesia | YumeSubs</title>
<meta name="description" content="${escHtml(metaDesc)}">
<meta name="keywords" content="${[
  `lirik ${escHtml(titleMain)}`,
  titleDisplay !== titleMain ? `lirik ${escHtml(titleDisplay)}` : '',
  `terjemahan ${escHtml(titleMain)}`,
  `arti lagu ${escHtml(titleMain)}`,
  titleId ? `arti ${escHtml(titleId)}` : '',
  `${escHtml(titleMain)} romaji`,
  `lirik ${escHtml(titleMain)} romaji`,
  `${escHtml(titleMain)} terjemahan indonesia`,
  `${escHtml(artist)} lirik`,
  `${escHtml(artist)} ${escHtml(titleMain)}`,
  anime ? `lirik ost ${escHtml(animeDisplay)}` : '',
  anime ? `${escHtml(anime)} ${escHtml(titleMain)}` : '',
  animeId ? `${escHtml(animeId)} ost` : '',
  animeEn ? `${escHtml(animeEn)} ost` : '',
  songType && anime ? `${songType} ${escHtml(animeDisplay)}` : '',
  'lirik lagu jepang terjemahan indonesia',
  'anime ost lirik',
  'YumeSubs',
].filter(Boolean).join(', ')}">
<meta property="og:title" content="Lirik ${escHtml(titleMain)} - ${escHtml(artist)} | YumeSubs">
<meta property="og:description" content="${escHtml(metaDesc)}">
<meta property="og:url" content="${BASE_URL}/lagu/${slug}">
<meta property="og:type" content="music.song">
<meta property="og:site_name" content="YumeSubs">
<meta property="og:locale" content="id_ID">
${song.img?`<meta property="og:image" content="${escHtml(song.img)}">
<meta property="og:image:secure_url" content="${escHtml(song.img)}">
<meta property="og:image:alt" content="Cover ${escHtml(titleMain)} - ${escHtml(artist)}">
<meta property="og:image:width" content="600">
<meta property="og:image:height" content="600">` : `<meta property="og:image" content="${BASE_URL}/anime_icon.png">`}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:site" content="@YumeSubs">
<meta name="twitter:title" content="Lirik ${escHtml(titleMain)} - ${escHtml(artist)} | YumeSubs">
<meta name="twitter:description" content="${escHtml(metaDesc)}">
${song.img?`<meta name="twitter:image" content="${escHtml(song.img)}">` : `<meta name="twitter:image" content="${BASE_URL}/anime_icon.png">`}
<link rel="canonical" href="${BASE_URL}/lagu/${slug}">
<link rel="alternate" hreflang="id" href="${BASE_URL}/lagu/${slug}">
<link rel="alternate" hreflang="x-default" href="${BASE_URL}/lagu/${slug}">
<link rel="icon" type="image/jpeg" href="../anime_icon.png">
<link rel="stylesheet" href="https://unpkg.com/@waline/client@3/dist/waline.css">
<script type="application/ld+json">${schema}</script>
${FONT_HEAD}
<style>
${CSS_TOKENS}
/* ── NIGHT MODE (halaman lagu) ── */
[data-theme="dark"] body{background:var(--paper);color:var(--ink)}
[data-theme="dark"] nav{background:rgba(15,13,11,.92)}
[data-theme="dark"] .hero{background:var(--paper)}
[data-theme="dark"] .hero-visual::before{background:radial-gradient(ellipse at 60% 40%,rgba(232,180,200,.1) 0%,transparent 60%),radial-gradient(ellipse at 60% 40%,rgba(212,169,110,.08) 0%,transparent 65%)}
[data-theme="dark"] .cover-img{filter:sepia(.15) contrast(1.05) brightness(.85)}
[data-theme="dark"] .related-section{background:var(--cream)}
[data-theme="dark"] .related-card{background:rgba(232,226,217,.03)}
[data-theme="dark"] footer{background:#070604}
[data-theme="dark"] #nav-user-dropdown{background:var(--cream)}
[data-theme="dark"] .ep-box{background:var(--cream)}
[data-theme="dark"] .cmi{color:var(--ink)}
[data-theme="dark"] .lyric-item:hover{background:rgba(201,169,110,.04)}
[data-theme="dark"] .kanji-bg{color:rgba(212,169,110,.06)}
/* ── theme toggle ── */
#theme-toggle{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;background:none;border:1px solid var(--border);cursor:pointer;transition:var(--nm-transition),transform .2s;flex-shrink:0;position:relative;overflow:hidden}
#theme-toggle:hover{border-color:var(--ash);transform:rotate(15deg)}
@media(hover:none){#theme-toggle:hover{transform:none}}
#theme-toggle svg{width:14px;height:14px;stroke:var(--ash);fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;transition:opacity .25s,transform .25s;position:absolute}
#theme-toggle .icon-sun{opacity:1;transform:scale(1)}
#theme-toggle .icon-moon{opacity:0;transform:scale(.7) rotate(45deg)}
[data-theme="dark"] #theme-toggle .icon-sun{opacity:0;transform:scale(.7) rotate(-45deg)}
[data-theme="dark"] #theme-toggle .icon-moon{opacity:1;transform:scale(1) rotate(0)}
/* ── Anti Reader Mode ── */
.rm-poison{font-size:1px;line-height:1px;color:transparent;background:transparent;border:none;padding:0;margin:0;max-height:1px;overflow:hidden}
.rm-decoy{font-size:1px;color:transparent;overflow:hidden;max-height:1px}
*{margin:0;padding:0;box-sizing:border-box;-webkit-user-select:none;-moz-user-select:none;-ms-user-select:none;user-select:none}
/* Saat theme toggle aktif, matikan semua transisi sementara supaya tidak berat */
.no-transition,html.no-transition *{transition:none!important}
input,textarea,*[contenteditable]{-webkit-user-select:text;-moz-user-select:text;user-select:text}
html,body{margin:0;padding:0}
html{scroll-behavior:smooth;background:var(--paper);scrollbar-gutter:stable}
body{background:var(--paper);color:var(--ink);font-family:var(--sans);min-height:100dvh;overflow-x:hidden;position:relative;-webkit-touch-callout:none;transition:var(--nm-transition)}
nav{transition:var(--nm-transition)}
::-webkit-scrollbar{width:3px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:rgba(10,8,18,.15)}

/* ── NAV ── */
nav{display:flex;align-items:center;justify-content:space-between;padding:1.4rem 3rem;border-bottom:1px solid rgba(10,8,18,.08);position:sticky;top:0;z-index:100;background:rgba(245,240,234,.9);backdrop-filter:blur(20px)}
.nav-brand{display:flex;flex-direction:column;gap:.05rem;text-decoration:none}
.nav-brand-jp{font-family:var(--jp);font-size:1.05rem;font-weight:600;color:var(--ink);letter-spacing:.1em}
.nav-brand-en{font-size:.55rem;font-weight:700;letter-spacing:.3em;text-transform:uppercase;color:var(--ash)}
.nav-links{display:flex;gap:2rem;align-items:center}
.nav-link{font-size:.72rem;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:var(--ash);text-decoration:none;transition:color .2s}
.nav-link:hover{color:var(--ink)}
.nav-link-mobile{display:none} /* tampil hanya di mobile */

/* ── HERO ── */
.hero{display:grid;grid-template-columns:1fr 1fr;min-height:88vh;position:relative;overflow:hidden}
.hero::after{content:'';position:absolute;left:50%;top:8%;bottom:8%;width:1px;background:linear-gradient(180deg,transparent,rgba(10,8,18,.12) 30%,rgba(10,8,18,.12) 70%,transparent)}
.hero-text{display:flex;flex-direction:column;justify-content:center;padding:5rem 4rem 5rem 3.5rem;position:relative}
.hero-text::before{content:'01';position:absolute;top:4rem;left:3.5rem;font-family:var(--serif);font-size:.75rem;font-weight:300;color:var(--smoke);letter-spacing:.3em}
.breadcrumb{display:flex;align-items:center;gap:.5rem;font-size:.58rem;font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:var(--ash);margin-bottom:3.5rem;margin-top:1rem}
.breadcrumb-sep{color:var(--smoke);font-size:.5rem}
.breadcrumb a{text-decoration:none;color:inherit;transition:color .2s}
.breadcrumb a:hover{color:var(--gold)}
.breadcrumb span{color:var(--gold)}
.song-type{font-size:.58rem;font-weight:700;letter-spacing:.3em;text-transform:uppercase;color:var(--rose);display:flex;align-items:center;gap:.6rem;margin-bottom:1.2rem}
.song-type::before{content:'';width:2rem;height:1px;background:var(--rose);display:block}
.song-title-jp{font-family:var(--jp);font-size:3.2rem;font-weight:300;color:var(--ink);line-height:1.1;letter-spacing:.04em;margin-bottom:.5rem}
.song-title-ro{font-family:var(--serif);font-size:1.5rem;font-weight:300;font-style:italic;color:var(--ash);letter-spacing:.05em;margin-bottom:.3rem}
.song-title-id{font-size:.72rem;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--smoke);margin-bottom:2.5rem}
.meta-row{display:flex;gap:2.5rem;margin-bottom:3rem}
.meta-item{display:flex;flex-direction:column;gap:.3rem}
.meta-label{font-size:.52rem;font-weight:700;letter-spacing:.25em;text-transform:uppercase;color:var(--smoke)}
.meta-value{font-family:var(--serif);font-size:1.05rem;font-weight:400;color:var(--ink)}
.meta-value a{color:inherit;text-decoration:none;border-bottom:1px solid var(--smoke);padding-bottom:.05rem;transition:border-color .2s}
.meta-value a:hover{border-color:var(--gold)}
.hero-actions{display:flex;gap:.75rem;align-items:center;flex-wrap:wrap}
.btn-primary{font-size:.65rem;font-weight:700;letter-spacing:.2em;text-transform:uppercase;background:var(--ink);color:var(--paper);border:none;padding:.75rem 1.8rem;border-radius:0;cursor:pointer;transition:all .2s;text-decoration:none;display:inline-block}
.btn-primary:hover{background:var(--gold);color:var(--ink)}
.btn-ghost{font-size:.65rem;font-weight:700;letter-spacing:.2em;text-transform:uppercase;background:none;color:var(--ash);border:1px solid rgba(10,8,18,.2);padding:.75rem 1.5rem;border-radius:0;cursor:pointer;transition:all .2s;text-decoration:none;display:inline-flex;align-items:center;gap:.5rem}
.btn-ghost:hover{border-color:var(--ink);color:var(--ink)}

/* ── HERO VISUAL ── */
.hero-visual{position:relative;display:flex;align-items:center;justify-content:center;padding:4rem 3.5rem 4rem 4rem;overflow:hidden}
.hero-visual::before{content:'';position:absolute;inset:0;background:radial-gradient(ellipse at 55% 35%,rgba(232,180,200,.14) 0%,transparent 55%),radial-gradient(ellipse at 60% 40%,rgba(201,169,110,.12) 0%,transparent 65%)}
.cover-wrap{position:relative;z-index:1}
.cover-frame{width:320px;height:320px;position:relative}
.cover-img{width:100%;height:100%;object-fit:cover;display:block;filter:sepia(.15) contrast(1.05);box-shadow:12px 16px 0 rgba(10,8,18,.08),24px 32px 0 rgba(10,8,18,.04)}
.corner{position:absolute;width:20px;height:20px;border-color:var(--gold);border-style:solid}
.corner-tl{top:-8px;left:-8px;border-width:1px 0 0 1px}
.corner-tr{top:-8px;right:-8px;border-width:1px 1px 0 0}
.corner-bl{bottom:-8px;left:-8px;border-width:0 0 1px 1px}
.corner-br{bottom:-8px;right:-8px;border-width:0 1px 1px 0}
.cover-stats{display:flex;gap:2rem;margin-top:2rem;padding-top:1.5rem;border-top:1px solid rgba(10,8,18,.1)}
.stat{display:flex;flex-direction:column;gap:.25rem;text-align:center}
.stat-num{font-family:var(--serif);font-size:1.5rem;font-weight:300;color:var(--ink);line-height:1}
.stat-lbl{font-size:.5rem;font-weight:700;letter-spacing:.25em;text-transform:uppercase;color:var(--smoke)}
.kanji-bg{position:absolute;right:2rem;top:50%;transform:translateY(-50%);font-family:var(--jp);font-size:14rem;font-weight:600;color:rgba(196,99,122,.05);line-height:1;pointer-events:none;user-select:none;z-index:0}

/* ── DIVIDER ── */
.section-divider{display:flex;align-items:center;gap:2rem;padding:0 3.5rem;margin:0}
.divider-line{flex:1;height:1px;background:rgba(10,8,18,.1)}
[data-theme="dark"] .divider-line{background:rgba(232,226,217,.1)}
.divider-ornament{font-family:var(--serif);font-size:.85rem;font-weight:300;font-style:italic;color:var(--ash);white-space:nowrap;letter-spacing:.1em}

/* ── LYRICS SECTION ── */
.lyrics-section{display:grid;grid-template-columns:220px 1fr;gap:0;min-height:100vh;overflow:hidden}
.lyrics-sidebar{padding:4rem 2.5rem 4rem 3.5rem;border-right:1px solid rgba(10,8,18,.08);position:sticky;top:64px;height:calc(100vh - 64px);overflow-y:auto;display:flex;flex-direction:column;gap:2.5rem}
.sidebar-section-label{font-size:.58rem;font-weight:700;letter-spacing:.25em;text-transform:uppercase;color:var(--smoke);margin-bottom:1rem;display:block}
.toggle-group{display:flex;flex-direction:column;gap:.35rem}
.toggle-item{display:flex;align-items:center;justify-content:space-between;cursor:pointer;padding:.4rem 0;border-bottom:1px solid rgba(10,8,18,.06)}
.toggle-label{font-size:.78rem;font-weight:600;letter-spacing:.08em;color:var(--ash);transition:color .15s}
.toggle-item:hover .toggle-label{color:var(--ink)}
.toggle-switch{width:28px;height:16px;border-radius:8px;border:1.5px solid rgba(10,8,18,.2);background:transparent;position:relative;transition:all .2s;cursor:pointer}
.toggle-switch.on{background:var(--gold);border-color:var(--gold)}
.toggle-switch::after{content:'';position:absolute;top:2px;left:2px;width:10px;height:10px;border-radius:50%;background:var(--ash);transition:all .2s}
.toggle-switch.on::after{left:14px;background:#fff}
.thumbs-block{display:flex;flex-direction:column;gap:.75rem}

/* ── LYRICS MAIN ── */
.lyrics-main{padding:4rem 4rem 6rem 4rem;position:relative}
.mood-row{display:flex;flex-wrap:wrap;gap:.4rem;margin-top:1rem;margin-bottom:.5rem}
.mood-chip{font-size:.58rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;padding:.28rem .65rem;border:1px solid rgba(201,169,110,.35);color:var(--gold);background:rgba(201,169,110,.08)}
.study-modes{display:flex;flex-wrap:wrap;gap:.35rem;margin-top:.5rem}
.study-btn{font-family:var(--sans);font-size:.55rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;padding:.38rem .55rem;border:1px solid var(--border);background:transparent;color:var(--ash);cursor:pointer;transition:background .15s,color .15s,border-color .15s}
.study-btn:hover{border-color:var(--gold);color:var(--ink)}
.study-btn.on{background:rgba(201,169,110,.12);border-color:var(--gold);color:var(--ink)}
.study-hint{font-size:.62rem;color:var(--ash);line-height:1.55;margin-top:.5rem;font-style:italic}
.learn-meta-row{display:flex;flex-wrap:wrap;gap:.4rem;margin-top:.75rem;margin-bottom:.25rem}
.learn-chip{font-size:.56rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;padding:.28rem .6rem;border:1px solid var(--border)}
.learn-chip.jlpt{color:var(--gold);border-color:rgba(201,169,110,.4);background:rgba(201,169,110,.08)}
.learn-chip.diff-easy{color:#2d7a4a;border-color:rgba(45,122,74,.35);background:rgba(45,122,74,.08)}
.learn-chip.diff-med{color:var(--dusk);border-color:rgba(107,91,122,.3);background:rgba(107,91,122,.08)}
.learn-chip.diff-hard{color:var(--rose);border-color:rgba(196,99,122,.35);background:rgba(196,99,122,.1)}
.progress-panel{margin-top:.5rem;padding-top:1rem;border-top:1px solid var(--border)}
.progress-bar{height:4px;background:var(--border);margin:.5rem 0 .4rem;overflow:hidden}
.progress-fill{height:100%;background:linear-gradient(90deg,var(--sakura),var(--gold));transition:width .35s ease}
.progress-text{font-size:.62rem;color:var(--ash);line-height:1.45}
.ll-item{position:relative;pointer-events:none}
.line-actions{pointer-events:auto;position:relative;z-index:4}
.lyric-left,.lyric-right,.ljp,.lro,.lid{pointer-events:none;-webkit-tap-highlight-color:transparent}
body.mode-quiz .ll-item,body.mode-karaoke .ll-item{pointer-events:auto}
body.mode-quiz .lyric-left,body.mode-quiz .lyric-right,body.mode-quiz .ljp,body.mode-quiz .lid,
body.mode-karaoke .lyric-left,body.mode-karaoke .lyric-right,body.mode-karaoke .ljp,body.mode-karaoke .lid{pointer-events:auto}
.line-actions{position:absolute;top:.55rem;right:.35rem;z-index:12;display:flex;flex-direction:column;align-items:flex-end;gap:.3rem}
.line-bunpou-btn{font-family:var(--jp);font-size:.72rem;font-weight:600;line-height:1;letter-spacing:.06em;padding:.32rem .5rem;border:1px solid rgba(201,169,110,.45);background:linear-gradient(165deg,var(--paper) 0%,var(--cream) 100%);color:var(--ink);cursor:pointer;box-shadow:0 2px 12px rgba(10,8,18,.06);transition:transform .2s,border-color .2s,box-shadow .2s,color .2s,background .2s}
.line-bunpou-btn:hover{border-color:var(--gold);color:var(--rose);transform:translateY(-1px);box-shadow:0 4px 18px rgba(196,99,122,.15)}
.line-bunpou-btn:active{transform:translateY(0)}
.ll-item.bunpou-line-active .line-bunpou-btn{border-color:var(--rose);background:rgba(196,99,122,.08);color:var(--rose)}
.line-share-btn{opacity:0;border:none;background:transparent;color:var(--smoke);cursor:pointer;font-size:.7rem;padding:.15rem .35rem;transition:opacity .15s,color .15s}
.ll-item:hover .line-share-btn{opacity:1}
.line-share-btn:hover{color:var(--gold)}
@media(max-width:768px){.line-actions{top:.4rem;right:.2rem}.line-share-btn{opacity:.55}}
/* ── Popup Bunpou ── */
.bunpou-overlay{position:fixed;inset:0;z-index:500;display:flex;align-items:center;justify-content:center;padding:1.25rem;background:rgba(10,8,18,.42);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);opacity:0;visibility:hidden;pointer-events:none;transition:opacity .28s ease,visibility .28s}
.bunpou-overlay.is-open{opacity:1;visibility:visible;pointer-events:auto}
.bunpou-modal{position:relative;width:min(440px,calc(100vw - 2rem));max-height:min(82vh,640px);overflow:hidden;display:flex;flex-direction:column;background:var(--paper);border:1px solid rgba(201,169,110,.35);box-shadow:0 24px 80px rgba(10,8,18,.22),0 0 0 1px rgba(232,180,200,.12) inset;transform:translateY(16px) scale(.97);opacity:0;transition:transform .32s cubic-bezier(.22,1,.36,1),opacity .28s ease}
.bunpou-overlay.is-open .bunpou-modal{transform:translateY(0) scale(1);opacity:1}
.bunpou-modal::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,var(--sakura),var(--gold),var(--rose));opacity:.85}
.bunpou-modal::after{content:'夢';position:absolute;right:-.5rem;top:2.5rem;font-family:var(--jp);font-size:5.5rem;font-weight:600;color:rgba(196,99,122,.05);pointer-events:none;line-height:1}
.bunpou-close{position:absolute;top:.65rem;right:.65rem;z-index:2;width:2rem;height:2rem;border:1px solid var(--border);background:var(--cream);color:var(--ash);font-size:1.1rem;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .2s,border-color .2s,color .2s,transform .2s}
.bunpou-close:hover{border-color:var(--rose);color:var(--rose);background:var(--paper);transform:rotate(90deg)}
.bunpou-head{padding:1.35rem 3rem 1rem 1.35rem;border-bottom:1px solid var(--border);background:linear-gradient(180deg,rgba(232,180,200,.08) 0%,transparent 100%)}
.bunpou-kanji{display:block;font-family:var(--jp);font-size:1.75rem;font-weight:600;color:var(--ink);line-height:1.1}
.bunpou-sub{display:block;font-size:.52rem;font-weight:700;letter-spacing:.28em;text-transform:uppercase;color:var(--gold);margin-top:.35rem}
.bunpou-body{padding:1.1rem 1.35rem 1.35rem;overflow-y:auto;flex:1}
.bunpou-line-tag{font-size:.55rem;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:var(--smoke);margin-bottom:.65rem}
.bunpou-lyric-block{padding:.85rem 1rem;background:var(--cream);border-left:2px solid var(--rose);margin-bottom:.85rem}
.bunpou-jp{font-family:var(--jp);font-size:1.05rem;line-height:1.55;color:var(--ink)}
.bunpou-ro{font-family:var(--serif);font-size:.82rem;font-style:italic;color:var(--ash);line-height:1.5;margin-top:.45rem;letter-spacing:.02em}
.bunpou-ro:empty{display:none}
.bunpou-ro-lbl{font-size:.48rem;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:var(--smoke);margin-top:.5rem;display:block}
.bunpou-summary{font-family:var(--serif);font-size:.88rem;font-style:italic;color:var(--ash);line-height:1.65;margin-bottom:1rem}
.bunpou-list{display:flex;flex-direction:column;gap:.55rem}
.bunpou-legend{font-size:.62rem;color:var(--ash);line-height:1.6;margin-bottom:.85rem;padding:.55rem .65rem;background:var(--cream);border:1px dashed var(--border)}
.bunpou-legend strong{color:var(--ink);font-weight:600}
.bunpou-legend-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:.35rem .5rem;margin-top:.45rem}
.bunpou-legend-item{font-size:.54rem;color:var(--smoke);line-height:1.4}
.bunpou-legend-item b{color:var(--ink);font-weight:700}
.bunpou-group-title{font-size:.54rem;font-weight:700;letter-spacing:.22em;text-transform:uppercase;color:var(--smoke);margin:1rem 0 .45rem;padding-bottom:.35rem;border-bottom:1px solid var(--border)}
.bunpou-group-title:first-child{margin-top:0}
.bunpou-item{padding:.65rem .75rem;border:1px solid var(--border);background:var(--mist);transition:border-color .2s,background .2s;margin-bottom:.45rem}
.bunpou-item:hover{border-color:rgba(201,169,110,.5);background:rgba(201,169,110,.06)}
.bunpou-item-top{display:flex;align-items:center;justify-content:space-between;gap:.5rem;margin-bottom:.35rem;flex-wrap:wrap}
.bunpou-item-type{font-size:.52rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;padding:.15rem .45rem;border:1px solid}
.bunpou-item--partikel .bunpou-item-type{color:var(--rose);border-color:rgba(196,99,122,.4);background:rgba(196,99,122,.08)}
.bunpou-item--pola .bunpou-item-type{color:var(--plum);border-color:rgba(124,77,110,.35);background:rgba(124,77,110,.06)}
.bunpou-item--bentuk .bunpou-item-type{color:#3d5a80;border-color:rgba(61,90,128,.35);background:rgba(61,90,128,.06)}
.bunpou-item--sopan .bunpou-item-type{color:var(--gold);border-color:rgba(201,169,110,.4);background:rgba(201,169,110,.08)}
.bunpou-item--penghubung .bunpou-item-type{color:#2d6a5a;border-color:rgba(45,106,90,.35);background:rgba(45,106,90,.08)}
.bunpou-item--ekspresi .bunpou-item-type{color:var(--ash);border-color:var(--border);background:var(--paper)}
.bunpou-item--slang .bunpou-item-type{color:#8b5a2b;border-color:rgba(139,90,43,.35);background:rgba(139,90,43,.08)}
.bunpou-item-char{font-family:var(--jp);font-size:1rem;color:var(--rose);font-weight:600}
.bunpou-item-label{font-size:.58rem;font-weight:600;letter-spacing:.06em;color:var(--ink);margin-top:.15rem}
.bunpou-levels{display:flex;flex-wrap:wrap;gap:.3rem;margin-top:.5rem}
.bunpou-lv-chip{font-size:.5rem;font-weight:700;letter-spacing:.1em;padding:.12rem .4rem;border:1px solid}
.bunpou-lv-chip.n5{color:var(--gold);border-color:rgba(201,169,110,.45);background:rgba(201,169,110,.08)}
.bunpou-lv-chip.n4{color:#2d6a5a;border-color:rgba(45,106,90,.4);background:rgba(45,106,90,.08)}
.bunpou-lv-chip.n3{color:#3d5a80;border-color:rgba(61,90,128,.4);background:rgba(61,90,128,.08)}
.bunpou-lv-chip.n2{color:var(--plum);border-color:rgba(124,77,110,.4);background:rgba(124,77,110,.08)}
.bunpou-lv-chip.n1{color:var(--rose);border-color:rgba(196,99,122,.45);background:rgba(196,99,122,.1)}
.bunpou-item-lvl{font-size:.48rem;font-weight:700;letter-spacing:.08em;margin-left:.35rem;padding:.1rem .32rem;border:1px solid;vertical-align:middle}
.bunpou-item-lvl.n5{color:var(--gold);border-color:rgba(201,169,110,.4)}
.bunpou-item-lvl.n4{color:#2d6a5a;border-color:rgba(45,106,90,.35)}
.bunpou-item-lvl.n3{color:#3d5a80;border-color:rgba(61,90,128,.35)}
.bunpou-item-lvl.n2{color:var(--plum);border-color:rgba(124,77,110,.35)}
.bunpou-item-lvl.n1{color:var(--rose);border-color:rgba(196,99,122,.4)}
.bunpou-item-desc{font-size:.68rem;color:var(--ash);line-height:1.55;margin-top:.25rem}
.bunpou-item-rumus{font-size:.65rem;color:var(--plum,#7c4d6e);line-height:1.5;margin-top:.35rem;padding:.35rem .5rem;background:rgba(201,169,110,.12);border-left:2px solid var(--gold,#c9a96e)}
.bunpou-item-rumus strong{font-size:.55rem;letter-spacing:.1em;text-transform:uppercase;color:var(--ash);margin-right:.35rem}
.bunpou-item-contoh{font-size:.65rem;line-height:1.5;margin-top:.35rem;padding:.35rem .5rem;background:rgba(61,90,128,.08);border-left:2px solid #4a6a8a}
.bunpou-item-contoh strong{font-size:.55rem;letter-spacing:.1em;text-transform:uppercase;color:var(--ash);display:block;margin-bottom:.2rem}
.bunpou-item-contoh-jp{font-family:var(--jp);color:var(--ink);display:block;margin-bottom:.12rem}
.bunpou-item-contoh-id{font-size:.62rem;color:var(--ash);display:block}
.bunpou-item-actions{display:flex;align-items:center;justify-content:flex-end;margin-top:.5rem;padding-top:.45rem;border-top:1px dashed var(--border)}
.bunpou-save-btn{font-family:var(--sans);font-size:.52rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;padding:.28rem .55rem;border:1px solid var(--border);background:var(--paper);color:var(--ash);cursor:pointer;transition:border-color .2s,color .2s,background .2s}
.bunpou-save-btn:hover{border-color:var(--gold);color:var(--rose)}
.bunpou-save-btn.is-saved{border-color:var(--rose);color:var(--rose);background:rgba(196,99,122,.08)}
.bunpou-foot-links{display:flex;flex-wrap:wrap;gap:.75rem 1rem;align-items:center}
.bunpou-foot{margin-top:1.1rem;padding-top:1rem;border-top:1px solid var(--border)}
.bunpou-gloss{display:inline-flex;align-items:center;gap:.35rem;font-size:.58rem;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--gold);text-decoration:none}
.bunpou-gloss:hover{color:var(--rose)}
.bunpou-empty{font-size:.75rem;color:var(--ash);font-style:italic;line-height:1.6}
body.bunpou-open{overflow:hidden}
[data-theme="dark"] .bunpou-overlay{background:rgba(0,0,0,.65)}
[data-theme="dark"] .bunpou-modal{box-shadow:0 28px 90px rgba(0,0,0,.55)}
[data-theme="dark"] .line-bunpou-btn{background:linear-gradient(165deg,var(--cream) 0%,#14110f 100%);border-color:rgba(212,169,110,.35)}
body.mode-quiz .lid{opacity:0!important;filter:blur(6px);pointer-events:none;transition:opacity .25s,filter .25s}
body.mode-quiz .ll-item.revealed .lid{opacity:1!important;filter:none!important;pointer-events:auto}
body.mode-quiz .ll-item{cursor:pointer}
body.mode-karaoke .ll-item{opacity:.32;transition:opacity .2s}
body.mode-karaoke .ll-item.karaoke-active{opacity:1}
body.mode-karaoke .ll-item.karaoke-active .ljp{color:var(--gold)}
body.mode-focus .ll-item{display:none}
body.mode-focus .ll-item.focus-visible{display:grid}
body.mode-focus .lyric-num{display:block}
#fav-btn.on{color:var(--rose);border-color:rgba(196,99,122,.4)}
.lyrics-controls{display:flex;align-items:center;flex-wrap:wrap;gap:.6rem 1rem;margin-bottom:3rem;padding-bottom:1.5rem;border-bottom:1px solid rgba(10,8,18,.08)}
.ctrl-pill{font-size:.58rem;font-weight:700;letter-spacing:.18em;text-transform:uppercase;padding:.38rem .9rem;border:1px solid rgba(10,8,18,.15);background:none;color:var(--ash);cursor:pointer;transition:all .18s;font-family:var(--sans)}
.ctrl-pill.active{background:var(--ink);color:var(--paper);border-color:var(--ink)}
.ctrl-pill:hover:not(.active){border-color:var(--ink);color:var(--ink)}
#copy-lyric-btn{display:inline-flex;align-items:center;gap:.4rem;border-color:rgba(201,169,110,.5);color:var(--gold);position:relative}
#copy-lyric-btn::after{display:none}
#copy-lyric-btn:hover:not(:disabled){background:var(--gold);border-color:var(--gold);color:var(--ink)}
#copy-lyric-btn:active:not(:disabled){background:var(--gold);border-color:var(--gold);color:var(--ink)}
#copy-lyric-btn:focus-visible:not(:disabled){outline:2px solid var(--gold);outline-offset:2px}
#copy-lyric-btn:disabled{opacity:.35;cursor:not-allowed}
.ctrl-sep{width:1px;height:20px;background:rgba(10,8,18,.1)}

/* ── LYRICS LIST ── */
#ll{position:relative}
#ll::after{content:'';position:absolute;inset:0;z-index:1;pointer-events:none;-webkit-user-select:none;user-select:none;background:transparent}
body:not(.mode-quiz):not(.mode-karaoke) .ll-item{cursor:default}
/* ── Admin mode: dihandle via JS saja, bukan CSS class ── */
/* CATATAN: class is-admin di body DIHAPUS dari applyAuthState untuk keamanan */
.lyrics-container{display:flex;flex-direction:column;gap:0}
.ll-item{display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid rgba(10,8,18,.06);padding:1.5rem 2.75rem 1.5rem 0;position:relative;transition:background .15s}
body.mode-quiz .ll-item:hover,body.mode-karaoke .ll-item:hover{background:rgba(201,169,110,.04);margin:0 -1rem;padding:1.5rem 2.75rem 1.5rem 1rem}
.ll-item:last-child{border-bottom:none}
/* Sembunyikan lirik sampai JS selesai */
.ljp{font-family:var(--jp);font-size:1.25rem;font-weight:400;color:var(--ink);line-height:1.7;overflow:visible;visibility:hidden;word-break:break-word;overflow-wrap:break-word;display:flex;flex-wrap:wrap;align-items:baseline;gap:0;max-width:100%;-webkit-user-select:none;-moz-user-select:none;-ms-user-select:none;user-select:none}
.lro{font-family:var(--serif);font-size:.96rem;color:var(--gold);font-style:italic;font-weight:300;line-height:1.8;overflow:visible;visibility:hidden;padding-bottom:.1rem;overflow-wrap:anywhere;display:flex;flex-wrap:wrap;align-items:baseline;gap:0;max-width:100%;-webkit-user-select:none;-moz-user-select:none;-ms-user-select:none;user-select:none}
.lid{font-size:.93rem;color:var(--plum);font-weight:400;line-height:1.8;overflow:visible;visibility:hidden;padding-bottom:.1rem;overflow-wrap:anywhere;display:flex;flex-wrap:wrap;align-items:baseline;gap:0;max-width:100%;-webkit-user-select:none;-moz-user-select:none;-ms-user-select:none;user-select:none}
.rdy .ljp,.rdy .lro,.rdy .lid{visibility:visible;transition:opacity .15s}
[data-obf="1"]{display:inline-flex!important;flex-wrap:wrap!important;gap:0!important;width:100%;max-width:100%;overflow:visible;overflow-wrap:break-word;word-break:break-word;align-content:flex-start}
[data-obf="1"] span[data-c]{white-space:nowrap;display:inline;position:relative}
[data-obf="1"] span[data-sp]{white-space:pre;min-width:.25em;display:inline;flex-shrink:0}
.lro.h,.lid.h,.ljp.h{visibility:hidden!important;pointer-events:none}
.lyric-left,.lyric-right{display:flex;flex-direction:column;gap:.4rem}
.lyric-right{padding-left:2rem;border-left:1px solid rgba(10,8,18,.06);min-width:0;overflow-wrap:break-word;word-break:break-word}
.lyric-num{position:absolute;left:-2.5rem;top:1.5rem;font-family:var(--serif);font-size:.72rem;font-weight:300;color:var(--smoke);letter-spacing:.05em}
.lsep{display:none}

/* ── THUMBS (sidebar) ── */
.thumbs-btn{display:flex;align-items:center;gap:.75rem;background:none;border:1.5px solid var(--border);padding:.6rem 1rem;cursor:pointer;transition:all .2s;width:100%;font-family:var(--sans);color:var(--ink)}
.thumbs-btn:hover{border-color:var(--gold);background:rgba(201,169,110,.06)}
.thumbs-btn.voted{border-color:var(--gold);background:rgba(201,169,110,.1)}
.thumbs-btn.pop svg{animation:thumbpop .35s cubic-bezier(.34,1.56,.64,1)}
@keyframes thumbpop{0%{transform:scale(1)}50%{transform:scale(1.4) rotate(-12deg)}100%{transform:scale(1.15)}}
.thumbs-icon{font-size:.95rem;transition:transform .2s;color:var(--ink)}
.thumbs-btn:hover .thumbs-icon,.thumbs-btn.voted .thumbs-icon{transform:scale(1.15)}
#thumbs-count{font-family:var(--serif);font-size:1.05rem;color:var(--ink)}
#thumbs-label{font-size:.58rem;font-weight:700;letter-spacing:.15em;text-transform:uppercase;color:var(--ash);flex:1;text-align:right;min-width:0;word-break:break-word}
.thumbs-wrap{display:none} /* hidden — sidebar version used instead */
[data-theme="dark"] .thumbs-btn{border-color:rgba(232,226,217,.18);background:rgba(232,226,217,.03)}
[data-theme="dark"] .thumbs-btn:hover{border-color:var(--gold);background:rgba(201,169,110,.1)}
[data-theme="dark"] .thumbs-btn.voted{border-color:var(--gold);background:rgba(201,169,110,.14)}

/* ── SPOTIFY & VIDEO ── */
.spbtn,.spotify-btn{display:flex;align-items:center;gap:.6rem;background:#1DB954;border:none;padding:.65rem 1rem;cursor:pointer;font-family:var(--sans);font-size:.62rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#000;text-decoration:none;transition:opacity .2s}
.spbtn:hover,.spotify-btn:hover{opacity:.87}
.spbtn svg{width:14px;height:14px;fill:#000;flex-shrink:0}
.spotify-dot{width:8px;height:8px;border-radius:50%;background:#000}
.ytwrap{margin-top:2rem;display:none} /* video tetap tersedia di-DOM tapi sidebar menggantinya */
.ytframe{width:100%;aspect-ratio:16/9;border:1px solid var(--border);background:#000;display:block}
.nicobtn{display:inline-flex;align-items:center;gap:.5rem;background:#1a1a1a;border:1px solid rgba(255,255,255,.12);font-family:var(--sans);font-size:.62rem;letter-spacing:.12em;text-transform:uppercase;color:#fff;padding:.5rem 1.1rem;cursor:pointer;text-decoration:none;font-weight:700;transition:all .2s;margin-top:1rem}
.nicobtn:hover{background:#333}
.nicothumb{width:100%;aspect-ratio:16/9;object-fit:cover;display:block;margin-top:1rem;filter:sepia(.1)}

/* ── ONLINE COUNTER ── */
/* ── ONLINE COUNTER ── */
#online-counter{display:flex;flex-direction:column;gap:.35rem}
.online-dot-row{display:flex;align-items:center;gap:.55rem}
.online-dot{width:6px;height:6px;border-radius:50%;background:#22c55e;flex-shrink:0;position:relative}
.online-dot::after{content:'';position:absolute;inset:-3px;border-radius:50%;border:1.5px solid rgba(34,197,94,.35);animation:onlineRing 2.2s ease-out infinite}
@keyframes onlineRing{0%{transform:scale(1);opacity:.8}70%{transform:scale(2.2);opacity:0}100%{transform:scale(2.2);opacity:0}}
.online-num{font-family:var(--serif);font-size:1.6rem;font-weight:300;color:var(--ink);line-height:1;letter-spacing:-.01em}
.online-sub{font-size:.48rem;font-weight:700;letter-spacing:.28em;text-transform:uppercase;color:var(--smoke)}

/* ── COPY GATE ── */
#copy-gate{margin:1.5rem 0 .5rem;padding:1.3rem 1.5rem;border:1px solid var(--border);background:var(--mist);display:flex;flex-direction:column;align-items:flex-start;gap:.75rem;position:relative;overflow:hidden}
#copy-gate::before{content:'';position:absolute;left:0;top:0;bottom:0;width:2px;background:var(--gold);opacity:.6}
#copy-gate-title{font-family:var(--serif);font-size:1rem;color:var(--ink);font-weight:300;font-style:italic}
#copy-gate-sub{font-size:.72rem;color:var(--ash);line-height:1.65;font-family:var(--serif)}
.copy-done-badge{display:none;align-items:center;gap:.4rem;font-size:.68rem;color:var(--gold);letter-spacing:.1em;text-transform:uppercase;font-weight:700;font-family:var(--sans)}
.copy-done-badge.show{display:flex}

/* ── RELATED (preview style) ── */
.related-section-block{background:var(--cream);border-top:1px solid rgba(10,8,18,.08);padding:5rem 3.5rem}
[data-theme="dark"] .related-section-block{background:var(--cream)}
.section-header{display:flex;align-items:baseline;gap:2rem;margin-bottom:3rem}
.section-title{font-family:var(--serif);font-size:2.2rem;font-weight:300;font-style:italic;color:var(--ink)}
.section-subtitle{font-size:.58rem;font-weight:700;letter-spacing:.25em;text-transform:uppercase;color:var(--smoke)}
.related-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:1.5rem}
.rc,.related-card{display:flex;gap:1rem;align-items:flex-start;padding:1.25rem;border:1px solid rgba(10,8,18,.08);background:var(--paper);text-decoration:none;transition:all .2s;cursor:pointer;position:relative;overflow:hidden}
.rc::before,.related-card::before{content:'';position:absolute;inset:0;background:rgba(201,169,110,.0);transition:background .2s}
.rc:hover,.related-card:hover{border-color:rgba(10,8,18,.2);transform:translateY(-2px);box-shadow:0 8px 24px rgba(10,8,18,.08)}
.rc:hover::before,.related-card:hover::before{background:rgba(201,169,110,.04)}
.rc-thumb,.related-thumb{width:52px;height:52px;object-fit:cover;flex-shrink:0;filter:sepia(.1)}
.rc-no-img{width:52px;height:52px;display:flex;align-items:center;justify-content:center;font-size:.85rem;color:var(--smoke);background:var(--cream);flex-shrink:0}
.rc-info,.related-info{min-width:0;flex:1;display:flex;flex-direction:column;gap:.25rem}
.rc-title,.related-title{font-family:var(--jp);font-size:.92rem;font-weight:400;color:var(--ink);line-height:1.35;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.related-ro{font-family:var(--serif);font-size:.75rem;font-style:italic;color:var(--ash);overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical}
.rc-artist,.related-artist{font-size:.55rem;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:var(--smoke)}
.rc-arr,.related-arr{font-size:.7rem;color:var(--smoke);flex-shrink:0;margin-top:.2rem;transition:all .2s;font-family:var(--serif)}
.rc:hover .rc-arr,.related-card:hover .related-arr{color:var(--gold);transform:translateX(3px)}
/* related section label (old style in lyrics column) */
.related-section{margin-top:0;padding:0}
.related-label{display:none}
.related-list{display:none}

/* ── ABOUT SECTION ── */
.cmsec{margin-top:2.5rem;padding-top:2rem;border-top:1px solid var(--border);overflow:visible;height:auto;max-height:none}
.cmtit{font-family:var(--serif);font-size:1.4rem;font-weight:300;font-style:italic;color:var(--ink);margin-bottom:1.5rem}

/* ── COMMENTS SECTION (Waline) ── */
.comments-section{padding:5rem 3.5rem;border-top:1px solid rgba(10,8,18,.08)}
#waline{width:100%;--waline-font-size:.88rem;--waline-border-color:rgba(10,8,18,.1);--waline-bgcolor:var(--paper);--waline-bgcolor-hover:var(--cream);--waline-color:var(--ink);--waline-theme-color:var(--rose);--waline-active-color:var(--rose);--waline-border:1px solid var(--border);--waline-avatar-size:36px;--waline-box-shadow:none}
[data-theme="dark"] #waline{--waline-border-color:rgba(232,226,217,.1);--waline-bgcolor:var(--paper);--waline-bgcolor-hover:var(--cream);--waline-color:var(--ink)}
#waline .wl-browser,#waline .wl-os{display:none!important}
#waline .wl-content img{max-width:100%;height:auto;display:block}
/* ── Inline Spoiler ── */
.cm-sp{background:#1a1625;color:transparent;border-radius:3px;padding:0 4px;cursor:pointer;user-select:none;transition:background .2s,color .2s;display:inline}
.cm-sp:hover{background:#2d2440}
.cm-sp.cm-sp-open{background:#ede8f8;color:inherit;cursor:default}
/* ── Spoiler button in Waline toolbar ── */
#yume-spoiler-btn{background:none;border:1px solid rgba(10,8,18,.18);border-radius:4px;padding:3px 8px;font-size:.72rem;font-family:inherit;color:var(--ash,#666);cursor:pointer;display:inline-flex;align-items:center;gap:4px;transition:border-color .15s,background .15s,color .15s;margin-left:4px;vertical-align:middle}
#yume-spoiler-btn:hover{border-color:var(--rose,#e85d7a);color:var(--rose,#e85d7a);background:rgba(232,93,122,.05)}
[data-theme="dark"] #yume-spoiler-btn{border-color:rgba(232,226,217,.22);color:var(--ash,#aaa)}
#waline .wl-input[name="url"],#waline label[for*="url"],#waline .wl-header-item:has(input[name="url"]),#waline .wl-input[name="mail"],#waline label[for*="mail"],#waline .wl-header-item:has(input[name="mail"]){display:none!important}
/* ── Image preview panel ── */
#yume-img-preview{display:flex;flex-wrap:wrap;gap:8px;padding:6px 0 10px}
.yip-item{position:relative;width:80px;height:80px;flex-shrink:0}
.yip-item img{width:80px;height:80px;object-fit:cover;border-radius:6px;display:block;border:1px solid rgba(10,8,18,.12)}
.yip-x{position:absolute;top:-7px;right:-7px;width:20px;height:20px;border-radius:50%;background:#d63031;color:#fff;border:2px solid #fff;cursor:pointer;font-size:13px;line-height:1;padding:0;display:flex;align-items:center;justify-content:center;font-weight:700;box-shadow:0 1px 4px rgba(0,0,0,.22)}
.yip-x:hover{background:#c0392b}
.comment-intro{display:grid;grid-template-columns:1fr 1fr;gap:4rem;margin-bottom:3rem;padding-bottom:3rem;border-bottom:1px solid rgba(10,8,18,.08)}
.comment-heading{font-family:var(--serif);font-size:2.2rem;font-weight:300;font-style:italic;color:var(--ink);line-height:1.2}
.comment-desc{font-size:.82rem;line-height:1.8;color:var(--ash);font-weight:400}
.comment-form-area{display:flex;flex-direction:column;gap:.75rem;margin-top:1.5rem}
/* comment input & form (reusing .cmi) */
.cmform{display:flex;flex-direction:column;gap:.75rem;margin-bottom:2rem}
.cmform.is-admin-form{background:rgba(201,169,110,.04);border:1px solid rgba(201,169,110,.25);padding:1rem;position:relative;overflow:hidden;isolation:isolate}
.cmform.is-admin-form::before{content:'';position:absolute;inset:0;background:url('https://media1.giphy.com/media/v1.Y2lkPTc5MGI3NjExZHVmOGEyb2EydmhzNWxhcTA4NmlxN3JsZjIxeXV2a3MwZDZuNXFjayZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/yarJ7WfdKiAkE/giphy.gif') center/cover no-repeat;opacity:.04;z-index:-1;pointer-events:none}
.cmform.is-admin-form>*{position:relative}
.cmform.is-admin-form .cmi{border-color:rgba(201,169,110,.3)}
.cmform.is-admin-form .cmi:focus{border-color:rgba(201,169,110,.6)}
.admin-form-header{display:flex;align-items:center;gap:.6rem;padding:.4rem .7rem;background:rgba(201,169,110,.08);border:1px solid rgba(201,169,110,.2);margin-bottom:.4rem}
.admin-crown{font-size:1rem;line-height:1}
.admin-form-badge{font-size:.52rem;color:var(--paper);background:var(--plum);padding:.18rem .55rem;letter-spacing:.1em;text-transform:uppercase;font-weight:700}
.admin-form-name{font-size:.75rem;color:var(--rose);font-weight:600}
.admin-form-sub{font-size:.6rem;color:var(--ash);margin-left:auto}
.cmi{background:transparent;border:none;border-bottom:1.5px solid rgba(10,8,18,.15);color:var(--ink);font-family:var(--sans);font-size:.85rem;color:var(--ink);padding:.75rem 0;outline:none;resize:none;transition:border-color .2s;width:100%}
.cmi::placeholder{color:var(--smoke)}
.cmi:focus{border-color:var(--ink)}
[data-theme="dark"] .cmi{color:var(--ink)}
.comment-footer{display:flex;align-items:center;justify-content:space-between;margin-top:.5rem}
.comment-user{font-size:.62rem;font-weight:700;letter-spacing:.15em;text-transform:uppercase;color:var(--ash)}
.sbtn{background:transparent;border:1px solid var(--ink);font-family:var(--sans);font-size:.6rem;letter-spacing:.18em;text-transform:uppercase;color:var(--ink);padding:.65rem 1.6rem;cursor:pointer;transition:all .22s;font-weight:700;position:relative;overflow:hidden}
.sbtn::after{content:'';position:absolute;inset:0;background:var(--ink);transform:scaleX(0);transform-origin:left;transition:transform .22s ease;z-index:0}
.sbtn:hover::after{transform:scaleX(1)}
.sbtn:hover{color:var(--paper)}
.sbtn>*{position:relative;z-index:1}
.sbtn:disabled{opacity:.35;cursor:not-allowed}
.sbtn:disabled::after{display:none}
/* login gate inside comments */
#cm-login-gate{border:1px solid var(--border)!important;background:var(--mist)!important;display:flex;flex-direction:column;gap:.75rem}
.cm-login-gate-hidden{display:none!important}

/* ── COMMENT LIST ── */
.cmlist{display:flex;flex-direction:column;gap:0}
.citem{background:transparent;border:none;border-bottom:1px solid var(--border);padding:1.5rem 0;position:relative;display:flex;flex-direction:column;gap:.5rem}
.citem::before{content:'';position:absolute;left:-1.5rem;top:0;bottom:0;width:1px;background:transparent;transition:background .2s}
.citem:hover::before{background:rgba(201,169,110,.3)}
.citem.is-admin{background:rgba(201,169,110,.04);border-color:rgba(201,169,110,.2);position:relative;overflow:hidden;isolation:isolate;padding:1.2rem;display:flex;flex-direction:column;gap:.4rem}
.citem.is-admin::before{content:'';position:absolute;inset:0;background:url('https://media1.giphy.com/media/v1.Y2lkPTc5MGI3NjExZHVmOGEyb2EydmhzNWxhcTA4NmlxN3JsZjIxeXV2a3MwZDZuNXFjayZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/yarJ7WfdKiAkE/giphy.gif') center/cover no-repeat;opacity:.04;z-index:-1;pointer-events:none}
.citem.is-admin>*{position:relative}
.chdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:.6rem;gap:.5rem;flex-wrap:wrap}
.chdr-left{display:flex;align-items:center;gap:.6rem;flex-wrap:wrap}
.cname{font-size:.78rem;font-weight:700;letter-spacing:.06em;color:var(--ink);font-family:var(--sans)}
.cm-avatar{width:44px;height:44px;border-radius:50%;object-fit:cover;border:1px solid rgba(10,8,18,.1);flex-shrink:0;margin-top:.15rem;filter:sepia(.05)}
.cm-avatar-ph{width:44px;height:44px;border-radius:50%;background:rgba(10,8,18,.06);display:flex;align-items:center;justify-content:center;font-family:var(--serif);font-size:1.1rem;color:var(--ash);flex-shrink:0}
.cm-avatar-crown{width:44px;height:44px;border-radius:50%;background:rgba(201,169,110,.15);display:flex;align-items:center;justify-content:center;font-size:1rem;border:1.5px solid rgba(201,169,110,.3);flex-shrink:0}
.ritem .cm-avatar,.ritem .cm-avatar-ph,.ritem .cm-avatar-crown{width:30px;height:30px;font-size:.8rem}
.cdate{font-size:.6rem;color:var(--smoke);font-family:var(--sans);letter-spacing:.05em}
.ctxt{font-size:.88rem;color:var(--ash);line-height:1.8;font-weight:400}
.cm-mention{color:var(--rose);font-weight:500}
.nocm{font-size:.82rem;color:var(--ash);font-style:italic;font-family:var(--serif);padding:1.5rem 0}
.admin-badge{font-size:.48rem;letter-spacing:.12em;text-transform:uppercase;color:var(--paper);background:var(--plum);padding:.12rem .42rem;font-weight:600}
.admin-cm-header{display:flex;align-items:center;gap:.6rem;margin-bottom:.6rem}
.admin-cm-crown{width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,rgba(201,169,110,.25),rgba(124,77,110,.15));display:flex;align-items:center;justify-content:center;font-size:.95rem;border:1.5px solid rgba(201,169,110,.35);flex-shrink:0}
.admin-cm-info{display:flex;flex-direction:column;gap:.2rem;flex:1}
.admin-cm-name-row{display:flex;align-items:center;gap:.4rem}
.admin-cm-name{font-size:.8rem;color:var(--rose);font-weight:700;font-family:var(--jp)}
.admin-cm-badge{font-size:.45rem;color:var(--paper);background:var(--plum);padding:.12rem .45rem;letter-spacing:.1em;text-transform:uppercase;font-weight:700;border-radius:2px;line-height:1.5}
.admin-cm-date{font-size:.58rem;color:var(--ash)}
.reply-btn{background:none;border:none;font-family:var(--sans);font-size:.56rem;color:var(--smoke);letter-spacing:.18em;text-transform:uppercase;cursor:pointer;padding:.2rem .4rem;transition:color .2s;font-weight:600}
.reply-btn:hover{color:var(--rose)}
.replies{margin-top:.8rem;padding-top:.8rem;border-top:1px solid var(--border);display:flex;flex-direction:column;gap:.7rem}
.ritem{padding:.7rem 1rem;border-left:2px solid var(--border);display:flex;flex-direction:column;gap:.4rem}
.ritem.is-admin{border-left-color:var(--gold);background:rgba(201,169,110,.04)}
.admin-reply-block{display:flex;align-items:flex-start;gap:.6rem;border:1px solid rgba(201,169,110,.2);padding:.6rem .85rem;margin-top:.4rem;position:relative;overflow:hidden;isolation:isolate}
.admin-reply-block::before{content:'';position:absolute;inset:0;background:url('https://media1.giphy.com/media/v1.Y2lkPTc5MGI3NjExZHVmOGEyb2EydmhzNWxhcTA4NmlxN3JsZjIxeXV2a3MwZDZuNXFjayZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/yarJ7WfdKiAkE/giphy.gif') center/cover no-repeat;opacity:.06;z-index:-1;pointer-events:none}
.admin-reply-block::after{content:'';position:absolute;inset:0;background:rgba(245,240,234,.7);z-index:-1;pointer-events:none}
[data-theme="dark"] .admin-reply-block::after{background:rgba(15,13,11,.7)}
.admin-badge-wrap{display:flex;flex-direction:column;align-items:center;gap:.3rem;flex-shrink:0}
.admin-badge-wrap .admin-badge{font-size:.52rem;color:var(--paper);background:var(--plum);padding:.15rem .5rem;letter-spacing:.1em;text-transform:uppercase;font-weight:700;white-space:nowrap}
.admin-name{font-size:.6rem;color:var(--rose);white-space:nowrap}
.admin-reply-text{font-size:.82rem;color:var(--ink);line-height:1.7;flex:1;font-family:var(--serif);font-weight:300}
.reply-form{margin-top:.8rem;padding-top:.8rem;border-top:1px solid var(--border);display:none;flex-direction:column;gap:.5rem}
.reply-form.open{display:flex}
.reply-form .cmi{font-size:.78rem}
.reply-row{display:flex;gap:.5rem}
.reply-row .cmi{flex:1}
.rbtn-cancel{background:none;border:1px solid var(--border);font-family:var(--sans);font-size:.58rem;color:var(--ash);padding:.4rem .8rem;cursor:pointer;letter-spacing:.1em;text-transform:uppercase;transition:all .2s;font-weight:600}
.rbtn-cancel:hover{border-color:var(--red);color:var(--red)}
/* comment thumbs */
.cm-thumbs{display:inline-flex;align-items:center;gap:.3rem;margin-top:.5rem}
.cm-thumb-btn{display:inline-flex;align-items:center;gap:.28rem;background:none;border:1px solid rgba(10,8,18,.12);color:var(--ash);font-size:.68rem;font-family:var(--sans);padding:.22rem .6rem;cursor:pointer;transition:all .18s;line-height:1}
.cm-thumb-btn svg{width:12px;height:12px;flex-shrink:0;transition:transform .18s}
.cm-thumb-btn:hover{border-color:rgba(10,8,18,.3);color:var(--ink)}
.cm-thumb-btn.voted{border-color:var(--rose);color:var(--rose);background:rgba(196,99,122,.06)}
.cm-thumb-btn.voted svg{stroke:var(--rose);transform:scale(1.15)}
.cm-thumb-btn.pop svg{animation:thumbpop .3s cubic-bezier(.34,1.56,.64,1)}
/* photo in comment */
.cm-img-preview-wrap{position:relative;display:inline-block;margin-top:.5rem}
.cm-img-preview{max-width:180px;max-height:140px;object-fit:cover;display:block;cursor:pointer;transition:opacity .18s;border:1px solid var(--border)}
.cm-img-preview:hover{opacity:.85}
.cm-img-remove{position:absolute;top:-6px;right:-6px;background:var(--red);color:#fff;border:none;width:18px;height:18px;font-size:.65rem;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1;padding:0;font-weight:700}
.cm-photo-btn{background:none;border:1px solid rgba(10,8,18,.15);color:var(--ash);font-size:.68rem;padding:.35rem .7rem;cursor:pointer;transition:color .15s,border-color .15s;font-family:var(--sans);letter-spacing:.06em;display:inline-flex;align-items:center;gap:.35rem;margin-top:.3rem;font-weight:600}
.cm-photo-btn:hover{color:var(--ink);border-color:var(--ink)}
.cm-photo-input{display:none}
.cm-posted-img{max-width:260px;max-height:200px;object-fit:cover;cursor:pointer;display:block;margin-top:.5rem;transition:opacity .18s;border:1px solid var(--border)}
.cm-posted-img:hover{opacity:.85}
.cm-delete-btn{background:none;border:none;font-size:.62rem;color:var(--red);cursor:pointer;padding:.2rem .4rem;opacity:.6;transition:opacity .18s;letter-spacing:.04em;font-family:var(--sans);display:inline-flex;align-items:center;gap:.2rem}
.cm-delete-btn:hover{opacity:1;background:rgba(192,57,43,.06)}
/* ban countdown */
.ban-countdown-notice{color:var(--red);font-weight:600}

/* ── FOOTER ── */
footer{background:var(--ink);color:var(--ash);padding:3.5rem;display:flex;align-items:flex-start;justify-content:space-between;gap:3rem}
.footer-brand{display:flex;flex-direction:column;gap:.4rem}
.footer-brand-jp{font-family:var(--jp);font-size:1.4rem;font-weight:300;color:var(--paper);letter-spacing:.08em}
.footer-brand-tagline{font-size:.58rem;font-weight:600;letter-spacing:.22em;text-transform:uppercase;color:rgba(200,191,176,.4)}
.footer-copy{font-size:.6rem;letter-spacing:.1em;color:rgba(200,191,176,.3);margin-top:1.5rem}
.footer-links{display:flex;gap:2.5rem}
.footer-col{display:flex;flex-direction:column;gap:.75rem}
.footer-col-label{font-size:.5rem;font-weight:700;letter-spacing:.3em;text-transform:uppercase;color:rgba(200,191,176,.35);margin-bottom:.25rem}
.footer-link{font-size:.72rem;color:rgba(200,191,176,.55);text-decoration:none;transition:color .2s;letter-spacing:.04em}
.footer-link:hover{color:var(--gold)}

/* ── TOAST ── */
.toast{position:fixed;bottom:2rem;right:2rem;background:var(--ink);color:var(--paper);font-size:.68rem;letter-spacing:.15em;text-transform:uppercase;padding:.7rem 1.4rem;z-index:999;opacity:0;transform:translateY(8px);transition:all .3s;pointer-events:none;box-shadow:0 4px 24px rgba(10,8,18,.15)}
.toast.on{opacity:1;transform:translateY(0)}

/* ── COPY HINT TOAST (GraphComment) ── */
#copy-comment-toast{position:fixed;bottom:2rem;left:50%;transform:translateX(-50%) translateY(12px);z-index:1000;opacity:0;pointer-events:none;transition:opacity .35s ease,transform .35s cubic-bezier(.34,1.2,.64,1);display:flex;align-items:center;gap:.75rem;max-width:min(360px,calc(100vw - 2rem));padding:.75rem 1rem .75rem 1.15rem;background:var(--ink);color:var(--paper);border:1px solid rgba(201,169,110,.28);box-shadow:0 10px 32px rgba(10,8,18,.22);font-family:var(--sans);font-size:.72rem;font-weight:500;letter-spacing:.04em;line-height:1.45}
#copy-comment-toast.on{opacity:1;transform:translateX(-50%) translateY(0);pointer-events:auto}
.cct-text{margin:0;flex:1}
.cct-close{flex-shrink:0;background:none;border:none;color:var(--paper);font-size:1.15rem;line-height:1;cursor:pointer;opacity:.65;padding:0 .15rem;transition:opacity .2s}
.cct-close:hover{opacity:1}
[data-theme="dark"] #copy-comment-toast{border-color:rgba(201,169,110,.38)}
@media(max-width:600px){#copy-comment-toast{bottom:1.2rem;font-size:.68rem}}

/* ── MODALS ── */
#img-lightbox{position:fixed;inset:0;z-index:2000;background:rgba(10,8,18,.85);display:none;align-items:center;justify-content:center;cursor:zoom-out;backdrop-filter:blur(6px)}
#img-lightbox.open{display:flex}
#img-lightbox img{max-width:90vw;max-height:88vh;object-fit:contain;box-shadow:0 8px 48px rgba(0,0,0,.4);user-select:none}
#img-lightbox-close{position:absolute;top:1rem;right:1.2rem;background:none;border:none;color:#fff;font-size:1.6rem;cursor:pointer;opacity:.7;transition:opacity .15s;z-index:10;line-height:1}
#img-lightbox-close:hover{opacity:1}
#editProfileModal{position:fixed;inset:0;z-index:300;background:rgba(10,8,18,.6);display:none;align-items:center;justify-content:center;backdrop-filter:blur(10px)}
#editProfileModal.open{display:flex}
.ep-box{width:100%;max-width:380px;padding:2rem;border:1px solid var(--border);background:var(--paper);display:flex;flex-direction:column;gap:.9rem;margin:1rem;box-shadow:0 16px 48px rgba(10,8,18,.15)}
.ep-title{font-family:var(--jp);font-size:1rem;font-weight:600;color:var(--ink);letter-spacing:.08em}
.ep-avatar-wrap{display:flex;align-items:center;gap:.9rem;padding:.65rem;background:var(--mist);border:1px solid var(--border)}
.ep-avatar-big{width:46px;height:46px;border-radius:50%;object-fit:cover;border:1px solid var(--border)}
.ep-avatar-placeholder-big{width:46px;height:46px;border-radius:50%;background:rgba(10,8,18,.06);display:flex;align-items:center;justify-content:center;font-family:var(--serif);font-size:1.2rem;color:var(--ash);border:1px solid var(--border)}
.ep-info{display:flex;flex-direction:column;gap:.15rem}
.ep-name{font-size:.85rem;color:var(--ink);font-weight:500}
.ep-email{font-size:.62rem;color:var(--ash)}
.ep-field{display:flex;flex-direction:column;gap:.28rem}
.ep-lbl{font-size:.52rem;color:var(--smoke);letter-spacing:.25em;text-transform:uppercase;font-weight:700}
.ep-inp{background:transparent;border:none;border-bottom:1.5px solid var(--border);color:var(--ink);font-family:var(--sans);font-size:.8rem;padding:.55rem 0;outline:none;transition:border-color .2s;width:100%}
.ep-inp:focus{border-color:var(--ink)}
.ep-inp::placeholder{color:var(--smoke)}
.ep-note{font-size:.62rem;color:var(--ash);line-height:1.6;font-family:var(--serif)}
.ep-actions{display:flex;gap:.55rem;margin-top:.2rem}
.ep-save{background:var(--ink);border:none;font-family:var(--sans);font-size:.62rem;letter-spacing:.15em;text-transform:uppercase;color:var(--paper);padding:.6rem 1.1rem;cursor:pointer;font-weight:700;transition:all .2s;flex:1}
.ep-save:hover{background:var(--gold);color:var(--ink)}
.ep-save:disabled{opacity:.4;cursor:not-allowed}
.ep-cancel{background:none;border:1px solid var(--border);font-family:var(--sans);font-size:.62rem;letter-spacing:.1em;text-transform:uppercase;color:var(--ash);padding:.55rem .9rem;cursor:pointer;transition:all .2s;font-weight:600}
.ep-cancel:hover{border-color:var(--red);color:var(--red)}
.ep-img-row{display:flex;align-items:center;gap:.55rem}
.ep-img-btn{background:var(--mist);border:1px solid var(--border);color:var(--ink);font-family:var(--sans);font-size:.62rem;letter-spacing:.1em;text-transform:uppercase;padding:.42rem .85rem;cursor:pointer;transition:all .2s;white-space:nowrap;flex-shrink:0;font-weight:600}
.ep-img-btn:hover{background:rgba(10,8,18,.08)}
.ep-img-status{font-size:.62rem;color:var(--ash);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

/* ── FLOATING AVATAR BUBBLE ── */
#nav-avatar-bubble{position:fixed;bottom:1.4rem;right:1.4rem;z-index:200;display:none;cursor:pointer;user-select:none}
.nav-avatar{width:44px;height:44px;border-radius:50%;border:2px solid rgba(10,8,18,.2);object-fit:cover;box-shadow:0 2px 16px rgba(10,8,18,.15);transition:transform .18s,box-shadow .18s;display:block}
.nav-avatar:hover{transform:scale(1.07);box-shadow:0 4px 24px rgba(10,8,18,.2)}
.nav-avatar-placeholder{width:44px;height:44px;border-radius:50%;border:2px solid rgba(10,8,18,.2);background:var(--cream);display:flex;align-items:center;justify-content:center;font-family:var(--serif);font-size:1.05rem;color:var(--ash);box-shadow:0 2px 16px rgba(10,8,18,.1);transition:transform .18s,box-shadow .18s}
.nav-avatar-placeholder:hover{transform:scale(1.07)}
#nav-avatar-bubble.is-banned .nav-avatar,
#nav-avatar-bubble.is-banned .nav-avatar-placeholder{border-color:var(--red)!important}
#nav-banned-overlay{position:absolute;bottom:-3px;right:-3px;width:18px;height:18px;background:var(--red);border-radius:50%;border:2px solid var(--paper);display:none;align-items:center;justify-content:center;font-size:.6rem;z-index:5;pointer-events:none}
#nav-avatar-bubble.is-banned #nav-banned-overlay{display:flex}

/* ── USER DROPDOWN ── */
#nav-user-dropdown{position:fixed;bottom:5.2rem;right:1.4rem;z-index:201;background:var(--paper);border:1px solid var(--border);padding:.8rem;display:none;flex-direction:column;gap:.4rem;min-width:220px;box-shadow:0 8px 32px rgba(10,8,18,.12);animation:dropUp .15s ease}
@keyframes dropUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
#nav-user-dropdown.open{display:flex}
.nud-name{font-size:.95rem;color:var(--ink);font-weight:600;padding:.4rem .8rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px}
.nud-email{font-size:.72rem;color:var(--ash);padding:0 .8rem .5rem;border-bottom:1px solid var(--border);margin-bottom:.3rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px}
.nud-btn{background:none;border:none;font-family:var(--sans);font-size:.72rem;color:var(--ash);cursor:pointer;padding:.6rem .8rem;text-align:left;letter-spacing:.08em;text-transform:uppercase;transition:color .18s,background .18s;width:100%;font-weight:600}
.nud-btn:hover{color:var(--ink);background:rgba(10,8,18,.04)}
.nud-btn.logout{color:var(--red)}
.nud-btn.logout:hover{background:rgba(192,57,43,.06)}
.nud-role{padding:.1rem .8rem .55rem;display:flex;align-items:center;gap:.4rem;border-bottom:1px solid var(--border);margin-bottom:.3rem}
.nud-role-label{font-size:.6rem;color:var(--ash);letter-spacing:.12em;text-transform:uppercase}
.nud-notif-header{display:flex;align-items:center;justify-content:space-between;padding:.4rem .8rem .3rem;border-top:1px solid var(--border);margin-top:.3rem}
.nud-notif-title{font-size:.6rem;color:var(--ash);letter-spacing:.18em;text-transform:uppercase;font-weight:700}
.nud-notif-clear{background:none;border:none;font-size:.6rem;color:var(--ash);cursor:pointer;padding:0;letter-spacing:.08em;text-transform:uppercase;transition:color .15s;font-weight:600}
.nud-notif-clear:hover{color:var(--rose)}
#nud-notif-list{display:flex;flex-direction:column;gap:0;max-height:280px;overflow-y:auto;margin:0 -.1rem}
.nud-notif-item{padding:.7rem .8rem;cursor:pointer;transition:background .15s;border-left:3px solid transparent;margin:.15rem 0}
.nud-notif-item:hover{background:rgba(10,8,18,.03)}
.nud-notif-item.unread{border-left-color:var(--rose);background:rgba(196,99,122,.04)}
.nud-notif-from{font-size:.78rem;color:var(--rose);font-weight:600;margin-bottom:.2rem}
.nud-notif-msg{font-size:.74rem;color:var(--ink);line-height:1.5;margin-bottom:.2rem;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.nud-notif-meta{font-size:.66rem;color:var(--ash)}
.nud-notif-empty{font-size:.76rem;color:var(--ash);font-style:italic;padding:.6rem .8rem;font-family:var(--serif)}

/* ── ROLE BADGES ── */
.role-badge{display:inline-flex;align-items:center;gap:.2rem;font-size:.52rem;font-weight:700;padding:.15rem .48rem;border-radius:0;letter-spacing:.07em;text-transform:uppercase;vertical-align:middle;white-space:nowrap;line-height:1.4}
.role-0{background:var(--mist);border:1px solid var(--border);color:var(--ash)}
.role-1{background:rgba(39,174,96,.08);border:1px solid rgba(39,174,96,.28);color:#27ae60}
.role-2{background:rgba(41,128,185,.08);border:1px solid rgba(41,128,185,.28);color:#2980b9}
.role-3{background:rgba(124,77,110,.1);border:1px solid rgba(124,77,110,.3);color:var(--plum)}
.role-4{background:rgba(196,99,122,.1);border:1px solid rgba(196,99,122,.3);color:var(--rose)}
.role-5{background:rgba(211,84,0,.1);border:1px solid rgba(211,84,0,.3);color:#d35400}
.role-6{background:rgba(201,169,110,.1);border:1px solid rgba(201,169,110,.4);color:var(--gold)}
.role-7{background:rgba(192,57,43,.1);border:1px solid rgba(192,57,43,.4);color:var(--red)}
.role-custom{background:rgba(124,77,110,.12);border:1px solid rgba(124,77,110,.4);color:var(--plum)}
.cm-banned-badge{display:inline-flex;align-items:center;gap:.2rem;font-size:.52rem;letter-spacing:.1em;text-transform:uppercase;color:var(--red);background:rgba(192,57,43,.08);border:1px solid rgba(192,57,43,.2);padding:.1rem .38rem;font-weight:600;vertical-align:middle}

/* ── ADMIN INLINE EDIT (halaman lagu) ── */
.admin-edit-song-btn{border-color:rgba(201,169,110,.45)!important;color:var(--gold)!important}
.admin-edit-song-btn:hover{background:rgba(201,169,110,.1)!important;border-color:var(--gold)!important}
#songEditOverlay{position:fixed;inset:0;z-index:450;background:rgba(10,8,18,.55);backdrop-filter:blur(10px);display:none;align-items:flex-start;justify-content:center;padding:1rem;padding-top:max(1rem,env(safe-area-inset-top));padding-bottom:max(1rem,env(safe-area-inset-bottom));overflow-y:auto;-webkit-overflow-scrolling:touch}
#songEditOverlay.open{display:flex}
.se-modal{width:100%;max-width:720px;background:var(--paper);border:1px solid var(--border);box-shadow:0 24px 80px rgba(10,8,18,.18);margin:auto 0;animation:fadeUp .25s ease}
[data-theme="dark"] .se-modal{background:var(--cream);box-shadow:0 24px 80px rgba(0,0,0,.45)}
.se-head{display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;padding:1.15rem 1.25rem;border-bottom:1px solid var(--border);position:sticky;top:0;background:var(--paper);z-index:2}
[data-theme="dark"] .se-head{background:var(--cream)}
.se-tit{font-family:var(--serif);font-size:1.15rem;font-style:italic;color:var(--ink)}
.se-sub{font-size:.68rem;color:var(--ash);margin-top:.25rem;line-height:1.5}
.se-close{background:none;border:1px solid var(--border);color:var(--ash);font-size:1rem;width:36px;height:36px;cursor:pointer;flex-shrink:0;border-radius:8px}
.se-close:hover{border-color:var(--red);color:var(--red)}
.se-body{padding:1.15rem 1.25rem 1.5rem;display:flex;flex-direction:column;gap:1rem;max-height:calc(100dvh - 8rem);overflow-y:auto}
.se-sec{font-size:.58rem;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:var(--gold);margin-bottom:.15rem}
.se-grid{display:grid;grid-template-columns:1fr 1fr;gap:.75rem}
.se-field{display:flex;flex-direction:column;gap:.3rem;min-width:0}
.se-field.full{grid-column:1/-1}
.se-lbl{font-size:.58rem;font-weight:700;letter-spacing:.15em;text-transform:uppercase;color:var(--ash)}
.se-inp,.se-ta{background:rgba(10,8,18,.03);border:1px solid var(--border);border-radius:8px;color:var(--ink);font-family:var(--sans);font-size:.85rem;padding:.65rem .75rem;outline:none;width:100%;transition:border-color .2s}
[data-theme="dark"] .se-inp,[data-theme="dark"] .se-ta{background:rgba(232,226,217,.04)}
.se-inp:focus,.se-ta:focus{border-color:var(--gold)}
.se-ta{resize:vertical;min-height:4.5rem;line-height:1.55}
.se-lyrics{display:flex;flex-direction:column;gap:.55rem}
.se-lrow{display:grid;grid-template-columns:1fr 1fr;gap:.45rem;padding:.65rem .65rem .65rem 2.5rem;background:var(--cream);border:1px solid var(--border);border-radius:8px;position:relative}
[data-theme="dark"] .se-lrow{background:rgba(232,226,217,.03)}
.se-lrow .se-inp{font-size:.8rem}
.se-lrow-del{position:absolute;top:.4rem;right:.4rem;width:30px;height:30px;border:1px solid rgba(185,64,64,.3);background:var(--paper);color:var(--red);border-radius:6px;cursor:pointer;font-size:.85rem;line-height:1}
.se-add-row{background:none;border:1px dashed var(--border);color:var(--ash);font-family:var(--sans);font-size:.62rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;padding:.55rem;cursor:pointer;border-radius:8px;width:100%}
.se-add-row:hover{border-color:var(--gold);color:var(--gold)}
.se-foot{display:flex;gap:.5rem;padding:1rem 1.25rem;border-top:1px solid var(--border);position:sticky;bottom:0;background:var(--paper);flex-wrap:wrap}
[data-theme="dark"] .se-foot{background:var(--cream)}
.se-save{flex:1;min-width:140px;background:var(--ink);border:none;color:var(--paper);font-family:var(--sans);font-size:.65rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;padding:.75rem 1rem;border-radius:8px;cursor:pointer;min-height:44px}
.se-save:hover{background:var(--gold);color:var(--ink)}
.se-save:disabled{opacity:.45;cursor:not-allowed}
.se-cancel{background:none;border:1px solid var(--border);color:var(--ash);font-family:var(--sans);font-size:.65rem;font-weight:600;letter-spacing:.1em;text-transform:uppercase;padding:.75rem 1rem;border-radius:8px;cursor:pointer;min-height:44px}
.se-cancel:hover{border-color:var(--red);color:var(--red)}
.se-gen{flex:1;min-width:140px;background:rgba(201,169,110,.12);border:1px solid rgba(201,169,110,.4);color:var(--gold);font-family:var(--sans);font-size:.65rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;padding:.75rem 1rem;border-radius:8px;cursor:pointer;min-height:44px}
.se-gen:hover{background:rgba(201,169,110,.22);border-color:var(--gold)}
.se-gen:disabled{opacity:.45;cursor:not-allowed}
.se-foot-main{display:flex;gap:.5rem;flex-wrap:wrap;width:100%}
.se-gh-status{display:none;align-items:center;gap:.55rem;width:100%;font-size:.72rem;color:var(--ash);flex-wrap:wrap;padding:.35rem 0 0}
.se-gh-status.on{display:flex}
.se-gh-dot{width:8px;height:8px;border-radius:50%;background:var(--ash);flex-shrink:0}
.se-gh-dot.blink{animation:seGhBlink 1s infinite}
@keyframes seGhBlink{0%,100%{opacity:1}50%{opacity:.35}}
.se-gh-link{color:var(--gold);font-size:.62rem;letter-spacing:.08em;text-transform:uppercase;text-decoration:none;border:1px solid rgba(201,169,110,.35);padding:.2rem .55rem;border-radius:6px}
.se-gh-link:hover{border-color:var(--gold)}
.se-gh-token{margin-top:.35rem;width:100%}
.se-gh-token summary{font-size:.62rem;color:var(--ash);cursor:pointer;letter-spacing:.06em}
.se-gh-token-inp{margin-top:.45rem;width:100%;background:rgba(10,8,18,.03);border:1px solid var(--border);border-radius:8px;color:var(--ink);font-family:var(--sans);font-size:.8rem;padding:.55rem .65rem}
[data-theme="dark"] .se-gh-token-inp{background:rgba(232,226,217,.04)}
@media(max-width:768px){
  .se-grid,.se-lrow{grid-template-columns:1fr}
  .se-body{max-height:none}
  .se-foot{flex-direction:column}
  .se-foot-main{flex-direction:column}
  .se-save,.se-gen,.se-cancel{width:100%}
}

/* ── ANIMATIONS ── */
@keyframes fadeUp{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:translateY(0)}}
.hero-text>*{animation:fadeUp .6s ease both}
.hero-text .breadcrumb{animation-delay:.05s}
.hero-text .song-type{animation-delay:.1s}
.hero-text .song-title-jp{animation-delay:.15s}
.hero-text .song-title-ro{animation-delay:.2s}
.hero-text .song-title-id{animation-delay:.22s}
.hero-text .meta-row{animation-delay:.28s}
.hero-text .hero-actions{animation-delay:.35s}
.hero-visual{animation:fadeUp .7s ease .2s both}

/* ── RESPONSIVE ── */
@media(max-width:900px){
  nav{padding:1.2rem 1.5rem}
  /* Sembunyikan nav link desktop, tampilkan yg mobile-only */
  .nav-link{display:none}
  .nav-link-mobile{display:inline-flex}
  #theme-toggle{flex-shrink:0}
  .nav-links{gap:1rem}
  .hero{grid-template-columns:1fr;min-height:auto}
  .hero::after{display:none}
  .hero-text{padding:3rem 1.5rem}
  .hero-text::before{left:1.5rem;top:2rem}
  .hero-visual{padding:2rem 1.5rem 3rem;border-top:1px solid rgba(10,8,18,.08)}
  .song-title-jp{font-size:2.2rem}
  .kanji-bg{font-size:10rem}
  /* Sidebar jadi horizontal 2 kolom di atas lirik */
  .lyrics-section{grid-template-columns:1fr}
  .lyrics-sidebar{
    position:static;height:auto;
    padding:1.2rem 1.5rem;
    border-right:none;border-bottom:1px solid rgba(10,8,18,.08);
    display:grid;
    grid-template-columns:1fr 1fr;
    gap:1.2rem;
    align-items:start;
  }
  /* Online counter span full width */
  .lyrics-sidebar>div:last-child{grid-column:1/-1}
  /* Tombol suka & spotify: full width, tidak overflow keluar sidebar */
  .thumbs-block{display:flex;flex-direction:column;gap:.6rem;min-width:0;overflow:hidden;box-sizing:border-box}
  .thumbs-btn{width:100%;max-width:100%;box-sizing:border-box;min-width:0}
  .spotify-btn{width:100%;max-width:100%;box-sizing:border-box;display:flex;min-width:0}
  .toggle-group{display:flex;flex-direction:column;gap:0;width:100%;overflow:hidden;box-sizing:border-box}
  .toggle-item{min-width:0;overflow:hidden;box-sizing:border-box}
  .toggle-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis}
  .toggle-switch{flex-shrink:0}
  /* Lyrics controls: wrap agar tidak terpotong */
  .lyrics-controls{flex-wrap:wrap;gap:.5rem;margin-bottom:2rem;padding-bottom:1rem}
  .ctrl-pill{font-size:.55rem;padding:.3rem .7rem;white-space:nowrap}
  .lyrics-main{padding:2rem 1.2rem 4rem}
  .ll-item{grid-template-columns:1fr;min-width:0;overflow:visible}
  .lyric-left{min-width:0;overflow:visible}
  .lyric-right{padding-left:0;border-left:none;padding-top:.75rem;border-top:1px solid rgba(10,8,18,.06);min-width:0}
  .ljp,.lro,.lid{max-width:100%;width:100%;overflow:visible;word-break:break-word;overflow-wrap:break-word}
  .lyric-num{display:none}
  /* About section: full visible, no overflow */
  .cmsec{overflow:visible;height:auto;max-height:none}
  .cmsec p{word-break:break-word;overflow-wrap:break-word;white-space:normal}
  .related-grid{grid-template-columns:1fr}
  .comments-section,.related-section-block{padding:3rem 1.5rem}
  .comment-intro{grid-template-columns:1fr;gap:2rem}
  footer{flex-direction:column;padding:2.5rem 1.5rem;gap:2rem}
  .footer-links{flex-wrap:wrap;gap:2rem}
  .section-divider{padding:0 1.5rem}
}
@media(max-width:600px){
  .hero-text{padding:2.5rem 1.2rem}
  .hero-text::before{left:1.2rem}
  /* Sidebar jadi 1 kolom di layar kecil */
  .lyrics-sidebar{
    grid-template-columns:1fr;
    padding:1rem 1.2rem;
    gap:1rem;
    overflow:hidden;
  }
  .lyrics-sidebar>div:last-child{grid-column:1}
  .thumbs-block{min-width:0;width:100%;overflow:hidden;box-sizing:border-box}
  .thumbs-btn{width:100%;box-sizing:border-box;min-width:0;overflow:hidden}
  .spotify-btn{width:100%;box-sizing:border-box;min-width:0;display:flex;overflow:hidden}
  .toggle-group{width:100%;overflow:hidden;box-sizing:border-box}
  .toggle-item{width:100%;box-sizing:border-box;min-width:0;overflow:hidden}
  .toggle-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .toggle-switch{flex-shrink:0}
  .sidebar-section-label{white-space:normal}
  .lyrics-main{padding:1.5rem 1.2rem 4rem}
  .ctrl-pill{font-size:.52rem;padding:.28rem .6rem}
  .related-section-block{padding:2.5rem 1.2rem}
  .comments-section{padding:2.5rem 1.2rem}
  footer{padding:2rem 1.2rem}
  .cmsec{overflow:visible;height:auto;max-height:none;word-break:break-word;overflow-wrap:break-word}
  .cmtit{font-size:1.1rem}
}
@media(max-width:380px){
  nav{padding:.8rem .9rem}
  .nav-brand-en{display:none}
  .ctrl-pill{font-size:.5rem;padding:.25rem .5rem}
}
</style>
</head>
<body>
<div id="bgwrap"></div>
<div class="wrap">

<!-- ── NAV ── -->
<nav>
  <a class="nav-brand" href="../index.html">
    <span class="nav-brand-jp">夢Lyrics</span>
    <span class="nav-brand-en">YumeSubs</span>
  </a>
  <div class="nav-links">
    <a class="nav-link" href="../index.html">Katalog</a>
    <a class="nav-link" href="../artis/index.html">Artis</a>
    <a class="nav-link" href="../stories.html">Cerita</a>
    <a class="nav-link" href="../contact.html">Hubungi</a>
    <a class="nav-link nav-link-mobile" href="../index.html">Katalog</a>
    <button id="theme-toggle" onclick="toggleTheme()" title="Toggle Night/Light Mode" aria-label="Toggle theme">
      <svg class="icon-sun" viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
      <svg class="icon-moon" viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
    </button>
    <div id="nav-user-slot" style="display:none" class="nav-user"></div>
  </div>
</nav>

<!-- ── HERO ── -->
<section class="hero">
  <div class="hero-text">
    <div class="breadcrumb">
      <a href="../index.html">Beranda</a>
      <span class="breadcrumb-sep">›</span>
      <a href="../index.html">Katalog</a>
      ${anime ? `<span class="breadcrumb-sep">›</span><span>${escHtml(animeDisplay)}</span>` : `<span class="breadcrumb-sep">›</span><span>${escHtml(titleMain)}</span>`}
    </div>

    ${(songType || anime) ? `<div class="song-type">${songType ? escHtml(songType.charAt(0).toUpperCase() + songType.slice(1)) : ''}${songType && anime ? ' — ' : ''}${anime ? escHtml(animeDisplay) : ''}${anime && animeEn && animeId !== animeEn ? `<span style="font-weight:400;color:var(--ash)"> (${escHtml(animeEn)})</span>` : ''}</div>` : ''}
    ${anime && animeId && animeId !== animeDisplay ? `<div class="song-title-id" style="margin-top:-1.5rem;margin-bottom:2rem">${escHtml(anime)}</div>` : ''}

    <div class="song-title-jp">${escHtml(titleDisplay)}</div>
    ${titleRo ? `<div class="song-title-ro">${escHtml(titleRo)}</div>` : ''}
    ${titleId ? `<div class="song-title-id">${escHtml(titleId)}</div>` : ''}

    <div class="meta-row">
      <div class="meta-item">
        <span class="meta-label">Artis</span>
        <span class="meta-value"><a href="${artistSlug ? `../artis/${artistSlug}.html` : `../index.html?q=${encodeURIComponent(artist)}`}">${escHtml(artist)}</a></span>
      </div>
      ${anime ? `<div class="meta-item">
        <span class="meta-label">Anime</span>
        <span class="meta-value"><a href="../index.html?q=${encodeURIComponent(anime)}">${escHtml(animeDisplay)}</a>${anime && animeId && anime !== animeId ? `<span style="display:block;font-size:.72rem;color:var(--ash);font-weight:400;margin-top:.15rem;font-family:var(--jp)">${escHtml(anime)}</span>` : ''}${animeEn && animeEn !== animeDisplay ? `<span style="display:block;font-size:.68rem;color:var(--smoke);margin-top:.1rem">${escHtml(animeEn)}</span>` : ''}</span>
      </div>` : ''}
      ${song.genre ? `<div class="meta-item">
        <span class="meta-label">Genre</span>
        <span class="meta-value">${escHtml(song.genre)}</span>
      </div>` : ''}
    </div>

    ${moodChipsHTML}
    ${learnMetaHTML}
    <div class="hero-actions">
      <button class="btn-primary" onclick="window._scrollToLyrics()">↓ Baca Lirik</button>
      <button class="btn-ghost admin-edit-song-btn" id="admin-edit-song-btn" type="button" style="display:none" onclick="openSongEditModal()" title="Edit lagu (admin)">✏ Edit Lagu</button>
      <a class="btn-ghost" href="../latihan.html?song=${escHtml(songId)}&amp;slug=${escHtml(slug)}" style="text-decoration:none">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
        Latihan Terjemah
      </a>
      <button class="btn-ghost" id="fav-btn" type="button" title="Simpan ke favorit — lihat di Katalog → filter Favorit">☆ Favorit</button>
      ${song.ytId ? `<button class="btn-ghost" onclick="window._scrollToMV()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        Tonton MV
      </button>` : ''}
    </div>
  </div>

  <div class="hero-visual">
    <div class="kanji-bg">${escHtml((titleDisplay||'').charAt(0)||'音')}</div>
    <div class="cover-wrap">
      <div class="cover-frame">
        ${song.img
          ? imgTag(song.img, `Cover ${titleMain} - ${artist}`, { cls: 'cover-img', w: 480, h: 480, eager: true, hd: true })
          : `<svg class="cover-img" viewBox="0 0 320 320" xmlns="http://www.w3.org/2000/svg" style="background:#1a1020">
              <defs>
                <radialGradient id="g1" cx="40%" cy="35%">
                  <stop offset="0%" stop-color="#7c3c55"/>
                  <stop offset="50%" stop-color="#2d1535"/>
                  <stop offset="100%" stop-color="#0d0818"/>
                </radialGradient>
              </defs>
              <rect width="320" height="320" fill="url(#g1)"/>
              <text x="160" y="175" font-family="serif" font-size="64" font-weight="300" fill="#c9a96e" opacity=".35" text-anchor="middle">${escHtml((titleDisplay||'').charAt(0)||'音')}</text>
              <text x="160" y="230" font-family="sans-serif" font-size="9" letter-spacing="4" fill="#c9a96e" opacity=".45" text-anchor="middle">${escHtml(artist.toUpperCase())}</text>
            </svg>`
        }
        <div class="corner corner-tl"></div>
        <div class="corner corner-tr"></div>
        <div class="corner corner-bl"></div>
        <div class="corner corner-br"></div>
      </div>
      <div class="cover-stats">
        <div class="stat">
          <div class="stat-num" id="thumbs-count">…</div>
          <div class="stat-lbl">Suka</div>
        </div>
        <div class="stat">
          <div class="stat-num" id="views-count">—</div>
          <div class="stat-lbl">Dibaca</div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- ── DIVIDER ── -->
<div class="section-divider" style="margin:2rem 0">
  <div class="divider-line"></div>
  <div class="divider-ornament">— Lirik Lengkap —</div>
  <div class="divider-line"></div>
</div>

<!-- ── LYRICS ── -->
<section class="lyrics-section" id="lyrics">
  <aside class="lyrics-sidebar">
    <div>
      <span class="sidebar-section-label">Tampilkan</span>
      <div class="toggle-group">
        <div class="toggle-item" onclick="tl('jp')">
          <span class="toggle-label">Jepang (漢字)</span>
          <div class="toggle-switch on" id="sw-jp"></div>
        </div>
        <div class="toggle-item" onclick="tl('ro')">
          <span class="toggle-label">Romaji</span>
          <div class="toggle-switch on" id="sw-ro"></div>
        </div>
        <div class="toggle-item" onclick="tl('tr')">
          <span class="toggle-label">Terjemahan</span>
          <div class="toggle-switch on" id="sw-tr"></div>
        </div>
      </div>
    </div>

    <div>
      <span class="sidebar-section-label">Mode belajar</span>
      <div class="study-modes">
        <button type="button" class="study-btn on" data-mode="" onclick="setStudyMode('')">Normal</button>
        <button type="button" class="study-btn" data-mode="quiz" onclick="setStudyMode('quiz')">Uji ingatan</button>
        <button type="button" class="study-btn" data-mode="karaoke" onclick="setStudyMode('karaoke')">Karaoke</button>
        <button type="button" class="study-btn" data-mode="focus" onclick="setStudyMode('focus')">Satu baris</button>
      </div>
      <p class="study-hint" id="study-hint">Mode normal — semua teks tampil.</p>
    </div>

    <div class="progress-panel" id="progress-panel">
      <span class="sidebar-section-label">Progres baca</span>
      <div class="progress-bar"><div class="progress-fill" id="progress-fill" style="width:0%"></div></div>
      <p class="progress-text" id="progress-text">Memuat…</p>
    </div>

    <div class="thumbs-block">
      <span class="sidebar-section-label">Apresiasi</span>
      <button class="thumbs-btn" id="thumbs-btn" onclick="window.doThumb()" aria-label="Suka lagu ini">
        <span class="thumbs-icon">♡</span>
        <span id="thumbs-count-sb">…</span>
        <span id="thumbs-label">Suka lagu ini?</span>
      </button>
      ${song.sp ? `<a class="spotify-btn" href="${escHtml(song.sp)}" target="_blank" rel="noopener">
        <div class="spotify-dot"></div>
        Dengarkan di Spotify
      </a>` : ''}
    </div>

    <div>
      <span class="sidebar-section-label">Sedang Membaca</span>
      <div id="online-counter">
        <div class="online-dot-row">
          <div class="online-dot"></div>
          <span class="online-num" id="online-count">—</span>
        </div>
        <span class="online-sub">pembaca aktif</span>
      </div>
    </div>
  </aside>

  <main class="lyrics-main">
    <div class="lyrics-controls">
      <button class="ctrl-pill active" data-view="all">Semua</button>
      <button class="ctrl-pill" data-view="jp">Jepang</button>
      <button class="ctrl-pill" data-view="ro">Romaji</button>
      <button class="ctrl-pill" data-view="tr">Terjemahan</button>
      <button class="ctrl-pill" id="focus-prev" type="button" onclick="focusStep(-1)" style="display:none">←</button>
      <button class="ctrl-pill" id="focus-next" type="button" onclick="focusStep(1)" style="display:none">→</button>
      <button class="ctrl-pill" id="copy-lyric-btn" onclick="doCopyLyric()" style="margin-left:auto;opacity:.38;cursor:not-allowed" disabled title="Tinggalkan komentar untuk salin lirik">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="vertical-align:-.1em"><rect x="9" y="9" width="13" height="13" rx="1"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        <span id="copy-btn-label">Copy</span>
      </button>
    </div>

    <div class="lyrics-container" id="ll">
      ${lyricsHTML}
    </div>



    <!-- Tentang Lagu -->
    <div class="cmsec" style="margin-bottom:2rem">
      <div class="cmtit">Tentang Lagu Ini</div>
      <p style="font-size:.82rem;color:var(--muted);line-height:1.8;font-weight:300">
        ${descId ? escHtml(descId) : `<strong style="color:var(--text)">${escHtml(titleMain)}</strong>${titleDisplay && titleRo ? ` (${escHtml(titleDisplay)})` : ''} adalah lagu dari <strong style="color:var(--text)">${escHtml(artist)}</strong>${anime ? ` yang digunakan sebagai ${songType||'lagu'} dalam anime <strong style="color:var(--accent)">${escHtml(animeDisplay)}</strong>${animeEn ? ` (${escHtml(animeEn)})` : ''}${animeId && anime !== animeId ? ` — <em style="color:var(--muted)">${escHtml(anime)}</em>` : ''}` : ''}.${titleId ? ` Dalam bahasa Indonesia, judul lagu ini berarti "<strong style="color:var(--accent)">${escHtml(titleId)}</strong>".` : ''} Di halaman ini kamu bisa membaca lirik lengkap ${escHtml(titleMain)} dengan teks Jepang asli, romaji, dan terjemahan bahasa Indonesia.`}
      </p>
      ${descJp ? `<p style="font-size:.78rem;color:var(--muted);line-height:1.8;font-weight:300;margin-top:.8rem;font-family:var(--jp)">${escHtml(descJp)}</p>` : ''}
    </div>

    <!-- YT / Nico video -->
    ${song.ytId ? `<div id="yt-section" style="margin-bottom:2rem">
      <div style="font-size:.52rem;color:var(--smoke);letter-spacing:.28em;text-transform:uppercase;margin-bottom:.6rem;font-family:var(--sans);font-weight:700">Video</div>
      <iframe class="ytframe" src="https://www.youtube.com/embed/${escHtml(song.ytId)}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
    </div>` : ''}
    ${song.nicoId ? `<div style="margin-bottom:2rem">
      <div style="font-size:.52rem;color:var(--smoke);letter-spacing:.28em;text-transform:uppercase;margin-bottom:.6rem;font-family:var(--sans);font-weight:700">Niconico</div>
      <img class="nicothumb" src="https://nicovideo.cdn.nimg.jp/thumbnails/${escHtml(song.nicoId.replace('sm',''))}/1" alt="thumbnail" loading="lazy" onerror="this.style.display='none'">
      <a class="nicobtn" href="https://www.nicovideo.jp/watch/${escHtml(song.nicoId)}" target="_blank" rel="noopener"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>Tonton di Niconico</a>
    </div>` : ''}

  </main>
</section>

<!-- ── RELATED SONGS ── -->
${(()=>{
  const shuffle = arr => [...arr].sort(()=>Math.random()-.5);
  const allRelated = [
    ...shuffle(relatedByArtist).slice(0,3),
    ...shuffle(relatedByAnime).filter(r => !relatedByArtist.find(a=>a.slug===r.slug)).slice(0,3-Math.min(relatedByArtist.length,3))
  ].slice(0,6);

  if(!allRelated.length) return '';

  const artistLabel = relatedByArtist.length ? `dari ${escHtml(artist)}` : '';
  const animeLabel  = relatedByAnime.length  ? `dari ${escHtml(animeDisplay)}`  : '';
  const subtitle    = [artistLabel, animeLabel].filter(Boolean).join(' & ');

  const cards = allRelated.map(r => `<a class="related-card" href="${BASE_URL}/lagu/${r.slug}">
    ${r.img
      ? imgTag(r.img, r.titleMain, { cls: 'related-thumb', w: 52, h: 52 })
      : `<div class="rc-no-img">♪</div>`}
    <div class="related-info">
      <div class="related-title">${escHtml(r.titleDisplay||r.titleMain)}</div>
      ${r.titleRo ? `<div class="related-ro">${escHtml(r.titleRo)}</div>` : ''}
      <div class="related-artist">${escHtml(r.artist)}</div>
    </div>
    <div class="related-arr">→</div>
  </a>`).join('');

  return `<section class="related-section-block">
  <div class="section-header">
    <div class="section-title">Lagu Lainnya</div>
    ${subtitle ? `<div class="section-subtitle">${subtitle}</div>` : ''}
  </div>
  <div class="related-grid">${cards}</div>
</section>`;
})()}

<!-- ── COMMENTS (Waline) ── -->
<section class="comments-section">
  <div class="comment-intro">
    <div class="comment-heading">Apa yang kamu<br>rasakan dari lagu ini?</div>
    <div>
      <p class="comment-desc">Bagikan pendapatmu lewat Waline — bebas sebagai tamu atau setelah login. Tinggalkan komentar di lagu ini untuk mengaktifkan tombol salin lirik.</p>
      <button id="yume-spoiler-btn" type="button" onclick="window._yumeInsertSpoiler()" title="Sisipkan teks spoiler di posisi kursor pada kotak komentar">||spoiler||</button>
    </div>
  </div>
  <div id="waline"></div>
  <div id="yume-img-preview"></div>
</section>

<!-- ── FOOTER ── -->
<footer>
  <div class="footer-brand">
    <div class="footer-brand-jp">夢Lyrics</div>
    <div class="footer-brand-tagline">Lirik Jepang · Terjemahan Indonesia</div>
    <div class="footer-copy">© 2025 YumeSubs — yumelyrics.my.id</div>
  </div>
  <div class="footer-links">
    <div class="footer-col">
      <span class="footer-col-label">Jelajahi</span>
      <a class="footer-link" href="../index.html">Katalog Lengkap</a>
      <a class="footer-link" href="../playlists.html">Setlist Belajar</a>
      <a class="footer-link" href="../bunpou-saved.html">Bunpou tersimpan</a>
      <a class="footer-link" href="../kata/index.html">Glosarium 文法</a>
      <a class="footer-link" href="../stories.html">Cerita</a>
      <a class="footer-link" href="../contact.html">Hubungi</a>
    </div>
    <div class="footer-col">
      <span class="footer-col-label">Tentang</span>
      <a class="footer-link" href="../contact.html">Kontak</a>
    </div>
  </div>
</footer>

</div><!-- .wrap -->

<!-- ── Popup Bunpou (文法) ── -->
<div id="bunpou-overlay" class="bunpou-overlay" aria-hidden="true" onclick="if(event.target===this)closeBunpouPopup()">
  <div class="bunpou-modal" role="dialog" aria-modal="true" aria-labelledby="bunpou-title">
    <button type="button" class="bunpou-close" onclick="closeBunpouPopup()" aria-label="Tutup">×</button>
    <div class="bunpou-head">
      <span class="bunpou-kanji" id="bunpou-title">文法</span>
      <span class="bunpou-sub">Bunpou · JLPT N5–N1 · label jenis</span>
      <div class="bunpou-levels" id="bunpou-levels"></div>
    </div>
    <div class="bunpou-body">
      <div class="bunpou-line-tag" id="bunpou-line-num">Baris —</div>
      <div class="bunpou-lyric-block">
        <div class="bunpou-jp" id="bunpou-jp-preview">—</div>
        <span class="bunpou-ro-lbl" id="bunpou-ro-lbl" style="display:none">Romaji</span>
        <div class="bunpou-ro" id="bunpou-ro-preview"></div>
      </div>
      <p class="bunpou-summary" id="bunpou-summary"></p>
      <div class="bunpou-list" id="bunpou-list"></div>
      <div class="bunpou-foot">
        <div class="bunpou-foot-links">
          <a class="bunpou-gloss" id="bunpou-gloss-link" href="../kata/index.html" style="display:none">Glosarium N5 →</a>
          <a class="bunpou-gloss" href="../bunpou-saved.html">Bunpou tersimpan →</a>
        </div>
      </div>
    </div>
  </div>
</div>

<!-- ── Floating Avatar Bubble ── -->
<div id="nav-avatar-bubble" onclick="toggleUserDropdown()">
  <div id="nav-avatar-wrap"></div>
  <div id="notif-badge"></div>
  <div id="nav-banned-overlay" title="Akunmu dibanned">🚫</div>
</div>
<!-- ── User Dropdown ── -->
<div id="nav-user-dropdown">
  <div class="nud-name" id="nud-name">—</div>
  <div class="nud-email" id="nud-email">—</div>
  <div class="nud-role" id="nud-role" style="display:none">
    <span class="nud-role-label">Role</span>
    <span id="nud-role-badge"></span>
  </div>
  <button class="nud-btn" onclick="openEditProfile();closeUserDropdown()">✏ Edit Profil</button>
  <div class="nud-notif-header">
    <span class="nud-notif-title">🔔 Notifikasi</span>
    <div style="display:flex;gap:.5rem;align-items:center">
      <button class="nud-notif-clear" onclick="markAllNotifsRead()" id="notif-clear-btn" style="display:none">Tandai dibaca</button>
      <button class="nud-notif-clear" onclick="deleteReadNotifs()" id="notif-delete-btn" style="display:none;color:var(--red)">Hapus semua</button>
    </div>
  </div>
  <div id="nud-notif-list"><div class="nud-notif-empty">Tidak ada notifikasi.</div></div>
  <button class="nud-btn logout" onclick="doLogout()">↩ Keluar</button>
</div>
<div class="toast" id="toast"></div>
<!-- ── Copy hint toast (GraphComment) ── -->
<div id="copy-comment-toast" role="status" aria-live="polite">
  <p class="cct-text">tinggalkan komentar untuk salin lirik</p>
  <button type="button" class="cct-close" onclick="dismissCopyCommentToast()" aria-label="Tutup">×</button>
</div>
<!-- ── Lightbox ── -->
<div id="img-lightbox" onclick="closeLightbox()">
  <button id="img-lightbox-close" onclick="closeLightbox()">✕</button>
  <img id="img-lightbox-img" src="" alt="foto komentar">
</div>
<!-- ── Edit Profile Modal ── -->
<div id="editProfileModal">
  <div class="ep-box">
    <div class="ep-title">Edit Profil</div>
    <div class="ep-avatar-wrap" id="ep-avatar-wrap-big">
      <img class="ep-avatar-big" id="ep-avatar-big" src="${DEFAULT_COMMENT_PROFILE_URL}" alt="" referrerpolicy="no-referrer" decoding="async">
      <div class="ep-info">
        <div class="ep-name" id="ep-display-name-preview">—</div>
        <div class="ep-email" id="ep-email-preview">—</div>
      </div>
    </div>
    <div class="ep-field">
      <div class="ep-lbl">Nama Tampilan</div>
      <input class="ep-inp" id="ep-displayname" type="text" placeholder="Nama yang tampil di komentar">
    </div>
    <div class="ep-field">
      <div class="ep-lbl">Foto Profil</div>
      <div class="ep-img-row">
        <button class="ep-img-btn" onclick="document.getElementById('ep-img-input').click()">📷 Upload Foto</button>
        <span class="ep-img-status" id="ep-img-status">Atau isi URL di bawah</span>
      </div>
      <input type="file" id="ep-img-input" accept="image/*" style="display:none" onchange="handleEpImg(this)">
      <input class="ep-inp" id="ep-photourl" type="url" placeholder="https://i.imgur.com/xxx.jpg (opsional)" style="margin-top:.4rem">
    </div>
    <div class="ep-note">Nama &amp; foto di sini untuk profil situs (bubble kanan bawah). Avatar default: profile-comment.jpg. Komentar GraphComment pakai akun tamu/login di panel GraphComment — upload foto di sana jika ingin beda.</div>
    <div class="ep-actions">
      <button class="ep-save" onclick="saveEditProfile()">Simpan</button>
      <button class="ep-cancel" onclick="closeEditProfile()">Batal</button>
    </div>
  </div>
</div>
<!-- ── Admin: edit lagu di halaman ini ── -->
<div id="songEditOverlay" onclick="if(event.target===this)closeSongEditModal()">
  <div class="se-modal" role="dialog" aria-labelledby="se-modal-title">
    <div class="se-head">
      <div>
        <div class="se-tit" id="se-modal-title">Edit Lagu</div>
        <div class="se-sub">Simpan = update Firestore. Agar lirik &amp; SEO di file HTML publik ikut baru, jalankan <strong>Generate Song Pages</strong> (sama seperti di admin) lalu deploy.</div>
      </div>
      <button type="button" class="se-close" onclick="closeSongEditModal()" aria-label="Tutup">✕</button>
    </div>
    <div class="se-body">
      <div class="se-sec">Info utama</div>
      <div class="se-grid">
        <div class="se-field"><label class="se-lbl" for="se-jt">Judul Jepang *</label><input class="se-inp" id="se-jt" type="text"></div>
        <div class="se-field"><label class="se-lbl" for="se-it">Judul Indonesia</label><input class="se-inp" id="se-it" type="text"></div>
        <div class="se-field"><label class="se-lbl" for="se-ar">Artis *</label><input class="se-inp" id="se-ar" type="text"></div>
        <div class="se-field"><label class="se-lbl" for="se-ro">Romaji</label><input class="se-inp" id="se-ro" type="text"></div>
        <div class="se-field full"><label class="se-lbl" for="se-artist-slug">Slug artis</label><input class="se-inp" id="se-artist-slug" type="text" placeholder="kosongkan = otomatis"></div>
      </div>
      <div class="se-sec">Anime &amp; tag</div>
      <div class="se-grid">
        <div class="se-field"><label class="se-lbl" for="se-anime">Anime (JP)</label><input class="se-inp" id="se-anime" type="text"></div>
        <div class="se-field"><label class="se-lbl" for="se-anime-id">Anime (ID)</label><input class="se-inp" id="se-anime-id" type="text"></div>
        <div class="se-field"><label class="se-lbl" for="se-anime-en">Anime (EN)</label><input class="se-inp" id="se-anime-en" type="text"></div>
        <div class="se-field"><label class="se-lbl" for="se-type">Tipe</label>
          <select class="se-inp" id="se-type">
            <option value="">— Bukan OST —</option>
            <option value="opening">Opening</option>
            <option value="ending">Ending</option>
            <option value="insert">Insert</option>
            <option value="ost">OST</option>
          </select>
        </div>
        <div class="se-field"><label class="se-lbl" for="se-genre">Genre</label><input class="se-inp" id="se-genre" type="text"></div>
        <div class="se-field full"><label class="se-lbl" for="se-mood">Mood (pisah koma)</label><input class="se-inp" id="se-mood" type="text"></div>
      </div>
      <div class="se-sec">Media</div>
      <div class="se-grid">
        <div class="se-field"><label class="se-lbl" for="se-yt">YouTube ID</label><input class="se-inp" id="se-yt" type="text"></div>
        <div class="se-field"><label class="se-lbl" for="se-nico">Niconico ID</label><input class="se-inp" id="se-nico" type="text"></div>
        <div class="se-field full"><label class="se-lbl" for="se-sp">Spotify URL</label><input class="se-inp" id="se-sp" type="url"></div>
        <div class="se-field full"><label class="se-lbl" for="se-img">Cover URL</label><input class="se-inp" id="se-img" type="url"></div>
      </div>
      <div class="se-sec">SEO</div>
      <div class="se-grid">
        <div class="se-field full"><label class="se-lbl" for="se-descid">Deskripsi ID</label><textarea class="se-ta" id="se-descid" rows="3"></textarea></div>
        <div class="se-field full"><label class="se-lbl" for="se-descjp">Deskripsi JP</label><textarea class="se-ta" id="se-descjp" rows="3"></textarea></div>
      </div>
      <div class="se-sec">Baris lirik</div>
      <div class="se-lyrics" id="se-lyrics"></div>
      <button type="button" class="se-add-row" onclick="addSongEditLyricRow()">+ Tambah baris</button>
    </div>
    <div class="se-foot">
      <div class="se-foot-main">
        <button type="button" class="se-save" id="se-save-btn" onclick="saveSongEdit()">Simpan perubahan</button>
        <button type="button" class="se-gen" id="se-gen-btn" onclick="triggerSongPageGenerate()">▶ Generate HTML</button>
        <button type="button" class="se-cancel" onclick="closeSongEditModal()">Batal</button>
      </div>
      <div class="se-gh-status" id="se-gh-status">
        <span class="se-gh-dot" id="se-gh-dot"></span>
        <span id="se-gh-text">—</span>
        <a class="se-gh-link" id="se-gh-actions-link" href="https://github.com/yumelyrics/yumelyrics.github.io/actions/workflows/generate-pages.yml" target="_blank" rel="noopener">↗ GitHub Actions</a>
        <a class="se-gh-link" id="se-gh-result-link" href="https://yumelyrics.my.id/lagu/" target="_blank" rel="noopener" style="display:none">↗ Lihat hasil</a>
      </div>
      <details class="se-gh-token">
        <summary>Token GitHub (sama dengan admin, disimpan di browser)</summary>
        <input class="se-gh-token-inp" id="se-gh-token-inp" type="password" placeholder="github_pat_... (kosongkan jika sudah diisi di admin)" autocomplete="off">
      </details>
    </div>
  </div>
</div>
<script>
/* ── Ctrl Pills (Semua / Jepang / Romaji / Terjemahan) ── */
document.addEventListener('DOMContentLoaded', function(){
  // Generate nomor baris lirik otomatis seperti preview-lagu
  var lineNum = 1;
  document.querySelectorAll('.ll-item').forEach(function(item){
    var numEl = document.createElement('div');
    numEl.className = 'lyric-num';
    numEl.textContent = String(lineNum++).padStart(2,'0');
    item.appendChild(numEl);
  });

  var pills = document.querySelectorAll('.ctrl-pill[data-view]');
  pills.forEach(function(pill){
    pill.addEventListener('click', function(){
      var view = pill.dataset.view;
      // Reset semua ke off dulu, lalu aktifkan sesuai view
      var targets = {jp: view==='all'||view==='jp', ro: view==='all'||view==='ro', tr: view==='all'||view==='tr'};
      // Paksa set state langsung lewat window supaya sync dengan sidebar
      if(window._lyricSetView) window._lyricSetView(targets.jp, targets.ro, targets.tr);
      pills.forEach(function(p){ p.classList.remove('active'); });
      pill.classList.add('active');
    });
  });
  // thumbs-count-sb sudah di-update langsung oleh onSnapshot di loadThumb()
  // MutationObserver dihapus agar tidak double-update count

});
</script>
${GRAMMAR_BROWSER_JS ? `<script>\n${GRAMMAR_BROWSER_JS}\n</script>\n` : ''}
<script>
/* ── Fitur belajar YumeSubs: mode uji, karaoke, tata bahasa, favorit ── */
(function(){
  var SONG_SLUG = ${JSON.stringify(slug)};
  var PROG_KEY = 'ym_prog_' + SONG_SLUG;
  var SONG_ID = ${JSON.stringify(songId)};
  var SONG_TITLE = ${JSON.stringify(titleMain)};
  var SONG_ARTIST = ${JSON.stringify(artist)};
  var SONG_IMG = ${JSON.stringify(song.img || '')};
  var LYRICS_PLAIN = ${JSON.stringify(lyricsPlain)};
  var TOTAL_LINES = LYRICS_PLAIN.length;

  try {
    localStorage.setItem('ym_last_read', JSON.stringify({
      slug: SONG_SLUG, id: SONG_ID, title: SONG_TITLE, artist: SONG_ARTIST, img: SONG_IMG, ts: Date.now()
    }));
  } catch(e) {}

  var studyMode = '';
  var focusIdx = 0;

  function getPlainLine(i) {
    var l = LYRICS_PLAIN[i] || {};
    return { jp: l.jp || '', ro: l.ro || '', id: l.id || '' };
  }

  window.setStudyMode = function(mode) {
    studyMode = mode || '';
    document.body.classList.remove('mode-quiz','mode-karaoke','mode-focus');
    if (studyMode) document.body.classList.add('mode-' + studyMode);
    document.querySelectorAll('.study-btn').forEach(function(b) {
      b.classList.toggle('on', b.dataset.mode === studyMode);
    });
    var hint = document.getElementById('study-hint');
    var fp = document.getElementById('focus-prev');
    var fn = document.getElementById('focus-next');
    if (hint) {
      hint.textContent = studyMode === 'quiz' ? 'Ketuk baris untuk ungkap terjemahan — uji ingatanmu.'
        : studyMode === 'karaoke' ? 'Ketuk baris yang sedang kamu nyanyikan.'
        : studyMode === 'focus' ? 'Satu baris fokus — pakai ← → di atas.'
        : 'Mode normal — semua teks tampil.';
    }
    if (fp) fp.style.display = studyMode === 'focus' ? '' : 'none';
    if (fn) fn.style.display = studyMode === 'focus' ? '' : 'none';
    document.querySelectorAll('.ll-item').forEach(function(el) {
      el.classList.remove('revealed','karaoke-active','focus-visible');
    });
    if (studyMode === 'focus') { focusIdx = 0; applyFocus(); }
    if (studyMode === 'quiz') {
      window._lyricSetView(true, true, true);
      document.querySelectorAll('.lid').forEach(function(el){ el.classList.add('h'); });
    } else if (studyMode !== 'focus') {
      window._lyricSetView(true, true, true);
    }
  };

  window.focusStep = function(d) {
    var items = document.querySelectorAll('.ll-item');
    if (!items.length) return;
    focusIdx = Math.max(0, Math.min(items.length - 1, focusIdx + d));
    applyFocus();
  };

  function applyFocus() {
    document.querySelectorAll('.ll-item').forEach(function(el, i) {
      el.classList.toggle('focus-visible', i === focusIdx);
    });
    var vis = document.querySelector('.ll-item.focus-visible');
    if (vis) vis.scrollIntoView({ behavior: 'smooth', block: 'center' });
    saveProgress(focusIdx);
  }

  window.shareLine = function(i) {
    var l = getPlainLine(i);
    var text = (l.jp ? l.jp + '\\n' : '') + (l.ro ? l.ro + '\\n' : '') + (l.id ? l.id + '\\n' : '') +
      '\\n— ' + SONG_TITLE + ' · ' + SONG_ARTIST + '\\n© YumeSubs yumelyrics.my.id';
    if (navigator.share) {
      navigator.share({ title: SONG_TITLE, text: text, url: location.href }).catch(function(){});
      return;
    }
    navigator.clipboard.writeText(text).then(function(){ toast('Baris disalin 📋'); }).catch(function(){ toast('Gagal menyalin'); });
  };

  function favMatches(f) {
    return f && (f.slug === SONG_SLUG || (f.id && f.id === SONG_ID));
  }

  window.toggleFav = function() {
    var key = 'ym_favs';
    var favs = [];
    try { favs = JSON.parse(localStorage.getItem(key) || '[]'); } catch(e) {}
    var ix = favs.findIndex(favMatches);
    if (ix >= 0) {
      favs.splice(ix, 1);
      if (typeof toast === 'function') toast('Dihapus dari favorit');
    } else {
      favs.unshift({
        slug: SONG_SLUG, id: SONG_ID, title: SONG_TITLE, artist: SONG_ARTIST,
        img: SONG_IMG, ts: Date.now()
      });
      if (typeof toast === 'function') toast('Disimpan ★ — buka Katalog → Favorit');
    }
    try { localStorage.setItem(key, JSON.stringify(favs.slice(0, 80))); } catch(e) {}
    updateFavBtn();
  };

  function updateFavBtn() {
    var btn = document.getElementById('fav-btn');
    if (!btn) return;
    var favs = [];
    try { favs = JSON.parse(localStorage.getItem('ym_favs') || '[]'); } catch(e) {}
    var on = favs.some(favMatches);
    btn.classList.toggle('on', on);
    btn.textContent = on ? '★ Favorit' : '☆ Favorit';
  }

  function loadProgress() {
    try { return JSON.parse(localStorage.getItem(PROG_KEY) || 'null'); } catch(e) { return null; }
  }

  function saveProgress(lineIdx) {
    if (lineIdx < 0 || TOTAL_LINES < 1) return;
    var data = {
      line: lineIdx,
      mode: studyMode || 'normal',
      total: TOTAL_LINES,
      ts: Date.now()
    };
    try { localStorage.setItem(PROG_KEY, JSON.stringify(data)); } catch(e) {}
    renderProgressUI(data);
  }

  function renderProgressUI(data) {
    var fill = document.getElementById('progress-fill');
    var text = document.getElementById('progress-text');
    if (!fill || !text) return;
    var line = (data && typeof data.line === 'number') ? data.line : -1;
    var total = (data && data.total) ? data.total : TOTAL_LINES;
    var pct = total > 0 && line >= 0 ? Math.round(((line + 1) / total) * 100) : 0;
    fill.style.width = pct + '%';
    if (line < 0) {
      text.textContent = total ? 'Belum ada progres — ketuk baris saat belajar.' : '—';
      return;
    }
    var modeLabel = (data && data.mode === 'quiz') ? 'Mode uji'
      : (data.mode === 'karaoke') ? 'Mode karaoke'
      : (data.mode === 'focus') ? 'Mode fokus' : 'Mode normal';
    text.textContent = 'Baris ' + (line + 1) + ' / ' + total + ' · ' + pct + '% · ' + modeLabel;
  }

  var BUNPOU_SAVE_KEY = 'yume_saved_bunpou';

  function loadSavedBunpouList() {
    try { return JSON.parse(localStorage.getItem(BUNPOU_SAVE_KEY) || '[]'); } catch (e) { return []; }
  }

  function bunpouSaveId(it) {
    return (it.text || it.char || '') + '|' + (it.label || '') + '|' + (it.kind || 'pola');
  }

  function isBunpouItemSaved(it) {
    var id = bunpouSaveId(it);
    return loadSavedBunpouList().some(function (x) { return x.id === id; });
  }

  window.saveBunpouByIndex = function (bi) {
    var it = window._bunpouRenderList && window._bunpouRenderList[bi];
    if (!it) return;
    var id = bunpouSaveId(it);
    var list = loadSavedBunpouList();
    if (list.some(function (x) { return x.id === id; })) {
      if (typeof toast === 'function') toast('Bunpou ini sudah tersimpan');
      return;
    }
    var ctx = window._bunpouLineContext || {};
    list.unshift({
      id: id,
      text: it.text || it.char || '',
      label: it.label || '',
      desc: it.desc || '',
      level: it.level || 'N5',
      kind: it.kind || 'pola',
      kindLabel: it.kindLabel || '',
      savedAt: Date.now(),
      songSlug: ctx.slug || '',
      songTitle: ctx.title || '',
      lineIdx: typeof ctx.idx === 'number' ? ctx.idx : -1,
      lineJp: ctx.jp || '',
      lineRo: ctx.ro || ''
    });
    try {
      localStorage.setItem(BUNPOU_SAVE_KEY, JSON.stringify(list.slice(0, 300)));
    } catch (e) {}
    var btn = document.querySelector('.bunpou-save-btn[data-bunpou-idx="' + bi + '"]');
    if (btn) {
      btn.classList.add('is-saved');
      btn.textContent = 'Tersimpan ✓';
    }
    if (typeof toast === 'function') toast('Bunpou disimpan ★');
  };

  window.closeBunpouPopup = function() {
    var overlay = document.getElementById('bunpou-overlay');
    if (!overlay) return;
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('bunpou-open');
    document.querySelectorAll('.ll-item').forEach(function(r) {
      r.classList.remove('bunpou-line-active');
    });
  };

  window.openBunpouPopup = function(idx) {
    var overlay = document.getElementById('bunpou-overlay');
    if (!overlay) return;
    var plain = getPlainLine(idx);
    var jp = plain.jp || '';
    var ro = (plain.ro || '').trim();
    var lineTag = document.getElementById('bunpou-line-num');
    var preview = document.getElementById('bunpou-jp-preview');
    var roPreview = document.getElementById('bunpou-ro-preview');
    var roLbl = document.getElementById('bunpou-ro-lbl');
    var summaryEl = document.getElementById('bunpou-summary');
    var listEl = document.getElementById('bunpou-list');
    var glossLink = document.getElementById('bunpou-gloss-link');
    window._bunpouLineContext = { slug: SONG_SLUG, title: SONG_TITLE, idx: idx, jp: jp, ro: ro };
    window._bunpouRenderList = [];
    if (lineTag) lineTag.textContent = 'Baris ' + (idx + 1) + ' · ' + SONG_TITLE;
    if (preview) preview.textContent = jp || '—';
    if (roPreview) roPreview.textContent = ro;
    if (roLbl) roLbl.style.display = ro ? 'block' : 'none';
    document.querySelectorAll('.ll-item').forEach(function(r) {
      r.classList.toggle('bunpou-line-active', parseInt(r.getAttribute('data-line'), 10) === idx);
    });
    saveProgress(idx);
    var lvBox = document.getElementById('bunpou-levels');
    if (!jp && !ro) {
      if (summaryEl) summaryEl.textContent = 'Baris ini tidak memiliki teks untuk dianalisis.';
      if (listEl) listEl.innerHTML = '<p class="bunpou-empty">Tidak ada analisis.</p>';
      if (glossLink) glossLink.style.display = 'none';
      if (lvBox) lvBox.innerHTML = '';
    } else if (!window.YumeGrammar) {
      if (summaryEl) summaryEl.textContent = 'Modul bunpou belum dimuat — generate ulang halaman lagu.';
      if (listEl) listEl.innerHTML = '<p class="bunpou-empty">Pastikan ym-grammar-browser.js ada di repo.</p>';
      if (glossLink) glossLink.style.display = 'none';
      if (lvBox) lvBox.innerHTML = '';
    } else {
      var result = window.YumeGrammar.analyzeJapaneseGrammar(jp, plain.ro || '');
      if (summaryEl) summaryEl.textContent = result.summary || '';
      if (lvBox) {
        var lvHtml = '';
        (result.levels || []).forEach(function(l) {
          var c = (l || 'N5').toLowerCase();
          lvHtml += '<span class="bunpou-lv-chip ' + c + '">' + l + '</span>';
        });
        lvBox.innerHTML = lvHtml || '<span class="bunpou-lv-chip n5">N5</span>';
      }
      var html = '';
      function itemHtml(it) {
        var bi = window._bunpouRenderList.length;
        window._bunpouRenderList.push(it);
        var c = (it.level || 'N5').toLowerCase();
        var k = (it.kind || 'pola');
        var kindLabel = it.kindLabel || 'Pola tata bahasa';
        var saved = isBunpouItemSaved(it);
        return '<div class="bunpou-item bunpou-item--' + k + '">' +
          '<div class="bunpou-item-top">' +
          '<span class="bunpou-item-type" title="Jenis bunpou">' + kindLabel + '</span>' +
          '<span class="bunpou-item-lvl ' + c + '" title="Level JLPT">' + (it.level || 'N5') + '</span></div>' +
          '<div class="bunpou-item-char">' + (it.text || it.char || '') + '</div>' +
          '<div class="bunpou-item-label">' + (it.label || '') + ' · <em style="font-style:normal;color:var(--smoke);font-size:.58rem">' + kindLabel + '</em></div>' +
          '<div class="bunpou-item-desc">' + (it.desc || '') + '</div>' +
          (it.rumus ? '<div class="bunpou-item-rumus"><strong>Rumus</strong>' + (it.rumus || '') + '</div>' : '') +
          (it.contoh && it.contoh.jp
            ? '<div class="bunpou-item-contoh"><strong>Contoh</strong><span class="bunpou-item-contoh-jp">' + it.contoh.jp + '</span>' +
              (it.contoh.id ? '<span class="bunpou-item-contoh-id">' + it.contoh.id + '</span>' : '') + '</div>'
            : '') +
          '<div class="bunpou-item-actions"><button type="button" class="bunpou-save-btn' + (saved ? ' is-saved' : '') + '" data-bunpou-idx="' + bi + '" onclick="event.stopPropagation();saveBunpouByIndex(' + bi + ')">' + (saved ? 'Tersimpan ✓' : 'Simpan ★') + '</button></div></div>';
      }
      var order = window.YumeGrammar && window.YumeGrammar.KIND_ORDER
        ? window.YumeGrammar.KIND_ORDER
        : ['partikel','penghubung','sopan','bentuk','pola','ekspresi'];
      var groups = result.groups || {};
      var hasGroup = false;
      order.forEach(function(k) {
        var arr = groups[k] || [];
        if (!arr.length) return;
        hasGroup = true;
        var title = (window.YumeGrammar && window.YumeGrammar.KIND_LABELS && window.YumeGrammar.KIND_LABELS[k]) || k;
        html += '<div class="bunpou-group-title">' + title + '</div>';
        arr.forEach(function(it) { html += itemHtml(it); });
      });
      if (!hasGroup && result.items && result.items.length) {
        result.items.forEach(function(it) { html += itemHtml(it); });
      }
      if (listEl) listEl.innerHTML = html || '<p class="bunpou-empty">Tidak ada bunpou N5–N1 yang terdeteksi di baris ini.</p>';
      if (glossLink) {
        var slug = null;
        var all = (result.phrases || []).concat(result.particles || []);
        for (var gi = 0; gi < all.length; gi++) {
          if (all[gi].glossSlug) { slug = all[gi].glossSlug; break; }
        }
        glossLink.href = slug ? '../kata/' + slug + '.html' : '../kata/index.html';
        glossLink.textContent = slug ? 'Glosarium · ' + slug.replace(/-/g, ' ') + ' →' : 'Glosarium bunpou →';
        glossLink.style.display = 'inline-flex';
      }
    }
    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('bunpou-open');
    try { overlay.querySelector('.bunpou-close').focus(); } catch(e) {}
  };

  function initYumeFeatures() {
    renderProgressUI(loadProgress());
    updateFavBtn();
    var favBtn = document.getElementById('fav-btn');
    if (favBtn && !favBtn.dataset.bound) {
      favBtn.dataset.bound = '1';
      favBtn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        window.toggleFav();
      });
    }
    function handleLinePick(row, idx) {
      if (isNaN(idx)) return;
      if (studyMode === 'quiz') {
        row.classList.toggle('revealed');
        var lid = row.querySelector('.lid');
        if (lid) lid.classList.toggle('h', !row.classList.contains('revealed'));
      } else if (studyMode === 'karaoke') {
        document.querySelectorAll('.ll-item').forEach(function(r){ r.classList.remove('karaoke-active'); });
        row.classList.add('karaoke-active');
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      saveProgress(idx);
    }

    document.querySelectorAll('.ll-item').forEach(function(row) {
      row.addEventListener('click', function(e) {
        if (studyMode !== 'quiz' && studyMode !== 'karaoke') return;
        if (e.target.closest('.line-actions')) return;
        handleLinePick(row, parseInt(row.getAttribute('data-line'), 10));
      });
    });

    if (!document.body.dataset.bunpouEsc) {
      document.body.dataset.bunpouEsc = '1';
      document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') closeBunpouPopup();
      });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initYumeFeatures);
  else initYumeFeatures();
})();
</script>
<script>
/* ── Restore urutan karakter lirik via CSS order — jalan SEGERA, tidak nunggu Firebase ── */
(function(){
  function restoreLines(){
    document.querySelectorAll('[data-obf="1"]').forEach(function(line){
      // Restore urutan karakter di dalam tiap .obf-word
      line.querySelectorAll('.obf-word').forEach(function(word){
        var spans = Array.from(word.querySelectorAll('span[data-c]'));
        if(!spans.length) return;
        spans.forEach(function(s){ s.style.order = parseInt(s.dataset.c, 10); });
      });
    });
    document.body.classList.add('rdy');
  }
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', restoreLines);
  } else {
    restoreLines();
  }
})();
</script>
<script>
/* ── Theme Toggle (Night / Light Mode) ── */
(function(){
  var stored = localStorage.getItem('ym_theme');
  var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  var theme = stored || (prefersDark ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', theme);

  window.toggleTheme = function(){
    var root = document.documentElement;
    var isDark = root.getAttribute('data-theme') === 'dark';
    root.classList.add('no-transition');
    if(isDark){
      root.removeAttribute('data-theme');
      localStorage.setItem('ym_theme','light');
    } else {
      root.setAttribute('data-theme','dark');
      localStorage.setItem('ym_theme','dark');
    }
    requestAnimationFrame(function(){
      requestAnimationFrame(function(){
        root.classList.remove('no-transition');
      });
    });
  };
})();
</script>
<script type="module">
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
import { getFirestore, collection, addDoc, query, where, getDocs, updateDoc, setDoc, doc, increment, getDoc, orderBy, limit, writeBatch, deleteDoc, onSnapshot, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged, updateProfile }
  from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";


const _app = initializeApp({
  apiKey:"AIzaSyA3dKYhDxX3DE5CAI_yQbjvUUdsBR0QeS8",
  authDomain:"yumesubs7.firebaseapp.com",
  projectId:"yumesubs7",
  storageBucket:"yumesubs7.firebasestorage.app",
  messagingSenderId:"1076202015626",
  appId:"1:1076202015626:web:ce89fb668eb6b2bd021673"
});
const db       = getFirestore(_app);
const auth     = getAuth(_app);
const provider = new GoogleAuthProvider();
const UPLOAD_WORKER = 'https://rough-snowflake-e4dc.khoirustsani143.workers.dev';
async function uploadPhotoViaWorker(file) {
  if (!_currentUser) throw new Error('Login dulu');
  const fd = new FormData();
  fd.append('image', file);
  const token = await _currentUser.getIdToken();
  const res = await fetch(UPLOAD_WORKER + '/upload-img', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token },
    body: fd
  });
  const json = await res.json();
  if (!json.success) throw new Error('Upload gagal');
  return imgbbDirectUrl(json);
}

const SONG_ID = ${JSON.stringify(songId)};
const SONG_SEED = ${JSON.stringify(songSeedObj)};
try { updateDoc(doc(db,'songs',SONG_ID), { views: increment(1) }); } catch(e){}

// ── ADMIN: edit lagu di halaman ini ──
let _adminTokenVerified = false;
async function refreshAdminTokenVerify(user){
  _adminTokenVerified = false;
  if(!user || !ADMIN_EMAILS.includes(user.email)) return;
  try {
    const tr = await user.getIdTokenResult(true);
    const email = tr.claims.email || user.email || '';
    _adminTokenVerified = ADMIN_EMAILS.includes(email);
  } catch(e){
    _adminTokenVerified = ADMIN_EMAILS.includes(user.email);
  }
}
function isVerifiedAdmin(){
  return !!(_currentUser && _adminTokenVerified);
}
async function updateAdminSongUI(){
  const btn = document.getElementById('admin-edit-song-btn');
  if(btn) btn.style.display = isVerifiedAdmin() ? 'inline-flex' : 'none';
}
function escSongEdit(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function fillSongEditForm(data){
  const d = data || SONG_SEED;
  const set = (id,v)=>{ const el=document.getElementById(id); if(el) el.value = v ?? ''; };
  set('se-jt', d.titleJp); set('se-it', d.titleId); set('se-ar', d.artist);
  set('se-ro', d.titleRo); set('se-artist-slug', d.artistSlug);
  set('se-anime', d.anime); set('se-anime-id', d.animeId); set('se-anime-en', d.animeEn);
  set('se-type', d.type); set('se-genre', d.genre); set('se-mood', d.mood);
  set('se-yt', d.ytId); set('se-nico', d.nicoId); set('se-sp', d.sp); set('se-img', d.img);
  set('se-descid', d.descId); set('se-descjp', d.descJp);
  const wrap = document.getElementById('se-lyrics');
  if(!wrap) return;
  wrap.innerHTML = '';
  (d.lyrics || []).forEach(l => addSongEditLyricRow(l.jp, l.ro, l.id, l.ans));
  if(!wrap.children.length) addSongEditLyricRow();
}
window.addSongEditLyricRow = function(jp='', ro='', id='', ans=''){
  const wrap = document.getElementById('se-lyrics');
  if(!wrap) return;
  const row = document.createElement('div');
  row.className = 'se-lrow';
  row.innerHTML =
    '<button type="button" class="se-lrow-del" onclick="this.parentElement.remove()" title="Hapus baris">✕</button>' +
    '<input class="se-inp se-ljp" placeholder="Jepang" value="'+escSongEdit(jp)+'">' +
    '<input class="se-inp se-lro" placeholder="Romaji" value="'+escSongEdit(ro)+'">' +
    '<input class="se-inp se-lid" placeholder="Terjemahan" value="'+escSongEdit(id)+'">' +
    '<input class="se-inp se-lans" placeholder="Jawaban latihan (opsional)" value="'+escSongEdit(ans)+'">';
  wrap.appendChild(row);
};
window.openSongEditModal = async function(){
  await refreshAdminTokenVerify(_currentUser);
  if(!isVerifiedAdmin()){ toast('Hanya admin yang bisa mengedit lagu.'); return; }
  fillSongEditForm(SONG_SEED);
  try {
    const snap = await getDoc(doc(db,'songs', SONG_ID));
    if(snap.exists()) fillSongEditForm({ ...SONG_SEED, ...snap.data(), id: SONG_ID });
  } catch(e){ console.warn('load song for edit', e); }
  const ghInp = document.getElementById('se-gh-token-inp');
  if(ghInp && !ghInp._bound){
    ghInp._bound = true;
    ghInp.addEventListener('input', function(){ seGhTokenSet(this.value.trim()); });
  }
  if(ghInp) ghInp.value = seGhTokenGet();
  document.getElementById('songEditOverlay')?.classList.add('open');
  document.body.style.overflow = 'hidden';
};
window.closeSongEditModal = function(){
  document.getElementById('songEditOverlay')?.classList.remove('open');
  document.body.style.overflow = '';
};
window.saveSongEdit = async function(){
  await refreshAdminTokenVerify(_currentUser);
  if(!isVerifiedAdmin()){ toast('Hanya admin yang bisa menyimpan.'); return; }
  const jt = document.getElementById('se-jt')?.value.trim();
  const ar = document.getElementById('se-ar')?.value.trim();
  if(!jt || !ar){ toast('Judul JP & artis wajib diisi.'); return; }
  const lyrics = [];
  document.querySelectorAll('#se-lyrics .se-lrow').forEach(r=>{
    const jp = r.querySelector('.se-ljp')?.value.trim() || '';
    const ro = r.querySelector('.se-lro')?.value.trim() || '';
    const id = r.querySelector('.se-lid')?.value.trim() || '';
    const ans = r.querySelector('.se-lans')?.value.trim() || '';
    if(jp) lyrics.push({ jp, ro, id, ans });
  });
  const payload = {
    titleJp: jt,
    titleId: document.getElementById('se-it')?.value.trim() || '',
    artist: ar,
    artistSlug: document.getElementById('se-artist-slug')?.value.trim() || '',
    titleRo: document.getElementById('se-ro')?.value.trim() || '',
    ytId: document.getElementById('se-yt')?.value.trim() || '',
    nicoId: document.getElementById('se-nico')?.value.trim() || '',
    img: document.getElementById('se-img')?.value.trim() || '',
    sp: document.getElementById('se-sp')?.value.trim() || '',
    descId: document.getElementById('se-descid')?.value.trim() || '',
    descJp: document.getElementById('se-descjp')?.value.trim() || '',
    anime: document.getElementById('se-anime')?.value.trim() || '',
    animeId: document.getElementById('se-anime-id')?.value.trim() || '',
    animeEn: document.getElementById('se-anime-en')?.value.trim() || '',
    type: document.getElementById('se-type')?.value.trim() || '',
    genre: document.getElementById('se-genre')?.value.trim() || '',
    mood: document.getElementById('se-mood')?.value.trim() || '',
    lyrics,
    htmlDirty: true
  };
  const btn = document.getElementById('se-save-btn');
  if(btn) btn.disabled = true;
  try {
    await updateDoc(doc(db,'songs', SONG_ID), payload);
    toast('Tersimpan. Klik Generate HTML (hanya lagu ini yang di-build ulang).');
  } catch(e){
    const code = e && (e.code || e.name || '');
    if(code === 'permission-denied'){
      toast('Ditolak server: hanya akun admin yang boleh mengubah lagu. (Firestore Rules)');
    } else {
      toast('Gagal simpan: ' + (e.message || e));
    }
    if(btn) btn.disabled = false;
  }
};

// ── ADMIN: trigger GitHub generate-pages (sama key token dengan admin.html) ──
const SE_GH_OWNER = 'yumelyrics';
const SE_GH_REPO = 'yumelyrics.github.io';
const SE_GH_WORKFLOW = 'generate-pages.yml';
const SE_GH_DOT = { queued:'#c9a96e', in_progress:'#4f7ec4', success:'#4caf7d', failure:'#c96e6e', cancelled:'#5a6a82', skipped:'#5a6a82' };
let _seGhPollTimer = null;
function seGhTokenGet(){ return localStorage.getItem('yume_gh_token') || ''; }
function seGhTokenSet(t){ if(t) localStorage.setItem('yume_gh_token', t); else localStorage.removeItem('yume_gh_token'); }
function seGhHeaders(token){
  return { Authorization:'Bearer '+(token||seGhTokenGet()), Accept:'application/vnd.github+json', 'X-GitHub-Api-Version':'2022-11-28' };
}
function seGhSetStatus(visible, conclusion, text){
  const box = document.getElementById('se-gh-status');
  const dot = document.getElementById('se-gh-dot');
  const txt = document.getElementById('se-gh-text');
  const res = document.getElementById('se-gh-result-link');
  if(!box) return;
  box.classList.toggle('on', !!visible);
  if(!visible) return;
  if(dot){
    dot.style.background = SE_GH_DOT[conclusion] || 'var(--ash)';
    dot.classList.toggle('blink', conclusion === 'in_progress' || conclusion === 'queued');
  }
  if(txt) txt.textContent = text || '';
  if(res) res.style.display = conclusion === 'success' ? 'inline-flex' : 'none';
}
async function seGhLatestRunId(token){
  const r = await fetch('https://api.github.com/repos/'+SE_GH_OWNER+'/'+SE_GH_REPO+'/actions/workflows/'+SE_GH_WORKFLOW+'/runs?per_page=1', { headers: seGhHeaders(token) });
  if(!r.ok) return null;
  const d = await r.json();
  return d.workflow_runs?.[0]?.id || null;
}
async function seGhPollRun(runId, token){
  clearTimeout(_seGhPollTimer);
  try {
    const r = await fetch('https://api.github.com/repos/'+SE_GH_OWNER+'/'+SE_GH_REPO+'/actions/runs/'+runId, { headers: seGhHeaders(token) });
    if(!r.ok) return;
    const run = await r.json();
    if(run.status !== 'completed'){
      const label = run.status === 'in_progress' ? 'Generate sedang berjalan...' : 'Antri di GitHub...';
      seGhSetStatus(true, run.status, label);
      _seGhPollTimer = setTimeout(() => seGhPollRun(runId, token), 6000);
    } else {
      const labels = { success:'Selesai! HTML lagu di-generate ulang.', failure:'Workflow gagal — cek log di GitHub.', cancelled:'Workflow dibatalkan.', skipped:'Workflow dilewati.' };
      seGhSetStatus(true, run.conclusion, labels[run.conclusion] || run.conclusion);
      const btn = document.getElementById('se-gen-btn');
      if(btn){ btn.disabled = false; btn.textContent = '▶ Generate HTML'; }
    }
  } catch(e){ /* silent */ }
}
window.triggerSongPageGenerate = async function(){
  await refreshAdminTokenVerify(_currentUser);
  if(!isVerifiedAdmin()){ toast('Hanya admin yang bisa menjalankan generate.'); return; }
  const inp = document.getElementById('se-gh-token-inp');
  const token = (inp && inp.value.trim()) || seGhTokenGet();
  if(!token){ toast('Isi token GitHub di modal atau di admin (API Keys).'); if(inp) inp.focus(); return; }
  seGhTokenSet(token);
  const btn = document.getElementById('se-gen-btn');
  if(btn){ btn.disabled = true; btn.textContent = 'Mengirim...'; }
  seGhSetStatus(true, 'queued', 'Mengirim trigger ke GitHub...');
  try {
    const res = await fetch('https://api.github.com/repos/'+SE_GH_OWNER+'/'+SE_GH_REPO+'/actions/workflows/'+SE_GH_WORKFLOW+'/dispatches', {
      method: 'POST',
      headers: { ...seGhHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref: 'main', inputs: { mode: 'incremental' } })
    });
    if(res.status === 204){
      toast('Generate Song Pages di-trigger!');
      seGhSetStatus(true, 'queued', 'Antri, menunggu runner GitHub...');
      setTimeout(async () => {
        const runId = await seGhLatestRunId(token);
        if(runId) seGhPollRun(runId, token);
        else seGhSetStatus(true, 'queued', 'Run diantri — pantau di GitHub Actions.');
      }, 3500);
    } else {
      const err = await res.json().catch(() => ({}));
      toast('Gagal trigger: ' + (err.message || res.status));
      seGhSetStatus(false);
      if(btn){ btn.disabled = false; btn.textContent = '▶ Generate HTML'; }
    }
  } catch(e){
    toast('Error: ' + (e.message || e));
    seGhSetStatus(false);
    if(btn){ btn.disabled = false; btn.textContent = '▶ Generate HTML'; }
  }
};

// ── ADMIN NOTIF HELPER ──
// Email admin di-encode biar tidak plaintext di source (bukan enkripsi, tapi obstacle)
const NOTIF_ADMIN_EMAILS = (function(){
  var e=[107,104,111,105,114,117,115,116,115,97,110,105,49,52,51,64,103,109,97,105,108,46,99,111,109];
  var f=[97,100,109,105,110,64,121,117,109,101,115,117,98,115,46,99,111,109];
  return [e.map(c=>String.fromCharCode(c)).join(''), f.map(c=>String.fromCharCode(c)).join('')];
})();
async function notifyAdmins({ songId, songTitle, commenterName, commentText, isReply, parentName }) {
  try {
    const snap = await getDocs(query(collection(db,'user_profiles'), where('email','in', NOTIF_ADMIN_EMAILS)));
    if (snap.empty) return;
    const fmtDate = d => d.toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'});
    const notifBase = {
      type: isReply ? 'admin_reply' : 'admin_comment',
      songId,
      songTitle,
      songSlug: location.pathname.replace('/lagu/','').replace('.html',''),
      fromUid: _currentUser ? _currentUser.uid : null,
      fromName: commenterName,
      replyText: commentText.substring(0, 100),
      parentName: parentName || null,
      date: fmtDate(new Date()),
      ts: Date.now(),
      read: false
    };
    await Promise.all(snap.docs.map(d => addDoc(collection(db,'notifications'), { ...notifBase, toUid: d.id })));
  } catch(e) {}
}

// ── REALTIME ONLINE COUNTER ──
(function(){
  function getOnlineSessionId() {
    let id = localStorage.getItem('ym_online_id');
    if (!id) {
      id = 'u_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem('ym_online_id', id);
    }
    return id;
  }
  const sessionId = getOnlineSessionId();
  const sessionRef = doc(db, 'online_users', sessionId);
  setDoc(sessionRef, { ts: serverTimestamp(), page: location.pathname }).catch(()=>{});
  window.addEventListener('beforeunload', ()=>{ deleteDoc(sessionRef).catch(()=>{}); });
  document.addEventListener('visibilitychange', ()=>{
    if(document.visibilityState === 'hidden'){
      deleteDoc(sessionRef).catch(()=>{});
    } else {
      setDoc(sessionRef, { ts: serverTimestamp(), page: location.pathname }).catch(()=>{});
    }
  });
  onSnapshot(collection(db,'online_users'), snap=>{
    const el = document.getElementById('online-count');
    if(el) el.textContent = snap.size;
  }, ()=>{});
})();

/* ── THUMBS (Suka) ── */
// Visitor ID permanent untuk guest (tidak login)
function getVisitorId(){
  let id = localStorage.getItem('ym_visitor_id');
  if(!id){
    id = 'g_' + Date.now().toString(36) + Math.random().toString(36).slice(2,8);
    localStorage.setItem('ym_visitor_id', id);
  }
  return id;
}

let _thumbVoted = false;
let _unsubSongStats = null;

function fmtNum(n){ return n >= 1000 ? (n/1000).toFixed(1).replace(/\.0$/,'')+'k' : String(n||0); }

function loadThumb(){
  // Realtime listener untuk suka & dibaca
  if(_unsubSongStats) _unsubSongStats();
  _unsubSongStats = onSnapshot(doc(db,'songs',SONG_ID), snap => {
    const data = snap.exists() ? snap.data() : {};
    const total = data.thumbs || 0;
    const views = data.views || 0;
    const tcEl = document.getElementById('thumbs-count');
    const tcSbEl = document.getElementById('thumbs-count-sb');
    const vcEl = document.getElementById('views-count');
    // Update keduanya dari sumber yang sama (onSnapshot) — jangan dari observer terpisah
    if(tcEl) animateCount(tcEl, fmtNum(total));
    if(tcSbEl && tcSbEl.textContent !== fmtNum(total)) tcSbEl.textContent = fmtNum(total);
    if(vcEl) animateCount(vcEl, fmtNum(views));
  }, ()=>{});

  // Cek status vote user — selalu cek ulang dengan uid yang benar (visitor vs logged-in)
  const uid = auth.currentUser ? auth.currentUser.uid : getVisitorId();
  // Reset dulu supaya getDoc bisa override dengan state yang benar dari Firestore
  _thumbVoted = false;
  getDoc(doc(db,'song_thumbs',SONG_ID,'votes',uid)).then(voteSnap => {
    _thumbVoted = voteSnap.exists();
    const btn = document.getElementById('thumbs-btn');
    if(!btn) return;
    if(_thumbVoted){
      btn.classList.add('voted');
      const lbl = document.getElementById('thumbs-label');
      if(lbl) lbl.textContent = 'Kamu sudah suka lagu ini';
      const iconEl = btn.querySelector('.thumbs-icon');
      if(iconEl) iconEl.textContent = '♥';
    } else {
      btn.classList.remove('voted');
      const lbl = document.getElementById('thumbs-label');
      if(lbl) lbl.textContent = 'Suka lagu ini?';
      const iconEl = btn.querySelector('.thumbs-icon');
      if(iconEl) iconEl.textContent = '♡';
    }
  }).catch(()=>{});
}

// Animasi angka count naik/turun dengan flip singkat
function animateCount(el, newVal){
  if(el.textContent === newVal || el.textContent === '…' || el.textContent === '—'){
    el.textContent = newVal; return;
  }
  el.style.transition = 'transform .15s ease,opacity .15s ease';
  el.style.transform = 'translateY(-6px)';
  el.style.opacity = '0';
  setTimeout(()=>{
    el.textContent = newVal;
    el.style.transform = 'translateY(6px)';
    requestAnimationFrame(()=>{
      el.style.transition = 'transform .2s cubic-bezier(.34,1.56,.64,1),opacity .2s ease';
      el.style.transform = 'translateY(0)';
      el.style.opacity = '1';
    });
  }, 150);
}

window.doThumb = async function(){
  const btn = document.getElementById('thumbs-btn');
  if(!btn || btn.disabled) return;
  btn.disabled = true;

  const uid = auth.currentUser ? auth.currentUser.uid : getVisitorId();
  const voteRef = doc(db,'song_thumbs',SONG_ID,'votes',uid);
  const songRef = doc(db,'songs',SONG_ID);
  const labelEl = document.getElementById('thumbs-label');

  try {
    if(!_thumbVoted){
      // Tambah vote
      await setDoc(voteRef, { ts: Date.now(), uid });
      await updateDoc(songRef, { thumbs: increment(1) });
      _thumbVoted = true;
      btn.classList.add('voted','pop');
      setTimeout(()=>btn.classList.remove('pop'),400);
      // JANGAN update count manual di sini — onSnapshot di loadThumb() sudah handle ini
      // agar tidak double-update (manual +1 lalu onSnapshot trigger lagi → count naik 2x)
      labelEl.textContent = 'Kamu sudah suka lagu ini';
      const iconEl = btn.querySelector('.thumbs-icon');
      if(iconEl) iconEl.textContent = '♥';
    } else {
      // Hapus vote (toggle)
      await deleteDoc(voteRef);
      await updateDoc(songRef, { thumbs: increment(-1) });
      _thumbVoted = false;
      btn.classList.remove('voted');
      // JANGAN update count manual — biarkan onSnapshot yang sync dari Firestore
      labelEl.textContent = 'Suka lagu ini?';
      const iconEl2 = btn.querySelector('.thumbs-icon');
      if(iconEl2) iconEl2.textContent = '♡';
    }
  } catch(e){
    console.error('Thumb error',e);
  }
  btn.disabled = false;
};

loadThumb();

// Event listener thumbs sudah di-handle via onclick="window.doThumb()" di HTML
// TIDAK perlu addEventListener lagi di sini — akan double-fire jika ditambah ulang

/* ── Auth: Google Login Gate ── */
let _currentUser = null;
let _isBanned = false;
let _banReason = '';
let _banUntil = undefined; // undefined = belum dicek, null = permanen, number = timestamp ms
let _isAdmin = false;
let _customPhotoURL = null;
// Email admin di-encode — tidak plaintext di source
const ADMIN_EMAILS = (function(){
  var e=[107,104,111,105,114,117,115,116,115,97,110,105,49,52,51,64,103,109,97,105,108,46,99,111,109];
  var f=[97,100,109,105,110,64,121,117,109,101,115,117,98,115,46,99,111,109];
  return [e.map(c=>String.fromCharCode(c)).join(''), f.map(c=>String.fromCharCode(c)).join('')];
})();
const ADMIN_EMAIL = ADMIN_EMAILS[0]; // backward compat

async function checkBanStatus(uid) {
  try {
    if (uid && _currentUser && ADMIN_EMAILS.includes(_currentUser.email)) return false;
    const banDoc = await getDoc(doc(db, 'banned_users', uid));
    if (banDoc.exists()) {
      const data = banDoc.data();
      // Cek apakah ban sementara sudah expired
      if (data.bannedUntil !== null && data.bannedUntil !== undefined && Date.now() > data.bannedUntil) {
        _banReason = ''; _banUntil = undefined; return false; // ban sudah berakhir
      }
      _banReason = data.reason || '';
      _banUntil = data.bannedUntil !== undefined ? data.bannedUntil : null;
      return true;
    }
    _banReason = ''; _banUntil = undefined;
    return false;
  } catch(e) { _banReason = ''; _banUntil = undefined; return false; }
}

const DEFAULT_COMMENT_PROFILE = ${JSON.stringify(DEFAULT_COMMENT_PROFILE_URL)};
try { window.__yumeDefaultCommentProfile = DEFAULT_COMMENT_PROFILE; } catch(e) {}
const WALINE_COMMENT_KEY = 'ym_waline2_' + ${JSON.stringify(slug)};
let _hasCommented = false;
try { _hasCommented = !!localStorage.getItem(WALINE_COMMENT_KEY); } catch(e) {}

let _copyToastTimer = null;

function markWalineCommented() {
  if (_hasCommented) return;
  _hasCommented = true;
  try { localStorage.setItem(WALINE_COMMENT_KEY, String(Date.now())); } catch(e) {}
  updateCopyGate();
  hideCopyCommentToast();
  toast('Copy lirik aktif — terima kasih sudah berkomentar!');
}

function showCopyCommentToast() {
  if (_hasCommented || _isAdmin) return;
  const el = document.getElementById('copy-comment-toast');
  if (!el) return;
  if (_copyToastTimer) clearTimeout(_copyToastTimer);
  el.classList.add('on');
  _copyToastTimer = setTimeout(() => hideCopyCommentToast(), 8000);
}

function hideCopyCommentToast() {
  const el = document.getElementById('copy-comment-toast');
  if (!el) return;
  el.classList.remove('on');
  if (_copyToastTimer) { clearTimeout(_copyToastTimer); _copyToastTimer = null; }
}

window.dismissCopyCommentToast = hideCopyCommentToast;
window.__yumeMarkWalineCommented = markWalineCommented;

function updateCopyGate() {
  const btn  = document.getElementById('copy-lyric-btn');
  const label= document.getElementById('copy-btn-label');
  if (!btn) return;

  if (_isAdmin) {
    btn.disabled = false;
    btn.style.opacity = '';
    btn.style.cursor = '';
    btn.title = 'Copy semua lirik (Admin)';
    if (label) label.textContent = 'Copy';
    return;
  }

  if (_currentUser && _isBanned) {
    btn.disabled = true;
    btn.style.opacity = '.38';
    btn.style.cursor = 'not-allowed';
    btn.title = 'Akunmu dibanned';
    if (label) label.textContent = 'Copy';
    return;
  }

  if (_hasCommented) {
    btn.disabled = false;
    btn.style.opacity = '';
    btn.style.cursor = '';
    btn.title = 'Copy semua lirik';
    if (label) label.textContent = 'Copy';
    return;
  }

  btn.disabled = true;
  btn.style.opacity = '.38';
  btn.style.cursor = 'not-allowed';
  btn.title = 'Tinggalkan komentar untuk salin lirik';
  if (label) label.textContent = 'Copy';
}

let _authNullTimer = null;
let _authUiGen = 0;
let _authBusy = false;
let _lastAuthUserAt = 0;

async function applyAuthLoggedOut(){
  _currentUser = null;
  const navSlot= document.getElementById('nav-user-slot');
  _isAdmin = false;
  _adminTokenVerified = false;
  try{ window.__yumeAuthBridge = false; } catch(ex){}
  await updateAdminSongUI();
  closeSongEditModal();
  if(navSlot) navSlot.style.display = 'none';
  const bubbleEl = document.getElementById('nav-avatar-bubble');
  if (bubbleEl) bubbleEl.style.display = 'none';
  closeUserDropdown();
  _isBanned = false;
  _banReason = '';
  _banUntil = undefined;
  updateCopyGate();
}

function applyAuthLoggedInUISync(user){
  _currentUser = user;
  _isAdmin = ADMIN_EMAILS.includes(user.email);
  const bubble = document.getElementById('nav-avatar-bubble');
  if(bubble) bubble.style.display = 'block';
  const displayName = _isAdmin ? 'YumeSubs' : (user.displayName || 'Anonim');
  const nudName = document.getElementById('nud-name');
  const nudEmail = document.getElementById('nud-email');
  if(nudName) nudName.textContent = user.displayName || 'Kamu';
  if(nudEmail) nudEmail.textContent = user.email || '';
  _customPhotoURL = user.photoURL || null;
  renderAvatarEl(
    document.getElementById('nav-avatar-wrap'),
    _customPhotoURL,
    displayName,
    'nav-avatar',
    'nav-avatar-placeholder'
  );
}

async function applyAuthLoggedIn(user, gen){
  applyAuthLoggedInUISync(user);

  if (user) {
    _isBanned = await checkBanStatus(user.uid);
    if(!auth.currentUser || auth.currentUser.uid !== user.uid) return;
    if (_isBanned) startBanTicker();

    // FIX: Deteksi admin DULU sebelum updateCopyGate() supaya bypass admin bekerja
    _isAdmin = ADMIN_EMAILS.includes(user.email);
    await refreshAdminTokenVerify(user);
    if(!auth.currentUser || auth.currentUser.uid !== user.uid) return;
    if(_isAdmin && !_adminTokenVerified) _isAdmin = false;
    // JANGAN ekspose _isAdmin ke window — gampang di-override dari DevTools
    // Kirim ke protection layer via one-time bridge yang langsung self-destruct
    try{ window.__yumeAuthBridge = _isAdmin; } catch(ex){}
    // Hapus is-admin class dari body — dieksploitasi via DevTools ("document.body.classList.add('is-admin')")
    // Proteksi admin sekarang murni via Firebase Auth + _verifiedAdmin closure
    document.body.classList.remove('is-admin');

    // Update copy gate (setelah _isAdmin sudah diset)
    updateCopyGate();

    // (admin detection already done above)

    // Load custom photoURL dari Firestore user_profiles
    _customPhotoURL = user.photoURL || null;
    try {
      const upSnap = await getDoc(doc(db, 'user_profiles', user.uid));
      if (upSnap.exists() && upSnap.data().photoURL) _customPhotoURL = upSnap.data().photoURL;
      // Jangan updateProfile saat login — memicu auth flicker (user=null) khusus akun biasa
      if (upSnap.exists() && upSnap.data().displayName && !_isAdmin && upSnap.data().displayName !== user.displayName) {
        const syncedDisplayName = upSnap.data().displayName;
        setTimeout(() => {
          if(!auth.currentUser || auth.currentUser.uid !== user.uid) return;
          updateProfile(auth.currentUser, { displayName: syncedDisplayName }).catch(()=>{});
        }, 2500);
      }
    } catch(e) {}
    if(!auth.currentUser || auth.currentUser.uid !== user.uid) return;

    const displayName = _isAdmin ? 'YumeSubs' : (user.displayName || 'Anonim');
    const bubble = document.getElementById('nav-avatar-bubble');
    if(bubble) bubble.classList.toggle('is-banned', _isBanned);
    renderAvatarEl(
      document.getElementById('nav-avatar-wrap'),
      _customPhotoURL,
      displayName,
      'nav-avatar',
      'nav-avatar-placeholder'
    );
    if(!_isAdmin) loadAndShowUserRoleSong(user.uid);
    await updateAdminSongUI();
  }
}

function afterAuthLoggedOutCleanup(){
  if(_unsubNotif){ _unsubNotif(); _unsubNotif=null; }
  _thumbVoted = false;
  const _thumbBtn = document.getElementById('thumbs-btn');
  if(_thumbBtn){ _thumbBtn.classList.remove('voted'); }
  const _thumbLbl = document.getElementById('thumbs-label');
  if(_thumbLbl) _thumbLbl.textContent = 'Suka lagu ini?';
  const _thumbIcon = _thumbBtn ? _thumbBtn.querySelector('.thumbs-icon') : null;
  if(_thumbIcon) _thumbIcon.textContent = '\u2661';
  loadThumb();
}

function scheduleAuthLoggedOutCheck(){
  if(_authNullTimer) clearTimeout(_authNullTimer);
  _authNullTimer = setTimeout(() => {
    _authNullTimer = null;
    if(auth.currentUser) return;
    if(Date.now() - _lastAuthUserAt < 3000) return;
    if(_authBusy){
      scheduleAuthLoggedOutCheck();
      return;
    }
    setTimeout(() => {
      if(auth.currentUser) return;
      if(Date.now() - _lastAuthUserAt < 3000) return;
      applyAuthLoggedOut().then(() => {
        afterAuthLoggedOutCleanup();
      }).catch(e => console.warn('[auth logout]', e));
    }, 500);
  }, 1200);
}

onAuthStateChanged(auth, (user) => {
  if(user){
    _lastAuthUserAt = Date.now();
    if(_authNullTimer){ clearTimeout(_authNullTimer); _authNullTimer = null; }
    const uid = user.uid;
    _authBusy = true;
    applyAuthLoggedIn(user, 0).then(() => {
      if(!auth.currentUser || auth.currentUser.uid !== uid) return;
      loadNotifs(uid);
      loadThumb();
    }).catch(e => console.warn('[auth]', e)).finally(() => { _authBusy = false; });
    return;
  }
  scheduleAuthLoggedOutCheck();
});

/* Tangani hasil redirect login (jika sebelumnya popup diblokir dan pakai redirect) */
getRedirectResult(auth).then(result => {
  // onAuthStateChanged otomatis terpicu jika redirect berhasil
}).catch(()=>{});

updateCopyGate();
setTimeout(() => showCopyCommentToast(), 900);

window.doLogin = async () => {
  try {
    await signInWithPopup(auth, provider);
  } catch(e) {
    if (
      e.code === 'auth/popup-blocked' ||
      e.code === 'auth/operation-not-supported-in-this-environment' ||
      e.code === 'auth/popup-closed-by-user' && false
    ) {
      try { await signInWithRedirect(auth, provider); } catch(e2) { toast('Login gagal. Coba lagi.'); }
    } else if (e.code === 'auth/unauthorized-domain') {
      toast('Domain belum diizinkan di Firebase. Hubungi admin.');
    } else if (e.code !== 'auth/popup-closed-by-user') {
      toast('Login gagal: ' + (e.code || e.message));
    }
  }
};

window.doLogout = async () => {
  closeUserDropdown();
  await signOut(auth);
  const nr = document.getElementById('nud-role');
  if(nr) nr.style.display = 'none';
  toast('Berhasil keluar.');
};

// ── ROLE SYSTEM ──
const ROLE_DEFS_SONG = [
  { id:0, icon:'🌫️', name:'Wanderer',  threshold:0,   cls:'role-0' },
  { id:1, icon:'🌿', name:'Scout',      threshold:5,   cls:'role-1' },
  { id:2, icon:'🏹', name:'Ranger',     threshold:15,  cls:'role-2' },
  { id:3, icon:'🔮', name:'Mystic',     threshold:30,  cls:'role-3' },
  { id:4, icon:'⚔️', name:'Champion',   threshold:50,  cls:'role-4' },
  { id:5, icon:'🔥', name:'Warlord',    threshold:80,  cls:'role-5' },
  { id:6, icon:'✨', name:'Archmage',   threshold:120, cls:'role-6' },
  { id:7, icon:'💀', name:'Overlord',   threshold:200, cls:'role-7' },
];
let _roleDefs = [...ROLE_DEFS_SONG];

async function _loadRoleDefsSong(){
  try {
    const snap = await getDoc(doc(db,'role_config','levels'));
    if(snap.exists() && Array.isArray(snap.data().roles)){
      _roleDefs = snap.data().roles.map((r,i)=>({...ROLE_DEFS_SONG[i],...r,id:i}));
    }
  } catch(e){}
}

// ── CUSTOM ROLES CACHE (CR: prefix) ──
const _customRolesCache = {}; // id -> data
async function _getCustomRole(crId){
  if(_customRolesCache[crId] !== undefined) return _customRolesCache[crId];
  try {
    const snap = await getDoc(doc(db,'custom_roles',crId));
    _customRolesCache[crId] = snap.exists() ? snap.data() : null;
  } catch(e){ _customRolesCache[crId] = null; }
  return _customRolesCache[crId];
}

function _getRoleBadgeSong(commentCount, customRole){
  let role;
  if(customRole !== null && customRole !== undefined){
    // Object langsung (dari roleName shortcut)
    if(typeof customRole === 'object' && customRole.name){
      const iconHtml = customRole.iconType === 'img' && customRole.iconImg
        ? \`<img src="\${customRole.iconImg}" style="width:12px;height:12px;object-fit:cover;border-radius:50%;vertical-align:middle;display:inline-block">\`
        : (customRole.icon || '🎭');
      const styleAttr = customRole.bgColor
        ? \` style="background:\${customRole.bgColor};color:\${customRole.textColor||'#c4b0ff'};border:1px solid \${customRole.textColor||'#c4b0ff'}33"\`
        : '';
      return \`<span class="role-badge role-custom"\${styleAttr} title="\${customRole.name}">\${iconHtml} \${customRole.name}</span>\`;
    }
    // CR: prefix = custom_roles collection (resolved async, fallback ke icon dulu)
    if(typeof customRole === 'string' && customRole.startsWith('CR:')){
      // Return placeholder — akan di-replace async oleh _resolveCustomRoleBadges
      return \`<span class="role-badge role-custom" data-cr-id="\${customRole.slice(3)}" title="Custom Role">🎨 ...</span>\`;
    }
    role = typeof customRole === 'number'
      ? (_roleDefs.find(r=>r.id===customRole) || _roleDefs[0])
      : { id:'custom', icon:'🎭', name:String(customRole), cls:'role-custom' };
  } else {
    role = _roleDefs[0];
    for(const r of _roleDefs){ if(commentCount >= r.threshold) role = r; else break; }
  }
  return \`<span class="role-badge \${role.cls}" title="\${role.name}">\${role.icon} \${role.name}</span>\`;
}

// Setelah render, resolve semua CR: badge yang masih placeholder
async function _resolveCustomRoleBadges(){
  const placeholders = document.querySelectorAll('.role-badge[data-cr-id]');
  if(!placeholders.length) return;
  await Promise.all([...placeholders].map(async el => {
    const crId = el.dataset.crId;
    const cr = await _getCustomRole(crId);
    if(!cr){ el.remove(); return; }
    const iconHtml = cr.iconType === 'img' && cr.iconImg
      ? \`<img src="\${cr.iconImg}" style="width:12px;height:12px;object-fit:cover;border-radius:50%;vertical-align:middle;display:inline-block">\`
      : (cr.icon || '🎭');
    el.style.background = cr.bgColor || 'rgba(167,139,250,.18)';
    el.style.color = cr.textColor || '#c4b0ff';
    el.style.border = \`1px solid \${cr.textColor||'#c4b0ff'}33\`;
    el.title = cr.name;
    el.innerHTML = \`\${iconHtml} \${cr.name}\`;
    delete el.dataset.crId;
  }));
}

const _roleCache = {};

async function _getRoleBadgeForUser(uid){
  if(!uid) return '';
  if(_roleCache[uid] !== undefined) return _roleCache[uid];
  try {
    const [songSnap, storySnap, overSnap] = await Promise.all([
      getDocs(query(collection(db,'comments'), where('uid','==',uid))),
      getDocs(query(collection(db,'story_comments'), where('uid','==',uid))),
      getDoc(doc(db,'user_roles',uid))
    ]);
    const cnt = songSnap.size + storySnap.size;
    let custom = null;
    if(overSnap.exists()){
      const d = overSnap.data();
      // Gunakan roleName (nama langsung) jika tersedia, fallback ke role ID
      if(d.roleName){
        custom = { id:'custom', icon: d.icon||'🎭', name: d.roleName, cls:'role-custom',
                   bgColor: d.bgColor||null, textColor: d.textColor||null };
      } else {
        custom = d.role ?? null;
      }
    }
    const badge = _getRoleBadgeSong(cnt, custom);
    _roleCache[uid] = badge;
    return badge;
  } catch(e){ return ''; }
}

async function loadAndShowUserRoleSong(uid){
  const nudRole = document.getElementById('nud-role');
  const nudRoleBadge = document.getElementById('nud-role-badge');
  if(!nudRole || !nudRoleBadge) return;
  try {
    if(_roleDefs.length <= 1) await _loadRoleDefsSong();
    const badge = await _getRoleBadgeForUser(uid);
    nudRoleBadge.innerHTML = badge;
    nudRole.style.display = '';
  } catch(e){}
}

window.toggleUserDropdown = () => {
  const dd = document.getElementById('nav-user-dropdown');
  if (!dd) return;
  dd.classList.toggle('open');
};

window.closeUserDropdown = () => {
  const dd = document.getElementById('nav-user-dropdown');
  if (dd) dd.classList.remove('open');
};

// Tutup dropdown kalau klik di luar
document.addEventListener('click', e => {
  const bubble = document.getElementById('nav-avatar-bubble');
  const dd = document.getElementById('nav-user-dropdown');
  if (!dd || !dd.classList.contains('open')) return;
  if (!bubble?.contains(e.target) && !dd.contains(e.target)) closeUserDropdown();
});

/* ── Edit Profile ── */
let _epImgFile = null;

function imgbbDirectUrl(json){
  const d = json && json.data;
  if(!d) return '';
  return d.display_url || (d.image && d.image.url) || d.url || '';
}

function resolveCommentProfilePhoto(photoURL) {
  const url = String(photoURL || '').trim();
  if (url && !url.startsWith('data:') && /^https?:\\/\\//i.test(url)) return url;
  return DEFAULT_COMMENT_PROFILE;
}

function renderAvatarEl(wrap, photoURL, displayName, imgClass, phClass){
  if(!wrap) return;
  const initial = (displayName||'U')[0].toUpperCase();
  wrap.innerHTML = '';
  const url = resolveCommentProfilePhoto(photoURL);
  if(url){
    const img = document.createElement('img');
    img.className = imgClass;
    img.src = url;
    img.alt = '';
    img.referrerPolicy = 'no-referrer';
    img.decoding = 'async';
    img.onerror = function(){
      if (img.src !== DEFAULT_COMMENT_PROFILE) {
        img.onerror = null;
        img.src = DEFAULT_COMMENT_PROFILE;
        return;
      }
      wrap.innerHTML = '';
      const ph = document.createElement('div');
      ph.className = phClass;
      ph.textContent = initial;
      wrap.appendChild(ph);
    };
    wrap.appendChild(img);
  } else {
    const ph = document.createElement('div');
    ph.className = phClass;
    ph.textContent = initial;
    wrap.appendChild(ph);
  }
}

window.handleEpImg = inp => {
  const file = inp.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) { toast('Foto max 5MB.'); inp.value = ''; return; }
  _epImgFile = file;
  document.getElementById('ep-img-status').textContent = '✅ ' + file.name;
  document.getElementById('ep-photourl').value = '';
  const reader = new FileReader();
  reader.onload = e => {
    const av = document.getElementById('ep-avatar-big');
    if (av) av.outerHTML = \`<img class="ep-avatar-big" src="\${e.target.result}" alt="preview" referrerpolicy="no-referrer" id="ep-avatar-big">\`;
  };
  reader.readAsDataURL(file);
  inp.value = '';
};

window.openEditProfile = async () => {
  if (!_currentUser) return;
  const modal = document.getElementById('editProfileModal');
  if (!modal) return;
  _epImgFile = null;
  const statusEl = document.getElementById('ep-img-status');
  if (statusEl) statusEl.textContent = 'Atau isi URL di bawah';
  let photoPreview = _customPhotoURL || _currentUser.photoURL || '';
  document.getElementById('ep-display-name-preview').textContent = _currentUser.displayName || '(nama tidak ada)';
  document.getElementById('ep-email-preview').textContent = _currentUser.email || '';
  document.getElementById('ep-displayname').value = _currentUser.displayName || (_isAdmin ? 'YumeSubs' : '');
  try {
    const userSnap = await getDoc(doc(db, 'user_profiles', _currentUser.uid));
    const customPhoto = userSnap.exists() ? (userSnap.data().photoURL || '') : '';
    if(customPhoto) photoPreview = customPhoto;
    document.getElementById('ep-photourl').value = customPhoto || '';
  } catch(e) {
    document.getElementById('ep-photourl').value = '';
  }
  const bigWrap = document.getElementById('ep-avatar-wrap-big');
  let bigSlot = document.getElementById('ep-avatar-big');
  if(!bigSlot){
    bigSlot = document.createElement('div');
    bigSlot.id = 'ep-avatar-big';
    bigSlot.className = 'ep-avatar-placeholder-big';
    bigWrap.insertBefore(bigSlot, bigWrap.querySelector('.ep-info'));
  }
  renderAvatarEl(bigSlot, photoPreview, _currentUser.displayName, 'ep-avatar-big', 'ep-avatar-placeholder-big');
  modal.classList.add('open');
  setTimeout(() => document.getElementById('ep-displayname').focus(), 80);
};

window.closeEditProfile = () => {
  const modal = document.getElementById('editProfileModal');
  if (modal) modal.classList.remove('open');
  _epImgFile = null;
};

window.saveEditProfile = async () => {
  if (!_currentUser) return;
  const newName = document.getElementById('ep-displayname').value.trim();
  if (!newName) { toast('Nama tidak boleh kosong.'); return; }
  const btn = document.querySelector('.ep-save');
  if (btn) btn.disabled = true;
  try {
    let newPhoto = document.getElementById('ep-photourl').value.trim();
    if (_epImgFile) {
      const statusEl = document.getElementById('ep-img-status');
      if (statusEl) statusEl.textContent = 'Uploading...';
      newPhoto = await uploadPhotoViaWorker(_epImgFile);
      if (!newPhoto) throw new Error('URL foto tidak valid');
      if (statusEl) statusEl.textContent = '✅ Upload berhasil';
    }
    if (newPhoto && !/^https?:\\/\\//i.test(newPhoto)) { toast('URL avatar harus link gambar (https://...)'); if(btn) btn.disabled=false; return; }
    const finalPhoto = newPhoto || _currentUser.photoURL || null;
    await updateProfile(_currentUser, { displayName: newName, photoURL: finalPhoto });
    await setDoc(doc(db, 'user_profiles', _currentUser.uid), { displayName: newName, photoURL: newPhoto || null }, { merge: true });
    _customPhotoURL = newPhoto || null;
    renderAvatarEl(document.getElementById('nav-avatar-wrap'), finalPhoto, newName, 'nav-avatar', 'nav-avatar-placeholder');
    const nudName = document.getElementById('nud-name');
    const epPrev  = document.getElementById('ep-display-name-preview');
    if (nudName) nudName.textContent = newName;
    if (epPrev)  epPrev.textContent  = newName;
    const epSlot = document.getElementById('ep-avatar-big');
    if (epSlot) renderAvatarEl(epSlot, finalPhoto, newName, 'ep-avatar-big', 'ep-avatar-placeholder-big');
    _epImgFile = null;
    toast('Profil berhasil diperbarui! ✨');
    closeEditProfile();
  } catch(e) { toast('Gagal simpan: ' + (e.message || e.code)); }
  if (btn) btn.disabled = false;
};

// Tutup modal kalau klik backdrop
document.addEventListener('click', e => {
  const modal = document.getElementById('editProfileModal');
  if (modal && modal.classList.contains('open') && e.target === modal) closeEditProfile();
});

/* ── Copy Lyric (aktif setelah komentar GraphComment) ── */
window.doCopyLyric = async () => {
  if (!_isAdmin && !_hasCommented) {
    showCopyCommentToast();
    toast('Tinggalkan komentar dulu untuk salin lirik.');
    return;
  }
  // Re-check ban status secara realtime sebelum copy (hanya jika login Firebase)
  const stillBanned = _currentUser ? await checkBanStatus(_currentUser.uid) : false;
  if (stillBanned) {
    _isBanned = true;
    updateCopyGate();
    toast('🚫 Akunmu dibanned, tidak bisa copy lirik.');
    return;
  }

  // Kumpulkan semua teks lirik dari DOM (urutan sudah benar via CSS order)
  const lines = [];
  document.querySelectorAll('.ll-item').forEach(item => {
    const jp  = item.querySelector('.ljp');
    const ro  = item.querySelector('.lro');
    const lid = item.querySelector('.lid');
    function extractText(el) {
      if (!el) return '';
      // Reconstruct per kata: tiap .obf-word berisi span[data-c] yang diurutkan
      const words = Array.from(el.querySelectorAll('.obf-word')).map(w =>
        Array.from(w.querySelectorAll('span[data-c]'))
          .sort((a,b) => +a.dataset.c - +b.dataset.c)
          .map(s => s.textContent).join('')
      );
      return words.join(' ').trim();
    }
    const jpText  = extractText(jp);
    const roText  = extractText(ro);
    const lidText = extractText(lid);
    const parts = [jpText, roText, lidText].filter(Boolean);
    if (parts.length) lines.push(parts.join('\\n'));
  });

  if (!lines.length) { toast('Tidak ada lirik untuk di-copy.'); return; }
  const full = lines.join('\\n\\n') + '\\n\\n© YumeSubs — yumelyrics.my.id';

  // Copy ke clipboard
  navigator.clipboard.writeText(full).then(() => {
    toast('✓ Lirik berhasil di-copy!');
    const badge = document.getElementById('copy-done-badge');
    if (badge) { badge.classList.add('show'); setTimeout(() => badge.classList.remove('show'), 3000); }
  }).catch(() => {
    // Fallback untuk browser lama
    const ta = document.createElement('textarea');
    ta.value = full; ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
    document.body.appendChild(ta); ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    toast('✓ Lirik berhasil di-copy!');
  });
};


/* ── Anti-Copy: scramble teks yang di-copy dari halaman ini ── */
(()=>{
  function scrambleText(str) {
    if (!str || str.length < 2) return str;
    // Pisah per baris, scramble tiap baris secara independen
    return str.split('\\n').map(line => {
      if (line.trim().length < 2) return line;
      const words = line.split(' ');
      // Scramble karakter dalam tiap kata (jaga spasi antar kata)
      return words.map(word => {
        if (word.length < 2) return word;
        const arr = [...word];
        for (let i = arr.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr.join('');
      }).join(' ');
    }).join('\\n');
  }

  document.addEventListener('copy', function(e) {
    // Admin & pengguna yang sudah komentar (GraphComment) boleh salin seleksi asli
    if(typeof _isAdmin !== 'undefined' && _isAdmin) return;
    if(typeof _hasCommented !== 'undefined' && _hasCommented) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const raw = sel.toString();
    if (!raw.trim()) return;
    const scrambled = scrambleText(raw);
    const watermarked = scrambled + '\\n\\n— yumelyrics.my.id';
    e.clipboardData.setData('text/plain', watermarked);
    e.clipboardData.setData('text/html', '<span>' + scrambled.replace(/\\n/g,'<br>') + '</span><br><br><em>— yumelyrics.my.id</em>');
    e.preventDefault();
  });
})();

// ── Smooth scroll dengan easing kustom ──
window._smoothScrollTo = function(targetY, duration){
  // Di mobile, gunakan native smooth scroll jika tersedia dan jaraknya tidak terlalu jauh
  const dist = Math.abs(targetY - window.scrollY);
  const isMobile = window.innerWidth <= 900;
  // Durasi adaptif: min 400ms, max 1400ms, proporsional dengan jarak
  const adaptiveDuration = duration || Math.min(Math.max(dist * 0.5, 400), 1400);
  if(isMobile && 'scrollBehavior' in document.documentElement.style){
    window.scrollTo({ top: targetY, behavior: 'smooth' });
    return;
  }
  const startY = window.scrollY;
  const d = targetY - startY;
  const start = performance.now();
  function easeOutQuart(t){ return 1 - Math.pow(1 - t, 4); }
  function step(now){
    const elapsed = now - start;
    const progress = Math.min(elapsed / adaptiveDuration, 1);
    window.scrollTo(0, startY + d * easeOutQuart(progress));
    if(progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
};

window._scrollToLyrics = function(){
  const target = document.getElementById('lyrics') || document.querySelector('.ll-section');
  if(!target) return;
  const y = target.getBoundingClientRect().top + window.scrollY - 80;
  window._smoothScrollTo(y);
  const btn = document.querySelector('.hero-actions .btn-primary');
  if(btn){ btn.style.transform='translateY(4px)'; setTimeout(()=>btn.style.transform='',300); }
};

window._scrollToMV = function(){
  const sec = document.getElementById('yt-section');
  if(!sec) return;
  const y = sec.getBoundingClientRect().top + window.scrollY - 80;
  window._smoothScrollTo(y);
};

function toast(m){const t=document.getElementById('toast');t.textContent=m;t.classList.add('on');setTimeout(()=>t.classList.remove('on'),2800);}

let sjp=true,sro=true,str=true;

// Fungsi utama untuk set state tampilan lirik
window._lyricSetView = function(showJp, showRo, showTr){
  sjp=showJp; sro=showRo; str=showTr;
  document.querySelectorAll('.ljp').forEach(function(e){ e.classList.toggle('h',!sjp); });
  document.querySelectorAll('.lro').forEach(function(e){ e.classList.toggle('h',!sro); });
  document.querySelectorAll('.lid').forEach(function(e){ e.classList.toggle('h',!str); });
  var swJp=document.getElementById('sw-jp'),swRo=document.getElementById('sw-ro'),swTr=document.getElementById('sw-tr');
  if(swJp) swJp.classList.toggle('on',sjp);
  if(swRo) swRo.classList.toggle('on',sro);
  if(swTr) swTr.classList.toggle('on',str);
  // Sync pill active
  var view=(sjp&&sro&&str)?'all':sjp&&!sro&&!str?'jp':!sjp&&sro&&!str?'ro':!sjp&&!sro&&str?'tr':null;
  document.querySelectorAll('.ctrl-pill[data-view]').forEach(function(p){
    p.classList.toggle('active',view!==null&&p.dataset.view===view);
  });
};

window.tl = function(type){
  if(type==='jp') window._lyricSetView(!sjp, sro, str);
  else if(type==='ro') window._lyricSetView(sjp, !sro, str);
  else window._lyricSetView(sjp, sro, !str);
};

function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function renderText(str){return esc(str||'').replace(/(^|\s)(@[^\s<]{1,40})/g,'$1<span class="cm-mention">$2</span>');}

// Format tanggal + jam menit
function fmtDate(d){
  const months=['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  return d.getDate()+' '+months[d.getMonth()]+' '+d.getFullYear()+', '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
}

// Hitung sisa waktu ban untuk ditampilkan ke user
function formatEndDate(ts){
  const d = new Date(ts);
  const days = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
  const months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  return days[d.getDay()]+', '+d.getDate()+' '+months[d.getMonth()]+' '+d.getFullYear()+' pukul '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
}

function formatBanCountdown(rem){
  // rem = ms tersisa
  if(rem <= 0) return null;
  const totalSec = Math.floor(rem / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if(d > 0) return d+'h '+String(h).padStart(2,'0')+'j '+String(m).padStart(2,'0')+'m '+String(s).padStart(2,'0')+'d';
  if(h > 0) return h+'j '+String(m).padStart(2,'0')+'m '+String(s).padStart(2,'0')+'d';
  return m+'m '+String(s).padStart(2,'0')+'d';
}

function formatBanRemaining(bannedUntil){
  if(bannedUntil === null || bannedUntil === undefined) return 'permanen';
  const rem = bannedUntil - Date.now();
  if(rem <= 0) return null;
  const countdown = formatBanCountdown(rem);
  return countdown + ' — ' + formatEndDate(bannedUntil);
}

// ── Realtime countdown ticker untuk semua badge & notice banned ──
let _banTickerStarted = false;
function startBanTicker(){
  if(_banTickerStarted) return;
  _banTickerStarted = true;
  setInterval(()=>{
    // Badge di komentar orang lain
    document.querySelectorAll('.cm-banned-badge[data-banned-until]').forEach(badge=>{
      const until = parseInt(badge.dataset.bannedUntil, 10);
      if(isNaN(until)) return;
      const rem = until - Date.now();
      const countdownEl = badge.querySelector('.ban-countdown');
      if(!countdownEl) return;
      if(rem <= 0){
        countdownEl.textContent = 'expired';
        badge.style.opacity = '0.5';
      } else {
        countdownEl.textContent = formatBanCountdown(rem);
      }
    });
    // Notice di form komentar & copy gate untuk user yang kena ban
    document.querySelectorAll('.ban-countdown-notice[data-banned-until]').forEach(el=>{
      const until = parseInt(el.dataset.bannedUntil, 10);
      if(isNaN(until)) return;
      const rem = until - Date.now();
      if(rem <= 0){
        el.textContent = 'expired';
      } else {
        el.textContent = formatBanCountdown(rem);
      }
    });
  }, 1000);
}

/* Komentar: GraphComment (lihat script di bawah halaman) */
void 0; /* removed renderComment
function __REMOVE_START_renderComment(id, c, replies){
  const isAdm=c.isAdmin;
  const canDelete = _currentUser && (c.uid===_currentUser.uid || _isAdmin);
  let repHtml='';
  if(replies&&replies.length){
    repHtml='<div class="replies">'+replies.map(r=>{
      const rCanDelete = _currentUser && (r.uid===_currentUser.uid || _isAdmin);
      const rDelBtn = rCanDelete ? '<button class="cm-delete-btn" data-cmid="'+esc(r.id)+'">🗑</button>' : '';
      // Hanya tampilkan imgUrl dari http/https — skip base64 (terlalu besar untuk Firestore)
      const rImgHtml = r.imgUrl ? '<br><img class="cm-posted-img cm-lightbox-img" src="'+esc(r.imgUrl)+'" alt="foto" loading="lazy" referrerpolicy="no-referrer">' : '';
      if(r.isAdmin) return '<div class="ritem is-admin"><div class="admin-reply-block"><div class="admin-badge-wrap"><span class="admin-badge">Admin</span><span class="admin-name">YumeSubs</span><span class="admin-cm-date">'+esc(r.date)+'</span></div><div class="admin-reply-text">'+esc(r.text)+rImgHtml+'</div></div>'+rDelBtn+'</div>';
      const rAv = (r.photoURL && !r.photoURL.startsWith('data:')) ? '<img class="cm-avatar" src="'+esc(r.photoURL)+'" alt="av" referrerpolicy="no-referrer">' : '<div class="cm-avatar-ph">'+(r.name||'A')[0].toUpperCase()+'</div>';
      const rBannedBadge = r.isBanned ? (()=>{
        if(r.bannedUntil === null || r.bannedUntil === undefined){
          return '<span class="cm-banned-badge">🚫 permanen</span>';
        }
        const rem = r.bannedUntil - Date.now();
        if(rem <= 0) return '<span class="cm-banned-badge" style="opacity:.5">🚫 expired</span>';
        const endStr = formatEndDate(r.bannedUntil);
        return '<span class="cm-banned-badge" data-banned-until="'+r.bannedUntil+'" title="Berakhir '+endStr+'">🚫 <span class="ban-countdown">'+formatBanCountdown(rem)+'</span> — '+endStr+'</span>';
      })() : '';
      // Tombol balas reply → parentId tetap id komentar utama (flat thread)
      const rReplyAsLabel = _isAdmin ? 'YumeSubs' : (_currentUser?(_currentUser.displayName||'Kamu'):'(login dulu)');
      const rReplyBtn = _currentUser ? '<button class="reply-btn" data-togglereply="ritem-'+esc(r.id)+'">↩ Balas</button>' : '';
      const rReplyForm = _currentUser ? (
        '<div class="reply-form" id="rf-ritem-'+esc(r.id)+'">'+
        '<div style="font-size:.68rem;color:var(--muted);margin-bottom:.3rem">Membalas sebagai <span style="color:var(--accent)">'+rReplyAsLabel+'</span></div>'+
        '<textarea class="cmi" id="rt-ritem-'+esc(r.id)+'" rows="2" placeholder="Balas @'+esc(r.name)+'..."></textarea>'+
        '<div class="reply-row">'+
        '<button class="sbtn" style="padding:.5rem 1rem" data-postReply="'+esc(id)+'" data-mentionName="'+esc(r.name)+'">Kirim Balasan</button>'+
        '<button class="rbtn-cancel" data-togglereply="ritem-'+esc(r.id)+'">✕ Batal</button>'+
        '</div></div>'
      ) : '';
      return '<div class="ritem"><div class="chdr" style="margin-bottom:.25rem"><div class="chdr-left">'+rAv+'<span class="cname">'+esc(r.name)+rBannedBadge+(r._roleBadge||'')+'</span><span class="cdate">'+esc(r.date)+'</span>'+rDelBtn+'</div>'+rReplyBtn+'</div><div class="ctxt">'+renderText(r.text)+rImgHtml+'</div><div class="cm-thumbs"><button class="cm-thumb-btn" data-cmthumb="'+esc(r.id)+'">' + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/><path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>' + '<span class="cm-thumb-count" id="cmtc-'+esc(r.id)+'">…</span></button></div>'+rReplyForm+'</div>';
    }).join('')+'</div>';
  }
  const replyAsLabel = _isAdmin ? 'YumeSubs' : (_currentUser?(_currentUser.displayName||'Kamu'):'(login dulu)');
  const delBtn = canDelete ? '<button class="cm-delete-btn" data-cmid="'+esc(id)+'">🗑 Hapus</button>' : '';
  const imgHtml = c.imgUrl ? '<br><img class="cm-posted-img cm-lightbox-img" src="'+esc(c.imgUrl)+'" alt="foto" loading="lazy" referrerpolicy="no-referrer">' : '';
  if (isAdm) {
    return \`<div class="citem is-admin">
      <div class="admin-cm-header">
        <div class="admin-cm-crown">👑</div>
        <div class="admin-cm-info">
          <div class="admin-cm-name-row">
            <span class="admin-cm-name">YumeSubs</span>
            <span class="admin-cm-badge">Admin</span>
          </div>
          <span class="admin-cm-date">\${esc(c.date)}</span>
        </div>
        \${delBtn}
      </div>
      <div class="ctxt" style="padding:.1rem 0 .4rem">\${renderText(c.text)}\${imgHtml}</div>
      <div class="cm-thumbs"><button class="cm-thumb-btn" data-cmthumb="\${id}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/><path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg><span class="cm-thumb-count" id="cmtc-\${id}">…</span></button></div>
      \${repHtml}
      <div class="reply-form" id="rf-\${id}">
        <div style="font-size:.68rem;color:var(--muted);margin-bottom:.3rem">Membalas sebagai <span style="color:var(--accent)">\${replyAsLabel}</span></div>
        <textarea class="cmi" id="rt-\${id}" rows="2" placeholder="Balas komentar ini..."></textarea>
        <input type="file" accept="image/*" class="cm-photo-input" id="rp-photo-input-\${id}" data-repid="\${id}">
        <div id="rp-img-preview-wrap-\${id}" class="cm-img-preview-wrap" style="display:none">
          <img id="rp-img-preview-\${id}" class="cm-img-preview cm-lightbox-img" src="" alt="preview">
          <button class="cm-img-remove" data-repid="\${id}" title="Hapus foto">✕</button>
        </div>
        <div class="reply-row">
          <button class="sbtn" style="padding:.5rem 1rem" data-postReply="\${id}">Kirim Balasan</button>
          <button class="cm-photo-btn" data-pickphoto="\${id}">📷 Foto</button>
          <button class="rbtn-cancel" data-togglereply="\${id}">✕ Batal</button>
        </div>
      </div>
    </div>\`;
  }
  // Avatar untuk komentar biasa
  let avHtml;
  if (c.photoURL && !c.photoURL.startsWith('data:')) {
    avHtml = \`<img class="cm-avatar" src="\${esc(c.photoURL)}" alt="av" referrerpolicy="no-referrer">\`;
  } else {
    avHtml = \`<div class="cm-avatar-ph">\${(c.name||'A')[0].toUpperCase()}</div>\`;
  }
  const bannedBadgeHtml = c.isBanned ? (()=>{
    if(c.bannedUntil === null || c.bannedUntil === undefined){
      return \`<span class="cm-banned-badge">🚫 permanen</span>\`;
    }
    const rem = c.bannedUntil - Date.now();
    if(rem <= 0) return \`<span class="cm-banned-badge" style="opacity:.5">🚫 expired</span>\`;
    const endStr = formatEndDate(c.bannedUntil);
    return \`<span class="cm-banned-badge" data-banned-until="\${c.bannedUntil}" title="Berakhir \${endStr}">🚫 <span class="ban-countdown">\${formatBanCountdown(rem)}</span> — \${endStr}</span>\`;
  })() : '';
  return \`<div class="citem">
    <div class="chdr"><div class="chdr-left">\${avHtml}<div class="cname">\${esc(c.name)}\${bannedBadgeHtml}\${c._roleBadge||''}</div><div class="cdate">\${esc(c.date)}</div>\${delBtn}</div>
    <button class="reply-btn" data-togglereply="\${id}">↩ Balas</button></div>
    <div class="ctxt">\${renderText(c.text)}\${imgHtml}</div>
    <div class="cm-thumbs"><button class="cm-thumb-btn" data-cmthumb="\${id}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/><path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg><span class="cm-thumb-count" id="cmtc-\${id}">…</span></button></div>
    \${repHtml}
    <div class="reply-form" id="rf-\${id}">
      <div style="font-size:.68rem;color:var(--muted);margin-bottom:.3rem">Membalas sebagai <span style="color:var(--accent)">\${replyAsLabel}</span></div>
      <textarea class="cmi" id="rt-\${id}" rows="2" placeholder="Balas komentar ini..."></textarea>
      <input type="file" accept="image/*" class="cm-photo-input" id="rp-photo-input-\${id}" data-repid="\${id}">
      <div id="rp-img-preview-wrap-\${id}" class="cm-img-preview-wrap" style="display:none">
        <img id="rp-img-preview-\${id}" class="cm-img-preview cm-lightbox-img" src="" alt="preview">
        <button class="cm-img-remove" data-repid="\${id}" title="Hapus foto">✕</button>
      </div>
      <div class="reply-row">
        <button class="sbtn" style="padding:.5rem 1rem" data-postReply="\${id}">Kirim Balasan</button>
        <button class="cm-photo-btn" data-pickphoto="\${id}">📷 Foto</button>
        <button class="rbtn-cancel" data-togglereply="\${id}">✕ Batal</button>
      </div>
    </div>
  </div>\`;
}
removed renderComment */

/* ── NOTIFIKASI REALTIME ── */
let _unsubNotif = null;
function loadNotifs(uid){
  if(_unsubNotif){ _unsubNotif(); _unsubNotif=null; }
  const q = query(collection(db,'notifications'), where('toUid','==',uid));
  _unsubNotif = onSnapshot(q, snap => {
    const all = snap.docs.map(d=>({id:d.id,_ref:d.ref,...d.data()}))
      .sort((a,b)=>(b.ts||0)-(a.ts||0));

    // Auto-delete yang sudah dibaca > 14 hari
    const cutoff = Date.now() - (14*24*60*60*1000);
    const toDelete = all.filter(n=>n.read && (n.ts||0)<cutoff);
    if(toDelete.length){
      const batch=writeBatch(db);
      toDelete.forEach(n=>batch.delete(n._ref));
      batch.commit().catch(()=>{});
    }

    const notifs = all.filter(n=>!(n.read&&(n.ts||0)<cutoff)).slice(0,20);
    const unread = notifs.filter(n=>!n.read);

    const badge    = document.getElementById('notif-badge');
    const clearBtn = document.getElementById('notif-clear-btn');
    const deleteBtn= document.getElementById('notif-delete-btn');
    if(unread.length>0){
      badge.textContent=unread.length>9?'9+':unread.length;
      badge.classList.add('show');
      if(clearBtn) clearBtn.style.display='';
    } else {
      badge.classList.remove('show');
      if(clearBtn) clearBtn.style.display='none';
    }
    if(notifs.length>0){ if(deleteBtn) deleteBtn.style.display=''; }
    else { if(deleteBtn) deleteBtn.style.display='none'; }

    const list=document.getElementById('nud-notif-list');
    if(!notifs.length){
      list.innerHTML='<div class="nud-notif-empty">Tidak ada notifikasi.</div>';
      return;
    }
    list.innerHTML=notifs.map(function(n){
      var cls='nud-notif-item'+(n.read?'':' unread');
      return '<div class="'+cls+'" data-nid="'+esc(n.id)+'" data-slug="'+esc(n.songSlug||'')+'" onclick="_onNotif(this)">'+
        '<div class="nud-notif-from">💬 '+esc(n.fromName||'Seseorang')+' membalas komentarmu</div>'+
        '<div class="nud-notif-msg">&ldquo;'+esc(n.replyText||'')+'&rdquo;</div>'+
        '<div class="nud-notif-meta">'+esc(n.songTitle||'')+' &middot; '+esc(n.date||'')+'</div>'+
        '</div>';
    }).join('');
  }, ()=>{});
}

window._onNotif = function(el) {
  const nid = el.dataset.nid;
  const slug = el.dataset.slug;
  window.goToNotif(nid, slug, el);
};
window.goToNotif = async (notifId, songSlug, el) => {
  // Tandai sudah dibaca
  try{
    await updateDoc(doc(db,'notifications',notifId),{read:true});
    el.classList.remove('unread');
    // Update badge
    const remaining=document.querySelectorAll('.nud-notif-item.unread').length;
    const badge=document.getElementById('notif-badge');
    const clearBtn=document.getElementById('notif-clear-btn');
    if(remaining===0){ badge.classList.remove('show'); if(clearBtn) clearBtn.style.display='none'; }
    else { badge.textContent=remaining>9?'9+':remaining; }
  }catch(e){}
  // Navigasi ke halaman lagu
  if(songSlug){
    const currentSlug=location.pathname.split('/').pop().replace('.html','');
    if(songSlug===currentSlug){
      closeUserDropdown();
      document.querySelector('.comments-section')?.scrollIntoView({behavior:'smooth',block:'start'});
    } else {
      location.href='../lagu/'+songSlug+'.html';
    }
  }
};

window.markAllNotifsRead = async () => {
  if(!_currentUser) return;
  try{
    const snap=await getDocs(query(
      collection(db,'notifications'),
      where('toUid','==',_currentUser.uid),
      where('read','==',false)
    ));
    if(snap.empty) return;
    const batch=writeBatch(db);
    snap.docs.forEach(d=>batch.update(d.ref,{read:true}));
    await batch.commit();
    document.querySelectorAll('.nud-notif-item.unread').forEach(el=>el.classList.remove('unread'));
    document.getElementById('notif-badge').classList.remove('show');
    const clearBtn=document.getElementById('notif-clear-btn');
    if(clearBtn) clearBtn.style.display='none';
    toast('Semua notifikasi ditandai dibaca.');
  }catch(e){}
};

async function deleteReadNotifs(){
  if(!_currentUser) return;
  try{
    const snap=await getDocs(query(
      collection(db,'notifications'),
      where('toUid','==',_currentUser.uid)
    ));
    if(snap.empty) return;
    const batch=writeBatch(db);
    snap.docs.forEach(d=>batch.delete(d.ref));
    await batch.commit();
    document.getElementById('nud-notif-list').innerHTML='<div class="nud-notif-empty">Tidak ada notifikasi.</div>';
    document.getElementById('notif-badge').classList.remove('show');
    const clearBtn=document.getElementById('notif-clear-btn');
    const deleteBtn=document.getElementById('notif-delete-btn');
    if(clearBtn) clearBtn.style.display='none';
    if(deleteBtn) deleteBtn.style.display='none';
    toast('Semua notifikasi dihapus.');
  }catch(e){}
}

async function rcm(){ /* GraphComment */ }

void 0; /*
  const el = document.getElementById('cmlist');
  if(!el) return;
  el.innerHTML = '<div class="nocm">Memuat komentar...</div>';
  const ccEl = document.getElementById('cc-count');
  const ccWrap = document.getElementById('cc-count-wrap');
  try {
    const q = query(collection(db,'comments'), where('songId','==',SONG_ID), orderBy('ts','asc'));
    const snap = await getDocs(q);
    const allDocs = snap.docs.map(d=>({id:d.id,...d.data()}));
    // Cek apakah user sudah pernah komentar di lagu ini (untuk copy gate)
    if (!_hasCommented && _currentUser) {
      if (allDocs.some(c => c.uid === _currentUser.uid)) {
        _hasCommented = true;
        try { localStorage.setItem(WALINE_COMMENT_KEY, String(Date.now())); } catch(ex) {}
        updateCopyGate();
      }
    }
    const topCount = allDocs.filter(c=>!c.parentId).length;
    if(ccWrap) ccWrap.style.display = topCount > 0 ? '' : 'none';
    if(ccEl) ccEl.textContent = topCount >= 1000 ? (topCount/1000).toFixed(1).replace(/\.0$/,'')+'k' : topCount;
    if(!allDocs.length){el.innerHTML='<div class="nocm">Belum ada komentar. Jadi yang pertama!</div>';return;}

    // Fetch user_profiles semua uid unik — ambil foto & nama terbaru
    const uids=[...new Set(allDocs.filter(c=>c.uid&&!c.isAdmin).map(c=>c.uid))];
    const profileMap={};
    const banMap={};
    const roleMap={};
    // Hitung comment count dari allDocs sebagai fallback kalau Firestore fetch gagal
    const localCountMap={};
    allDocs.filter(c=>c.uid&&!c.isAdmin).forEach(c=>{ localCountMap[c.uid]=(localCountMap[c.uid]||0)+1; });
    try { if(_roleDefs.length <= 1) await _loadRoleDefsSong(); } catch(e){}
    await Promise.all(uids.map(async uid=>{
      // Fetch profil & ban — dua query ringan, cukup untuk render komentar
      try {
        const [pSnap, bSnap] = await Promise.all([
          getDoc(doc(db,'user_profiles',uid)),
          getDoc(doc(db,'banned_users',uid))
        ]);
        if(pSnap.exists()) profileMap[uid]=pSnap.data();
        if(bSnap.exists()){
          const bd=bSnap.data();
          const isActiveBan=bd.bannedUntil===null||bd.bannedUntil===undefined||Date.now()<=bd.bannedUntil;
          if(isActiveBan) banMap[uid]={bannedUntil: bd.bannedUntil !== undefined ? bd.bannedUntil : null};
        }
      } catch(e){}

      // Role badge: pakai localCountMap dari allDocs — tidak perlu query count ke seluruh koleksi
      if(_roleCache[uid] !== undefined){
        roleMap[uid] = _roleCache[uid];
      } else {
        try {
          const rSnap = await getDoc(doc(db,'user_roles',uid));
          const custom = rSnap.exists() ? (rSnap.data().role ?? null) : null;
          _roleCache[uid] = _getRoleBadgeSong(localCountMap[uid]||0, custom);
        } catch(e){
          _roleCache[uid] = _getRoleBadgeSong(localCountMap[uid]||0, null);
        }
        roleMap[uid] = _roleCache[uid];
      }
    }));

    // Inject foto & nama terbaru dari profil ke setiap komentar/reply
    const enriched=allDocs.map(c=>{
      if(c.isAdmin||!c.uid) return c;
      const p=profileMap[c.uid];
      return {
        ...c,
        photoURL:(p&&p.photoURL)?p.photoURL:null,
        name:(p&&p.displayName)?p.displayName:(c.name||'Anonim'),
        isBanned:!!banMap[c.uid],
        bannedUntil: banMap[c.uid] ? banMap[c.uid].bannedUntil : undefined,
        _roleBadge: roleMap[c.uid] || ''
      };
    });

    const parents=enriched.filter(c=>!c.parentId);
    const replyMap={};
    enriched.filter(c=>!!c.parentId).forEach(r=>{if(!replyMap[r.parentId])replyMap[r.parentId]=[];replyMap[r.parentId].push(r);});
    if(!parents.length){el.innerHTML='<div class="nocm">Belum ada komentar. Jadi yang pertama!</div>';return;}
    el.innerHTML=parents.map(c=>renderComment(c.id,c,replyMap[c.id]||[])).join('');
    startBanTicker();
    if(typeof _resolveCustomRoleBadges === 'function') _resolveCustomRoleBadges();
  }catch(e){
    console.error('[rcm] error:', e.code, e.message, e);
    if(el) el.innerHTML='<div class="nocm">Gagal memuat komentar. Coba refresh halaman.</div>';
  }
*/

void 0; /* legacy comment UI removed
window.toggleReplyForm = function(key) {
  const form = document.getElementById('rf-'+key);
  if(form) form.classList.toggle('open');
};
window.doCommentThumb = function(cmId, btn) {
  // fitur thumb akan ditambahkan di versi berikutnya
};

document.getElementById('cmlist').addEventListener('click', e => {
  // Hapus komentar
  const delBtn = e.target.closest('[data-cmid]');
  if (delBtn) { window.deleteCm(delBtn.dataset.cmid); return; }

  // Toggle reply form
  const toggleBtn = e.target.closest('[data-togglereply]');
  if (toggleBtn) { window.toggleReplyForm(toggleBtn.dataset.togglereply); return; }

  // Kirim balasan
  const postBtn = e.target.closest('[data-postreply]');
  if (postBtn) { const srcTa = postBtn.closest('.reply-form') ? postBtn.closest('.reply-form').querySelector('textarea') : null; window.postReply(postBtn.dataset.postreply, srcTa ? srcTa.id : null, postBtn.dataset.mentionname || null); return; }

  // Pilih foto reply
  const pickBtn = e.target.closest('[data-pickphoto]');
  if (pickBtn) {
    const inp = document.getElementById('rp-photo-input-'+pickBtn.dataset.pickphoto);
    if(inp) inp.click();
    return;
  }

  // Hapus preview foto reply
  const removeBtn = e.target.closest('.cm-img-remove[data-repid]');
  if (removeBtn) { window.removeReplyPhoto(removeBtn.dataset.repid); return; }

  // Lightbox foto
  const imgEl = e.target.closest('.cm-lightbox-img');
  if (imgEl && imgEl.src) { window.openLightbox(imgEl.src); return; }

  // Thumbs komentar
  const thumbBtn = e.target.closest('[data-cmthumb]');
  if (thumbBtn) { window.doCommentThumb(thumbBtn.dataset.cmthumb, thumbBtn); return; }
});

// Input file reply — pakai event delegation juga
document.getElementById('cmlist').addEventListener('change', e => {
  const inp = e.target.closest('.cm-photo-input[data-repid]');
  if (inp) { window.handleReplyPhoto(inp.dataset.repid, inp); }
});

window.postReply = async (parentId, srcTaId, mentionName) => {
  if (!_currentUser) { toast('Login dulu untuk membalas.'); return; }
  if (_isBanned && !_isAdmin) { toast('\u{1F6AB} Akunmu dibanned, tidak bisa berkomentar.'); return; }
  const rateLimitErr = checkRateLimit('reply');
  if(rateLimitErr){ toast(rateLimitErr); return; }
  // Baca teks dari textarea aktif (bisa dari form ritem atau form utama)
  const taId = srcTaId || ('rt-'+parentId);
  const taEl = document.getElementById(taId);
  let t = taEl ? taEl.value.trim() : '';
  // Kalau dari form ritem, prepend @mention supaya jelas reply ke siapa
  if(t && mentionName && !t.startsWith('@')) t = '@'+mentionName+' '+t;
  const replyImg = _replyImgMap[parentId] || null;
  if(!t && !replyImg)return;
  try{
    const repName = _isAdmin ? 'YumeSubs' : (_currentUser.displayName||'Anonim');
    // Upload foto reply ke Storage jika ada
    let replyImgUrl = null;
    const replyImgData = _replyImgMap[parentId] || null;
    if (replyImgData && replyImgData.file) {
      try {
        toast('Mengupload foto...');
        replyImgUrl = await uploadCommentPhoto(replyImgData.file, _currentUser.uid);
      } catch(uploadErr) {
        toast('Gagal upload foto. Coba lagi.');
        return;
      }
    }
    await addDoc(collection(db,'comments'),{
      songId:SONG_ID,
      parentId,
      name:repName,
      uid:_currentUser.uid,
      photoURL:_isAdmin ? null : (_customPhotoURL||_currentUser.photoURL||null),
      text:t,
      imgUrl:replyImgUrl,
      date:fmtDate(new Date()),
      ts:Date.now(),
      isAdmin:_isAdmin
    });
    await saveRateLimit(_currentUser.uid, 'reply');
    if (!_isAdmin) {
      const parentSnap2 = await getDoc(doc(db,'comments',parentId)).catch(()=>null);
      const parentName = parentSnap2?.exists() ? (parentSnap2.data().name||'') : '';
      notifyAdmins({ songId: SONG_ID, songTitle: document.querySelector('.lvt')?.textContent||SONG_ID, commenterName: repName, commentText: t, isReply: true, parentName });
    }
    if(taEl) taEl.value='';
    removeReplyPhoto(parentId);
    // Tutup semua reply form yang terbuka di thread ini
    document.querySelectorAll('[id^="rf-"]').forEach(rf=>{
      const rid=rf.id.replace('rf-','');
      if(rid===parentId||rid.startsWith('ritem-')) rf.classList.remove('open');
    });
    // Notifikasi ke semua peserta thread (pemilik parent + semua replier sebelumnya)
    try{
      const currentSlug=location.pathname.split('/').pop().replace('.html','');
      const songTitle=document.title.split(' - ')[0].replace('Lirik ','');
      const [parentSnap, threadSnap]=await Promise.all([
        getDoc(doc(db,'comments',parentId)),
        getDocs(query(collection(db,'comments'),where('parentId','==',parentId)))
      ]);
      const notifTargets=new Map();
      if(parentSnap.exists()){
        const pd=parentSnap.data();
        if(pd.uid&&pd.uid!==_currentUser.uid) notifTargets.set(pd.uid,pd.name||'');
      }
      threadSnap.docs.forEach(d=>{
        const rd=d.data();
        if(rd.uid&&rd.uid!==_currentUser.uid&&!notifTargets.has(rd.uid)) notifTargets.set(rd.uid,rd.name||'');
      });
      await Promise.all([...notifTargets.entries()].map(([uid,name])=>sendNotif(uid,name,t,currentSlug,songTitle)));
    }catch(e){}
    toast(_isAdmin ? 'Balasan admin terkirim! \u{1F451}' : 'Balasan terkirim! \u{1F4AC}');
    rcm();
  }catch(e){toast('Gagal kirim.');}
};

window.postCm = async () => {
  if (!_currentUser) { toast('Login dulu untuk berkomentar.'); return; }
  if (_isBanned && !_isAdmin) { toast('🚫 Akunmu dibanned, tidak bisa berkomentar.'); return; }
  const rateLimitErr = checkRateLimit('comment');
  if(rateLimitErr){ toast(rateLimitErr); return; }
  const t=document.getElementById('cm-t').value.trim();
  const btn=document.getElementById('cm-btn');
  if(!t && !_cmImgFile)return;btn.disabled=true;
  const cmName = _isAdmin ? 'YumeSubs' : (_currentUser.displayName||'Anonim');
  try{
    // Upload foto ke Storage dulu, dapatkan URL publik
    let imgUrl = null;
    if (_cmImgFile) {
      try {
        toast('Mengupload foto...');
        imgUrl = await uploadCommentPhoto(_cmImgFile, _currentUser.uid);
      } catch(uploadErr) {
        toast('Gagal upload foto. Coba lagi.');
        btn.disabled = false;
        return;
      }
    }
    await addDoc(collection(db,'comments'),{
      songId:SONG_ID,
      parentId:null,
      name:cmName,
      uid:_currentUser.uid,
      photoURL:_isAdmin ? null : (_customPhotoURL||_currentUser.photoURL||null),
      text:t,
      imgUrl:imgUrl,
      date:fmtDate(new Date()),
      ts:Date.now(),
      isAdmin:_isAdmin
    });
    await saveRateLimit(_currentUser.uid, 'comment');
    if (!_isAdmin) {
      notifyAdmins({ songId: SONG_ID, songTitle: document.querySelector('.lvt')?.textContent||SONG_ID, commenterName: cmName, commentText: t, isReply: false });
    }
    document.getElementById('cm-t').value='';
    removeCmPhoto();
    // Langsung aktifkan tombol copy setelah komentar berhasil — tanpa tunggu Firestore
    if (!_isAdmin && !_hasCommented) {
      _hasCommented = true;
      updateCopyGate();
    }
    if (_isAdmin) {
      toast('Komentar admin terkirim! 👑');
    } else {
      toast('Komentar terkirim! 💬');
    }
    rcm();
  }catch(e){toast('Gagal kirim komentar.');}
  btn.disabled=false;
};

// ── State foto komentar utama ──
let _cmImgDataUrl = null;  // preview lokal (base64)
let _cmImgFile    = null;  // file asli untuk upload
// State foto per reply (key = parentId)
const _replyImgMap = {};   // { parentId: { dataUrl, file } }

// Limit ukuran file: 2MB
const IMG_MAX_BYTES = 2 * 1024 * 1024;
// Resize preview lokal: max 800px sisi terpanjang
const IMG_MAX_PX = 800;

// Convert file ke base64 DataURL untuk preview lokal
function fileToDataUrl(file, cb){
  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      let w = img.width, h = img.height;
      if(w > IMG_MAX_PX || h > IMG_MAX_PX){
        if(w > h){ h = Math.round(h * IMG_MAX_PX/w); w = IMG_MAX_PX; }
        else { w = Math.round(w * IMG_MAX_PX/h); h = IMG_MAX_PX; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      cb(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

// Upload foto via Cloudflare Worker (kunci ImgBB di server)
async function uploadCommentPhoto(file, uid){
  return uploadPhotoViaWorker(file);
}

window.handleCmPhoto = input => {
  const file = input.files[0];
  if (!file) return;
  if (file.size > IMG_MAX_BYTES) {
    toast(\`Foto max \${IMG_MAX_BYTES/1024/1024}MB. Pilih foto yang lebih kecil.\`);
    input.value = '';
    return;
  }
  _cmImgFile = file;
  fileToDataUrl(file, dataUrl => {
    _cmImgDataUrl = dataUrl;
    const wrap = document.getElementById('cm-img-preview-wrap');
    const prev = document.getElementById('cm-img-preview');
    prev.src = dataUrl;
    wrap.style.display = 'inline-block';
  });
  input.value = '';
};

window.removeCmPhoto = () => {
  _cmImgDataUrl = null;
  _cmImgFile    = null;
  const wrap = document.getElementById('cm-img-preview-wrap');
  const prev = document.getElementById('cm-img-preview');
  if(wrap) wrap.style.display = 'none';
  if(prev) prev.src = '';
};

window.handleReplyPhoto = (parentId, input) => {
  const file = input.files[0];
  if (!file) return;
  if (file.size > IMG_MAX_BYTES) {
    toast(\`Foto max \${IMG_MAX_BYTES/1024/1024}MB. Pilih foto yang lebih kecil.\`);
    input.value = '';
    return;
  }
  fileToDataUrl(file, dataUrl => {
    _replyImgMap[parentId] = { dataUrl, file };
    const wrap = document.getElementById('rp-img-preview-wrap-'+parentId);
    const prev = document.getElementById('rp-img-preview-'+parentId);
    if(prev) prev.src = dataUrl;
    if(wrap) wrap.style.display = 'inline-block';
  });
  input.value = '';
};

window.removeReplyPhoto = parentId => {
  delete _replyImgMap[parentId];
  const wrap = document.getElementById('rp-img-preview-wrap-'+parentId);
  const prev = document.getElementById('rp-img-preview-'+parentId);
  if(wrap) wrap.style.display = 'none';
  if(prev) prev.src = '';
};

// ── Lightbox foto ──
window.openLightbox = src => {
  const lb = document.getElementById('img-lightbox');
  const img = document.getElementById('img-lightbox-img');
  if(!lb||!img) return;
  img.src = src;
  lb.classList.add('open');
  document.body.style.overflow = 'hidden';
};
window.closeLightbox = () => {
  const lb = document.getElementById('img-lightbox');
  if(lb) lb.classList.remove('open');
  document.body.style.overflow = '';
};
document.addEventListener('keydown', e => { if(e.key==='Escape') closeLightbox(); });
// Lightbox untuk preview foto di form komentar utama
document.addEventListener('click', e => {
  const imgEl = e.target.closest('#cm-img-preview-wrap .cm-lightbox-img');
  if (imgEl && imgEl.src) { window.openLightbox(imgEl.src); }
});

// ── Hapus komentar ──
window.deleteCm = async cmId => {
  if (!_currentUser) return;
  if (!confirm('Hapus komentar ini?')) return;
  try {
    const cmSnap = await getDoc(doc(db, 'comments', cmId));
    if (!cmSnap.exists()) { toast('Komentar tidak ditemukan.'); return; }
    const cmData = cmSnap.data();
    // Hanya pemilik atau admin yang boleh hapus
    if (cmData.uid !== _currentUser.uid && !_isAdmin) { toast('Kamu tidak bisa menghapus komentar ini.'); return; }
    // Kalau ini komentar parent, hapus juga semua replynya
    if (!cmData.parentId) {
      const repliesSnap = await getDocs(query(collection(db,'comments'), where('parentId','==',cmId)));
      if (!repliesSnap.empty) {
        const batch = writeBatch(db);
        repliesSnap.docs.forEach(d => batch.delete(d.ref));
        batch.delete(doc(db,'comments',cmId));
        await batch.commit();
      } else {
        await deleteDoc(doc(db,'comments',cmId));
      }
    } else {
      await deleteDoc(doc(db,'comments',cmId));
    }
    toast('Komentar dihapus.');
    rcm();
  } catch(e) { toast('Gagal hapus komentar.'); }
};
legacy comment UI removed */

</script>
<script type="module">
import { init } from 'https://unpkg.com/@waline/client@3/dist/waline.js';

/* ── Spoiler: sisipkan ||teks|| di kursor textarea Waline ── */
window._yumeInsertSpoiler = function() {
  var ta = document.querySelector('#waline textarea');
  if (!ta) { ta = document.querySelector('#waline .wl-editor textarea'); }
  if (!ta) return;
  ta.focus();
  var start = ta.selectionStart, end = ta.selectionEnd;
  var sel = ta.value.slice(start, end) || 'spoiler';
  var before = ta.value.slice(0, start);
  var after = ta.value.slice(end);
  var inserted = '||' + sel + '||';
  /* Gunakan setter asli agar React/Preact mendeteksi perubahan */
  var nd = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
  nd.set.call(ta, before + inserted + after);
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  var pos = start + inserted.length;
  ta.setSelectionRange(pos, pos);
  ta.focus();
};

/* ── State gambar pending (belum dimasukkan ke komentar) ── */
var _yumeImgCount = 0;
var _yumeImgPending = []; /* [{token, dataUrl, filename}] */

/* ── Tampilkan thumbnail gambar + tombol X ── */
function yumeShowImgPreview(imgData) {
  var panel = document.getElementById('yume-img-preview');
  if (!panel) return;
  var item = document.createElement('div');
  item.className = 'yip-item';
  item.dataset.token = imgData.token;
  var imgEl = document.createElement('img');
  imgEl.src = imgData.dataUrl;
  imgEl.alt = imgData.filename;
  var xBtn = document.createElement('button');
  xBtn.type = 'button';
  xBtn.className = 'yip-x';
  xBtn.textContent = '\u00d7';
  xBtn.title = 'Hapus gambar';
  xBtn.onclick = function() {
    _yumeImgPending = _yumeImgPending.filter(function(p) { return p.token !== imgData.token; });
    item.remove();
  };
  item.appendChild(imgEl);
  item.appendChild(xBtn);
  panel.appendChild(item);
}

/* ── Hapus token pendek dari textarea setelah Waline memasukkannya ── */
function yumeCleanToken(token, n) {
  setTimeout(function() {
    var ta = document.querySelector('#waline textarea');
    if (!ta) { if (n < 25) yumeCleanToken(token, n + 1); return; }
    var esc = token.replace(/[-.*+?^${}()|[\]\\]/g, '\\$&');
    var re = new RegExp('\\n?!\\[[^\\]]*\\]\\(' + esc + '\\)\\n?', 'g');
    var cleaned = ta.value.replace(re, '');
    if (cleaned !== ta.value) {
      var nd = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
      nd.set.call(ta, cleaned);
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    } else if (n < 25) {
      yumeCleanToken(token, n + 1);
    }
  }, 80);
}

/* ── Resize gambar → base64 (maks 700px, JPEG q0.75) ── */
function yumeResizeToDataUrl(file) {
  return new Promise(function(resolve, reject) {
    var reader = new FileReader();
    reader.onerror = reject;
    reader.onload = function(ev) {
      var img = new Image();
      img.onerror = reject;
      img.onload = function() {
        var MAX = 700, w = img.width, h = img.height;
        if (w > MAX || h > MAX) {
          if (w >= h) { h = Math.round(h * MAX / w); w = MAX; }
          else        { w = Math.round(w * MAX / h); h = MAX; }
        }
        var c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL('image/jpeg', 0.75));
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });
}

/* ── Inject gambar ke textarea sebelum Waline submit (capture phase) ── */
document.addEventListener('click', function(e) {
  if (_yumeImgPending.length === 0) return;
  var btn = e.target.closest('button[type="submit"]');
  if (!btn) return;
  var walineEl = document.getElementById('waline');
  if (!walineEl || !walineEl.contains(btn)) return;
  /* cari textarea di editor yang berisi tombol submit ini */
  var editorEl = btn.closest('.wl-editor') || walineEl.querySelector('.wl-editor');
  var ta = editorEl && editorEl.querySelector('textarea');
  if (!ta) return;
  /* gabungkan gambar pending ke akhir teks */
  var suffix = _yumeImgPending.map(function(p) {
    return '\n![' + p.filename + '](' + p.dataUrl + ')';
  }).join('');
  var nd = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
  nd.set.call(ta, ta.value.trimEnd() + suffix);
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  /* reset state */
  _yumeImgPending = [];
  var panel = document.getElementById('yume-img-preview');
  if (panel) panel.innerHTML = '';
}, true /* capture = berjalan SEBELUM handler Waline */);

window._walineAppInstance = init({
  el: '#waline',
  serverURL: 'https://yumelyrics-comment.vercel.app',
  path: '/lagu/${slug}',
  locale: {
    placeholder: 'Tulis komentarmu di sini\u2026 (bebas sebagai tamu)',
    sofa: 'Belum ada komentar. Jadi yang pertama!',
    submit: 'Kirim',
    comment: 'Komentar',
    reply: 'Balas',
    preview: 'Pratinjau',
    logout: 'Keluar',
  },
  dark: '[data-theme="dark"]',
  emoji: ['//unpkg.com/@waline/emojis@1.2.0/bmoji'],
  search: false,
  copyright: false,
  reaction: false,
  imageUploader: function(file) {
    return yumeResizeToDataUrl(file).then(function(dataUrl) {
      _yumeImgCount++;
      var token = 'yume_img_' + _yumeImgCount;
      var filename = file.name || 'gambar.jpg';
      var imgData = { token: token, dataUrl: dataUrl, filename: filename };
      _yumeImgPending.push(imgData);
      /* tampilkan thumbnail di panel preview */
      yumeShowImgPreview(imgData);
      /* hapus token pendek dari textarea (Waline memasukkan ![name](token)) */
      yumeCleanToken(token, 0);
      /* resolve dengan token pendek — bukan base64 — agar textarea bersih */
      return token;
    });
  },
  texRenderer: false,
});

/* ── Render ||spoiler|| di komentar yang sudah diposting ──
   Dilakukan sekali setelah Waline selesai render awal,
   lalu pantau penambahan komentar baru. Tidak memodifikasi
   node yang sedang aktif di virtual DOM Preact. ── */
function yumeApplySpoilers(root) {
  root.querySelectorAll('.wl-content p, .wl-content li').forEach(function(el) {
    Array.from(el.childNodes).forEach(function(node) {
      if (node.nodeType !== 3) return; /* hanya text node */
      var txt = node.textContent;
      if (txt.indexOf('||') === -1) return;
      var parts = txt.split(/(\\|\\|[^|]+\\|\\|)/);
      if (parts.length < 2) return;
      var frag = document.createDocumentFragment();
      parts.forEach(function(p) {
        if (/^\\|\\|.+\\|\\|$/.test(p)) {
          var sp = document.createElement('span');
          sp.className = 'cm-sp';
          sp.textContent = p.slice(2, -2);
          sp.onclick = function() { sp.classList.toggle('cm-sp-open'); };
          frag.appendChild(sp);
        } else {
          frag.appendChild(document.createTextNode(p));
        }
      });
      node.parentNode.replaceChild(frag, node);
    });
  });
}

(function watchWalineComments() {
  var iv = setInterval(function() {
    var list = document.querySelector('#waline .wl-comment-list');
    if (!list) return;
    clearInterval(iv);
    /* proses komentar yang sudah ada */
    yumeApplySpoilers(list);
    /* pantau penambahan komentar baru */
    var prevCount = list.querySelectorAll('.wl-comment').length;
    new MutationObserver(function(mutations) {
      var newCount = list.querySelectorAll('.wl-comment').length;
      if (newCount > prevCount) {
        prevCount = newCount;
        /* tunda sedikit agar Preact selesai commit sebelum kita sentuh DOM */
        setTimeout(function() { yumeApplySpoilers(list); }, 80);
        if (typeof window.markWalineCommented === 'function') window.markWalineCommented();
      }
    }).observe(list, { childList: true, subtree: false });
  }, 500);
})();
</script>
<script>
function fixBg(){const h=window.visualViewport?window.visualViewport.height:window.innerHeight;const w=window.visualViewport?window.visualViewport.width:window.innerWidth;const bg=document.getElementById('bgwrap');if(bg){bg.style.height=h+'px';bg.style.width=w+'px';}document.body.style.minHeight=h+'px';}
fixBg();if(window.visualViewport){window.visualViewport.addEventListener('resize',fixBg);}window.addEventListener('resize',fixBg);
</script>
<script>
/* ── Anti Reader Mode ── */
(function(){
  // 1. Deteksi Firefox Reader Mode via about:reader
  if(location.href.indexOf('about:reader')===0||document.documentElement.getAttribute('data-is-reader-mode')){
    document.body.innerHTML='<div style="font-family:sans-serif;padding:2rem;text-align:center"><h2>Konten tidak tersedia di Reader Mode</h2><p>Silakan matikan Reader Mode untuk melihat lirik ini di <a href="${BASE_URL}/lagu/${slug}">YumeSubs</a>.</p></div>';
    return;
  }

  // 2. Inject "poison" paragraphs — reader mode akan mengambil teks ini
  // karena ia mencari elemen <p> dengan banyak teks.
  // Teks ini hanya muncul di reader mode (elemen hidden dari render normal).
  const poison = [
    'Konten ini hanya dapat dilihat di YumeSubs secara langsung.',
    'Reader Mode tidak didukung. Kunjungi yumelyrics.my.id untuk melihat lirik lengkap.',
    'Lirik dilindungi hak cipta © YumeSubs — yumelyrics.my.id',
    'Untuk melihat lirik dengan benar, matikan Reader Mode di browser Anda.',
    'Teks yang Anda lihat di sini tidak lengkap karena proteksi konten YumeSubs.',
  ];
  const fakeArticle = document.createElement('article');
  fakeArticle.className = 'rm-decoy';
  fakeArticle.setAttribute('aria-hidden','true');
  poison.forEach(function(txt){
    const p = document.createElement('p');
    // Teks diacak karakter agar tidak terbaca tapi reader mode mengambilnya
    p.setAttribute('data-rm','1');
    p.textContent = txt;
    fakeArticle.appendChild(p);
  });
  document.body.appendChild(fakeArticle);

  // 3. Deteksi perubahan DOM yang dilakukan reader mode (Firefox/Safari injeksi class)
  var readerModeDetected = false;
  function checkReaderMode(){
    var html = document.documentElement;
    // Firefox menambahkan attribute / class saat reader mode aktif
    if(
      html.classList.contains('readability-mode') ||
      html.getAttribute('readability') !== null ||
      document.body.classList.contains('moz-reader-content') ||
      document.getElementById('moz-reader-content') ||
      document.querySelector('.reader-content, #reader-estimated-time, .readability-styled')
    ){
      if(!readerModeDetected){
        readerModeDetected = true;
        // Hapus semua konten lirik dari DOM
        var ll = document.getElementById('ll');
        if(ll) ll.innerHTML = '<p style="color:red;font-family:sans-serif">Lirik tidak tersedia di Reader Mode. Kunjungi <a href="${BASE_URL}/lagu/${slug}">yumelyrics.my.id</a> untuk melihat konten lengkap.</p>';
      }
    }
  }

  // 4. Observer untuk deteksi perubahan DOM yang disebabkan reader mode
  if(window.MutationObserver){
    var obs = new MutationObserver(function(muts){
      muts.forEach(function(m){
        if(m.type==='attributes'||m.type==='childList') checkReaderMode();
      });
    });
    obs.observe(document.documentElement,{attributes:true,childList:true,subtree:false});
    obs.observe(document.body,{attributes:true,childList:false});
  }

  // 5. Tambahkan banyak elemen non-semantik di sekitar lirik
  // Reader mode parser (Readability.js) skip konten jika score rendah —
  // kita naikkan noise/signal ratio dengan span bertumpuk.
  // (sudah dilakukan oleh obfuscateLine, ini backup tambahan)

  // 6. Polling ringan sebagai fallback
  setInterval(checkReaderMode, 800);
})();
</script>
<script>
/* ── YumeSubs Copy Protection (v4) ── */
(function(){
  var WATERMARK = '\\n\\n© YumeSubs — yumelyrics.my.id';

  /* Admin check: murni via closure — tidak ada satupun property yang diekspose ke window.
     _verifiedAdmin hanya bisa diset lewat __yumeAuthBridge yang di-delete setelah dipakai
     satu kali oleh applyAuthState(). Setelah itu channel tertutup selamanya. */
  var _verifiedAdmin = false;
  var _bridgeUsed = false;
  // Bridge satu kali pakai — setelah applyAuthState() memanggil ini, langsung dihapus dari window
  Object.defineProperty(window, '__yumeAuthBridge', {
    configurable: true,
    get: function(){ return undefined; },
    set: function(val){
      if(_bridgeUsed) return; // tolak semua call setelah pertama
      _bridgeUsed = true;
      _verifiedAdmin = (val === true);
      // Hapus bridge dari window supaya tidak bisa dipanggil lagi dari DevTools
      try{ delete window.__yumeAuthBridge; } catch(ex){}
    }
  });

  function isProtected(){ return !_verifiedAdmin; }
  function isInput(el){ var t=el&&el.tagName; return t==='INPUT'||t==='TEXTAREA'; }

  /* 1. Blokir klik kanan */
  document.addEventListener('contextmenu', function(e){
    if(!isProtected()) return;
    e.preventDefault();
    e.stopImmediatePropagation();
  }, true); // capture phase — jalan sebelum listener lain

  /* 2. Blokir keyboard shortcut — capture phase, stopImmediatePropagation */
  document.addEventListener('keydown', function(e){
    if(!isProtected()) return;
    var k = e.key ? e.key.toLowerCase() : '';
    var code = e.code ? e.code.toLowerCase() : '';
    if(e.ctrlKey||e.metaKey){
      // Tangkap via key DAN code — handle edge case browser tertentu
      var keyOrCode = k || code;
      if(['a','c','u','s','p','i','j','x','keya','keyc','keyu','keys','keyp','keyi','keyj','keyx'].indexOf(keyOrCode)!==-1){
        // Kalau target adalah input/textarea, izinkan Ctrl+A (select all di field)
        if((k==='a'||code==='keya') && isInput(e.target)) return;
        e.preventDefault(); e.stopImmediatePropagation(); return;
      }
      if(e.shiftKey && ['i','j','c','k','s'].indexOf(k)!==-1){
        e.preventDefault(); e.stopImmediatePropagation(); return;
      }
    }
    if(k==='f12'||k==='printscreen'||k==='contextmenu'){
      e.preventDefault(); e.stopImmediatePropagation(); return;
    }
  }, true); // capture phase

  /* 3. Blokir copy — inject watermark */
  document.addEventListener('copy', function(e){
    if(!isProtected()) return;
    try{ e.clipboardData.setData('text/plain', WATERMARK); } catch(ex){}
    e.preventDefault();
    e.stopImmediatePropagation();
  }, true);

  /* 3b. Blokir cut */
  document.addEventListener('cut', function(e){
    if(!isProtected()) return;
    try{ e.clipboardData.setData('text/plain', WATERMARK); } catch(ex){}
    e.preventDefault();
    e.stopImmediatePropagation();
  }, true);

  /* 4. Blokir selectstart — capture phase */
  document.addEventListener('selectstart', function(e){
    if(!isProtected()) return;
    if(isInput(e.target)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
  }, true);

  /* 5. Blokir drag */
  document.addEventListener('dragstart', function(e){
    if(!isProtected()) return;
    if(isInput(e.target)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
  }, true);

  /* 6. selectionchange — clear seleksi di luar input.
     stopImmediatePropagation() blokir listener lain yang mungkin run duluan. */
  document.addEventListener('selectionchange', function(e){
    if(!isProtected()) return;
    if(e && e.stopImmediatePropagation) e.stopImmediatePropagation();
    var sel = window.getSelection ? window.getSelection() : null;
    if(!sel || sel.isCollapsed) return;
    var node = sel.anchorNode;
    if(!node) { sel.removeAllRanges(); return; }
    var el = node.nodeType===3 ? node.parentElement : node;
    // Cek seluruh ancestor chain — input bisa nested di div
    var cur = el;
    while(cur && cur !== document.body){
      if(isInput(cur)) return;
      cur = cur.parentElement;
    }
    sel.removeAllRanges();
  }, true);

  /* 7. [MOBILE] Touch long-press */
  document.addEventListener('touchend', function(e){
    if(!isProtected()) return;
    if(isInput(e.target)) return;
    setTimeout(function(){
      var sel = window.getSelection ? window.getSelection() : null;
      if(sel) sel.removeAllRanges();
    }, 0);
  }, { passive: true, capture: true });

  /* 8. enforceNoSelect — paksa user-select:none via inline style !important */
  function enforceNoSelect(){
    if(!isProtected()) return;
    // Clear selection setiap tick — sempitkan window bypass Ctrl+A
    var sel = window.getSelection ? window.getSelection() : null;
    if(sel && !sel.isCollapsed){
      var node = sel.anchorNode;
      var el = node ? (node.nodeType===3 ? node.parentElement : node) : null;
      var inInput = false;
      var cur = el;
      while(cur && cur !== document.body){ if(isInput(cur)){inInput=true;break;} cur=cur.parentElement; }
      if(!inInput) sel.removeAllRanges();
    }
    var targets = [document.body, document.getElementById('ll')].filter(Boolean);
    var lyricEls = document.querySelectorAll('.ljp,.lro,.lid,.ll-item,.lyric-left,.lyric-right');
    lyricEls.forEach(function(el){ targets.push(el); });
    targets.forEach(function(el){
      el.style.setProperty('-webkit-user-select','none','important');
      el.style.setProperty('-moz-user-select','none','important');
      el.style.setProperty('-ms-user-select','none','important');
      el.style.setProperty('user-select','none','important');
      el.style.setProperty('-webkit-touch-callout','none','important');
    });
  }
  enforceNoSelect();
  // Interval 250ms — window bypass Ctrl+A makin sempit
  var _enforceInterval = setInterval(enforceNoSelect, 250);

  /* 9. MutationObserver — reset proteksi kalau style/class diubah dari DevTools */
  (function(){
    if(!window.MutationObserver) return;
    var obs = new MutationObserver(function(){
      if(isProtected()) enforceNoSelect();
    });
    var ll = document.getElementById('ll');
    if(ll) obs.observe(ll, { attributes:true, attributeFilter:['style','class'], subtree:true, childList:true });
    obs.observe(document.body, { attributes:true, attributeFilter:['style','class'] });
    // Pantau juga html element (kalau DevTools nambah is-admin class di root)
    obs.observe(document.documentElement, { attributes:true, attributeFilter:['class'] });
  })();

  /* 10. Blokir window.print() */
  try{ Object.defineProperty(window, 'print', { value:function(){return false;}, writable:false, configurable:false }); } catch(ex){}

  /* 11. CSS injection via <style> tag dengan guard ketat */
  (function(){
    var STYLE_ID = 'yume-noselect-v4';
    var STYLE_CSS = 'html,body,#ll,.ljp,.lro,.lid,.ll-item,.lyric-left,.lyric-right,[data-obf]{-webkit-user-select:none!important;-moz-user-select:none!important;-ms-user-select:none!important;user-select:none!important;-webkit-touch-callout:none!important;}input,textarea,*[contenteditable]{-webkit-user-select:text!important;-moz-user-select:text!important;user-select:text!important;}';

    function injectStyle(){
      var existing = document.getElementById(STYLE_ID);
      if(existing){
        // Pastikan konten tidak diubah
        if(existing.textContent !== STYLE_CSS) existing.textContent = STYLE_CSS;
        return;
      }
      var s = document.createElement('style');
      s.id = STYLE_ID;
      s.textContent = STYLE_CSS;
      document.head.appendChild(s);
    }
    injectStyle();

    // Guard: kalau style tag dihapus atau dimodifikasi, inject ulang
    if(window.MutationObserver){
      var headObs = new MutationObserver(function(muts){
        if(!isProtected()) return;
        var needReInject = false;
        muts.forEach(function(m){
          m.removedNodes.forEach(function(n){ if(n.id===STYLE_ID) needReInject=true; });
          // Kalau ada childList change di head, cek juga konten style
          if(m.type==='childList') needReInject = true;
        });
        if(needReInject) injectStyle();
      });
      headObs.observe(document.head, { childList:true, subtree:false });
      // Pantau juga perubahan textContent style tag
      var styleEl = document.getElementById(STYLE_ID);
      if(styleEl){
        headObs.observe(styleEl, { characterData:true, childList:true });
      }
    }
  })();

  /* 12. Proteksi tambahan: disable window.getSelection override */
  (function(){
    var _origGetSel = window.getSelection.bind(window);
    // Tidak kita override — biarkan native, tapi selectionchange sudah handle clear
  })();

})();
</script>
<div id="rm-decoy-wrap">
  <article class="rm-poison" id="rm-a1"><p>Halaman ini menggunakan teknologi interaktif yang tidak dapat ditampilkan dalam Reader Mode. Lirik dilindungi dengan enkripsi DOM berbasis JavaScript dan hanya dapat ditampilkan melalui browser tanpa Reader Mode aktif. Silakan kunjungi yumelyrics.my.id secara langsung untuk melihat lirik lengkap beserta terjemahan Indonesia.</p><p>© YumeSubs — yumelyrics.my.id — Semua lirik dilindungi hak cipta.</p></article>
  <article class="rm-poison" id="rm-a2"><p>Konten pada halaman ini tidak kompatibel dengan Reader Mode. YumeSubs melindungi lirik terjemahan dengan enkripsi DOM dan rendering JavaScript. Untuk melihat lirik anime beserta terjemahan Indonesia, matikan Reader Mode dan kunjungi halaman asli di yumelyrics.my.id.</p></article>
</div>
<script>
// Sembunyikan rm-decoy dari user normal setelah JS load
// Reader mode biasanya jalan sebelum/tanpa JS, jadi elemen ini tetap terlihat oleh parser
(function(){
  var w = document.getElementById('rm-decoy-wrap');
  if(w){ w.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;pointer-events:none'; }
})();
</script>
</body>
</html>`;
}

async function main() {
  const fullMode = process.env.GENERATE_MODE === 'full' || process.argv.includes('--full');
  console.log(fullMode ? '🔥 Mode: FULL (semua lagu)' : '⚡ Mode: INCREMENTAL (baru + diedit saja)');
  console.log('🔥 Menghubungkan ke Firebase...');
  const app = initializeApp(firebaseConfig);
  const db  = getFirestore(app);

  const snap = await getDocs(query(collection(db,'songs'), orderBy('order','asc')));
  const songs = snap.docs.map(d=>({id:d.id,...d.data()}));
  console.log(`📦 ${songs.length} lagu ditemukan`);

  if(!fs.existsSync('lagu')) fs.mkdirSync('lagu');

  let manifest = loadManifest();
  if (fullMode) {
    manifest = { version: 1, songs: {} };
    const oldFiles = fs.readdirSync('lagu').filter(f => f.endsWith('.html'));
    for (const f of oldFiles) fs.unlinkSync(path.join('lagu', f));
    console.log(`🗑  ${oldFiles.length} file lagu dihapus (full rebuild)`);
  }

  const today = new Date().toISOString().split('T')[0];
  const urls = [
    `  <url><loc>${BASE_URL}/</loc><lastmod>${today}</lastmod><priority>1.0</priority><changefreq>weekly</changefreq></url>`,
    `  <url><loc>${BASE_URL}/latihan.html</loc><lastmod>${today}</lastmod><priority>0.7</priority><changefreq>monthly</changefreq></url>`,
    `  <url><loc>${BASE_URL}/stories.html</loc><lastmod>${today}</lastmod><priority>0.65</priority><changefreq>weekly</changefreq></url>`,
    `  <url><loc>${BASE_URL}/contact.html</loc><lastmod>${today}</lastmod><priority>0.5</priority><changefreq>monthly</changefreq></url>`,
    `  <url><loc>${BASE_URL}/artis/</loc><lastmod>${today}</lastmod><priority>0.8</priority><changefreq>weekly</changefreq></url>`,
    `  <url><loc>${BASE_URL}/bunpou-saved.html</loc><lastmod>${today}</lastmod><priority>0.65</priority><changefreq>monthly</changefreq></url>`,
  ];
  const slugMap = {};

  // Build slug map dulu (pass 1) baru generate HTML (pass 2)
  const songMeta = []; // [{song, slug}]
  for(const song of songs){
    const slug = toSlug(song.titleRo, song.titleJp, song.id);
    let finalSlug=slug, counter=2;
    while(slugMap[finalSlug]&&slugMap[finalSlug]!==song.id) finalSlug=`${slug}-${counter++}`;
    slugMap[finalSlug]=song.id;
    songMeta.push({song, slug:finalSlug});
  }

  if (!fullMode) {
    const seeded = seedManifestFromDisk(manifest, songMeta);
    if (seeded) console.log(`📋 Manifest diisi dari ${seeded} file HTML yang sudah ada (tanpa generate ulang)`);
  }

  // Build lookup: artist (normalized) -> songs, anime -> songs
  const byArtist = {};
  const artistMeta = {};
  const byAnime  = {};
  const usedArtistSlugs = new Set();

  for(const {song, slug} of songMeta){
    const ref = {
      slug, img: song.img||'', artist: song.artist||'',
      titleMain: song.titleRo||song.titleJp||'',
      titleDisplay: song.titleJp||'',
      titleRo: song.titleRo||'',
      anime: song.anime||'',
      animeId: song.animeId||'',
    };
    const rawArtist = (song.artist || '').trim();
    if(rawArtist){
      const key = normalizeArtistKey(rawArtist);
      if(!byArtist[key]) byArtist[key] = [];
      byArtist[key].push(ref);
      if(!artistMeta[key]){
        artistMeta[key] = { displayName: rawArtist, spellings: {}, explicitSlug: '' };
      }
      const meta = artistMeta[key];
      meta.spellings[rawArtist] = (meta.spellings[rawArtist] || 0) + 1;
      const explicit = sanitizeArtistSlug(song.artistSlug);
      if(explicit) meta.explicitSlug = explicit;
    }
    if(song.anime){
      if(!byAnime[song.anime]) byAnime[song.anime]=[];
      byAnime[song.anime].push(ref);
    }
  }

  const artistSlugByKey = {};
  for(const key of Object.keys(artistMeta)){
    const meta = artistMeta[key];
    const bestName = Object.entries(meta.spellings).sort((a, b) => b[1] - a[1])[0][0];
    meta.displayName = bestName;
    const base = resolveArtistSlug(meta.explicitSlug, meta.displayName) || 'artis';
    meta.slug = allocateUniqueSlug(base, usedArtistSlugs);
    artistSlugByKey[key] = meta.slug;
  }

  if(!fs.existsSync('artis')) fs.mkdirSync('artis');
  if (fullMode) {
    const oldArtistFiles = fs.readdirSync('artis').filter(f => f.endsWith('.html'));
    for (const f of oldArtistFiles) fs.unlinkSync(path.join('artis', f));
  }

  const touchedArtistKeys = new Set();
  let generatedSongCount = 0;
  let skippedSongCount = 0;

  console.log('🎵 Generate halaman lagu...');
  for(const {song, slug: finalSlug} of songMeta){
    if (!needsSongGenerate(song, finalSlug, manifest, fullMode)) {
      skippedSongCount++;
      const prev = manifest.songs[song.id];
      if (!prev || prev.slug !== finalSlug) {
        manifest.songs[song.id] = { slug: finalSlug, hash: songContentHash(song) };
      }
      urls.push(`  <url><loc>${BASE_URL}/lagu/${finalSlug}.html</loc><lastmod>${today}</lastmod><priority>0.8</priority><changefreq>monthly</changefreq></url>`);
      continue;
    }

    const artistKey = song.artist ? normalizeArtistKey(song.artist) : '';
    if (artistKey) touchedArtistKeys.add(artistKey);
    const relByArtist = artistKey
      ? (byArtist[artistKey]||[]).filter(r=>r.slug!==finalSlug)
      : [];
    const relByAnime = song.anime
      ? (byAnime[song.anime]||[]).filter(r=>r.slug!==finalSlug)
      : [];

    const html=generateHTML(song,finalSlug,relByArtist,relByAnime,artistKey ? artistSlugByKey[artistKey] : '');
    fs.writeFileSync(path.join('lagu',`${finalSlug}.html`), html, 'utf8');
    manifest.songs[song.id] = { slug: finalSlug, hash: songContentHash(song) };
    generatedSongCount++;
    console.log(`  ✓ lagu/${finalSlug}.html`);
    const imgTag = song.img ? `
    <image:image>
      <image:loc>${song.img}</image:loc>
      <image:title>${(song.titleRo||song.titleJp||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')} - ${(song.artist||'').replace(/&/g,'&amp;')}</image:title>
      <image:caption>Lirik ${(song.titleRo||song.titleJp||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')} - ${(song.artist||'').replace(/&/g,'&amp;')} | YumeSubs</image:caption>
    </image:image>` : '';
    urls.push(`  <url><loc>${BASE_URL}/lagu/${finalSlug}.html</loc><lastmod>${today}</lastmod><priority>0.8</priority><changefreq>monthly</changefreq>${imgTag}
  </url>`);
  }

  const artistIndexList = [];
  console.log(`🎤 Halaman artis (${Object.keys(byArtist).length} total)...`);
  for(const key of Object.keys(byArtist).sort((a, b) => artistMeta[a].displayName.localeCompare(artistMeta[b].displayName, 'id'))){
    const meta = artistMeta[key];
    const aSlug = meta.slug;
    const artistPath = path.join('artis', `${aSlug}.html`);
    const needArtist = fullMode || touchedArtistKeys.has(key) || !fs.existsSync(artistPath);
    if (!needArtist) {
      artistIndexList.push({
        name: meta.displayName,
        slug: aSlug,
        count: byArtist[key].length,
        img: byArtist[key][0]?.img || '',
      });
      urls.push(`  <url><loc>${BASE_URL}/artis/${aSlug}.html</loc><lastmod>${today}</lastmod><priority>0.75</priority><changefreq>monthly</changefreq></url>`);
      continue;
    }
    const artistHtml = generateArtistHTML(meta.displayName, byArtist[key], aSlug);
    fs.writeFileSync(artistPath, artistHtml, 'utf8');
    artistIndexList.push({
      name: meta.displayName,
      slug: aSlug,
      count: byArtist[key].length,
      img: byArtist[key][0]?.img || '',
    });
    console.log(`  ✓ artis/${aSlug}.html (${byArtist[key].length} lagu) — ${meta.displayName}`);
    urls.push(`  <url><loc>${BASE_URL}/artis/${aSlug}.html</loc><lastmod>${today}</lastmod><priority>0.75</priority><changefreq>monthly</changefreq></url>`);
  }

  fs.writeFileSync(path.join('artis', 'index.html'), generateArtistIndexHTML(artistIndexList), 'utf8');
  console.log(`  ✓ artis/index.html (${artistIndexList.length} artis)`);

  const currentSongIds = new Set(songs.map(s => s.id));
  for (const id of Object.keys(manifest.songs)) {
    if (!currentSongIds.has(id)) delete manifest.songs[id];
  }

  const validSongSlugs = new Set(songMeta.map(m => m.slug));
  const validArtistSlugs = new Set(Object.values(artistMeta).map(m => m.slug));
  validArtistSlugs.add('index');
  const orphanSongs = removeOrphanHtml('lagu', validSongSlugs);
  const orphanArtis = removeOrphanHtml('artis', validArtistSlugs);
  if (orphanSongs || orphanArtis) {
    console.log(`🗑  Orphan: ${orphanSongs} lagu, ${orphanArtis} artis`);
  }

  if (fullMode || generatedSongCount > 0) {
    console.log('📖 Glosarium tata bahasa...');
    const glossUrls = buildGlossaryPages(songMeta, today);
    urls.push(...glossUrls);
  } else {
    console.log('📖 Glosarium dilewati (tidak ada lagu yang di-generate ulang)');
    if (fs.existsSync('kata')) {
      for (const f of fs.readdirSync('kata').filter(x => x.endsWith('.html'))) {
        const slug = f.replace(/\.html$/, '');
        const loc = slug === 'index' ? `${BASE_URL}/kata/` : `${BASE_URL}/kata/${slug}.html`;
        urls.push(`  <url><loc>${loc}</loc><lastmod>${today}</lastmod><priority>0.55</priority></url>`);
      }
    }
  }

  saveManifest(manifest);

  fs.writeFileSync('sitemap.xml',`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"\n        xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join('\n')}\n</urlset>`,'utf8');
  console.log(`\n✅ Selesai! ${generatedSongCount} lagu di-generate, ${skippedSongCount} dilewati (sudah mutakhir)`);
  console.log(`   Total katalog: ${songs.length} lagu · ${Object.keys(byArtist).length} artis · sitemap.xml`);
  process.exit(0);
}

main().catch(e=>{console.error(e);process.exit(1);});
