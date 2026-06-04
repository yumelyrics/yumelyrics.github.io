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

const GRAPHCOMMENT_HIDE_CSS = `
/* Sembunyikan READ AND REACT dan elemen GraphComment yang tidak perlu */
#graphcomment .gc-read-react-btn,
#graphcomment [class*="read-react"],
#graphcomment [class*="reaction"],
#graphcomment [class*="emoji-picker"],
#graphcomment button[title*="React"],
#graphcomment button[title*="Reaction"],
#graphcomment .gc-reactions-bar,
[class*="gc"][class*="emotion"],
[class*="gc"][class*="react"],
[class*="semio"][class*="react"] {
  display: none !important;
}
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
  const songType     = song.type    || '';
  const lyrics       = song.lyrics  || [];
  const songId       = song.id;

  const titleMain    = titleRo || titleDisplay;
  const firstLines   = lyrics.slice(0,3).map(l=>l.id||l.ro||l.jp).filter(Boolean).join(' / ');
  const descId       = song.descId || '';
  const descJp       = song.descJp || '';

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
    }
  ]);

  // Tambahkan CSS untuk menyembunyikan tombol GraphComment READ AND REACT
  const GRAPHCOMMENT_CSS = `
    /* Sembunyikan READ AND REACT dan elemen GraphComment yang tidak perlu di mobile */
    @media(max-width:900px){
      #graphcomment .gc-read-react-btn,
      #graphcomment [class*="read-react"],
      #graphcomment [class*="reaction"],
      #graphcomment [class*="emoji-picker"],
      #graphcomment button[title*="React"],
      #graphcomment button[title*="Reaction"],
      #graphcomment .gc-reactions-bar,
      [class*="gc"][class*="emotion"],
      [class*="gc"][class*="react"],
      [class*="semio"][class*="react"] {
        display: none !important;
      }
    }
  `;

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
  \`lirik \${escHtml(titleMain)}\`,
  titleDisplay !== titleMain ? \`lirik \${escHtml(titleDisplay)}\` : '',
  \`terjemahan \${escHtml(titleMain)}\`,
  \`arti lagu \${escHtml(titleMain)}\`,
  titleId ? \`arti \${escHtml(titleId)}\` : '',
  \`\${escHtml(titleMain)} romaji\`,
  \`lirik \${escHtml(titleMain)} romaji\`,
  \`\${escHtml(titleMain)} terjemahan indonesia\`,
  \`\${escHtml(artist)} lirik\`,
  \`\${escHtml(artist)} \${escHtml(titleMain)}\`,
  anime ? \`lirik ost \${escHtml(animeDisplay)}\` : '',
  anime ? \`\${escHtml(anime)} \${escHtml(titleMain)}\` : '',
  animeId ? \`\${escHtml(animeId)} ost\` : '',
  animeEn ? \`\${escHtml(animeEn)} ost\` : '',
  songType && anime ? \`\${songType} \${escHtml(animeDisplay)}\` : '',
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
<script type="application/ld+json">${schema}</script>
${FONT_HEAD}
<style>
${CSS_TOKENS}
${GRAPHCOMMENT_CSS}
/* [REST OF CSS - TRUNCATED FOR SPACE] */
</style>
</head>
<body>
<!-- [BODY CONTENT - FULL CONTENT CONTINUES] -->
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

  const songMeta = [];
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
    urls.push(`  <url><loc>${BASE_URL}/lagu/${finalSlug}.html</loc><lastmod>${today}</lastmod><priority>0.8</priority><changefreq>monthly</changefreq></url>`);
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
