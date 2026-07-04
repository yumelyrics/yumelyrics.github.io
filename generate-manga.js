// generate-manga.js — v2026-07
// GitHub Actions: ambil data Firestore → generate HTML per chapter manga/komik terjemahan
// Pola sama persis dengan generate-songs.js (manifest, htmlDirty, Discord, komentar, sitemap)
//
// Firestore collections:
//   manga_series/{id}    → metadata series (judul, cover, deskripsi, dsb.)
//   manga_chapters/{id}  → data chapter (pages[], seriesId, chapterNum, dsb.)
//   manga_chapters/{id}/comments/{cmId} → sistem komentar
//
// Output:
//   /manga/index.html              → katalog semua series
//   /manga/{seriesSlug}.html       → halaman series (daftar chapter)
//   /manga/{seriesSlug}-ch{NNN}.html → halaman reader chapter

import { initializeApp }           from 'firebase/app';
import { getFirestore, collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import fs                          from 'fs';
import { writeFile as fsWrite }    from 'fs/promises';
import path                        from 'path';
import crypto                      from 'crypto';
import { fileURLToPath }           from 'url';

let minifyHtmlTerser;
try {
  ({ minify: minifyHtmlTerser } = await import('html-minifier-terser'));
} catch { minifyHtmlTerser = async (html) => html; }

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── CONFIG — sesuaikan sebelum deploy ────────────────────────────────────────
const DISCORD_WEBHOOK_URL   = process.env.DISCORD_WEBHOOK_URL || '';
const DISCORD_SERVER_URL    = 'https://discord.gg/SW9bTRHK8H';
const DISCORD_POPUP_IMAGE   = 'https://raw.githubusercontent.com/yumelyrics/yumelyrics.github.io/refs/heads/main/images/miku.jpg';
const DISCORD_POPUP_IMAGE_OPT = `https://wsrv.nl/?url=${encodeURIComponent(DISCORD_POPUP_IMAGE)}&w=640&h=300&fit=cover&output=webp&q=70`;

const firebaseConfig = {
  apiKey:            process.env.FIREBASE_API_KEY,
  authDomain:        'yumesubs7.firebaseapp.com',
  projectId:         'yumesubs7',
  storageBucket:     'yumesubs7.firebasestorage.app',
  messagingSenderId: '1076202015626',
  appId:             '1:1076202015626:web:ce89fb668eb6b2bd021673',
};

const BASE_URL      = 'https://yumelyrics.my.id'; // ganti kalau pakai subdomain
const MANGA_DIR     = 'manga';
const MANIFEST_PATH = '.yume-manga-manifest.json';
const DISCORD_ROLE  = '<@&1234567890>'; // ganti dengan role ID Discord kamu
// ─────────────────────────────────────────────────────────────────────────────

// ── Utilities ─────────────────────────────────────────────────────────────────
function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function sitemapEscape(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function sitemapDate(d = new Date()) { return d.toISOString().split('T')[0]; }
function sitemapLastmod(fp, fallback) {
  try { if (fs.existsSync(fp)) return sitemapDate(fs.statSync(fp).mtime); } catch(_){}
  return fallback;
}

function toSlug(text, fallback) {
  if (text) return text.toLowerCase().replace(/[^a-z0-9\s-]/g,'').trim().replace(/\s+/g,'-').replace(/-+/g,'-').substring(0,60);
  return fallback || 'chapter';
}

function chapterSlug(seriesSlug, chapterNum) {
  return `${seriesSlug}-ch${String(chapterNum).padStart(3,'0')}`;
}

function wsrvUrl(url, w, q = 80) {
  if (!url || !url.startsWith('http')) return url;
  return `https://wsrv.nl/?url=${encodeURIComponent(url)}&w=${w}&output=webp&q=${q}`;
}

async function pConcurrent(n, tasks) {
  let i = 0;
  async function worker() { while (i < tasks.length) await tasks[i++](); }
  await Promise.all(Array.from({ length: Math.min(n, tasks.length) }, worker));
}

const MINIFY_OPTIONS = {
  collapseWhitespace: true, removeComments: true,
  minifyCSS: true, minifyJS: true,
  removeAttributeQuotes: true, removeEmptyAttributes: true,
};
async function minify(html) {
  try { return await minifyHtmlTerser(html, MINIFY_OPTIONS); } catch { return html; }
}

// ── Manifest ──────────────────────────────────────────────────────────────────
function loadManifest() {
  try {
    if (fs.existsSync(MANIFEST_PATH)) {
      const d = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
      if (d && typeof d.chapters === 'object') return d;
    }
  } catch(_){}
  return { version: 1, chapters: {} };
}
function saveManifest(m) {
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(m, null, 2) + '\n', 'utf8');
}

function chapterContentHash(ch) {
  const p = {
    seriesId:     ch.seriesId || '',
    seriesTitle:  ch.seriesTitle || '',
    seriesSlug:   ch.seriesSlug || '',
    chapterNum:   ch.chapterNum ?? 0,
    chapterTitle: ch.chapterTitle || '',
    cover:        ch.cover || '',
    pages:        (ch.pages || []).join('|'),
    description:  ch.description || '',
    translator:   ch.translator || '',
    status:       ch.status || '',
  };
  return crypto.createHash('sha256').update(JSON.stringify(p)).digest('hex').slice(0,16);
}

function needsGenerate(ch, slug, manifest) {
  const fp = path.join(MANGA_DIR, `${slug}.html`);
  if (!fs.existsSync(fp)) return true;
  const prev = manifest.chapters[ch.id];
  if (!prev || prev.slug !== slug) return true;
  if (ch.htmlDirty === true || ch.htmlDirty === 'true') {
    return !prev || prev.hash !== chapterContentHash(ch);
  }
  return false;
}

async function clearDirtyFlag(db, chapterId) {
  try { await updateDoc(doc(db, 'manga_chapters', chapterId), { htmlDirty: false }); }
  catch(e) { console.warn(`  ⚠ Gagal clear htmlDirty untuk ${chapterId}:`, e.message); }
}

// ── Discord ───────────────────────────────────────────────────────────────────
async function sendDiscordNotification(newChapters, success = true) {
  if (!DISCORD_WEBHOOK_URL) return;
  try {
    const count = newChapters.length;
    let title, desc, color;
    if (!success) {
      title = '❌ Generate Manga Gagal';
      desc  = 'Terjadi error saat generate halaman manga.';
      color = 15158332;
    } else {
      title = '📖 Chapter Baru Diupload';
      desc  = `**${count}** chapter baru berhasil diupload.`;
      color = 3447003;
    }
    const lines = newChapters.slice(0, 10).map(c => {
      const num = `Ch. ${c.chapterNum}`;
      const t   = c.chapterTitle ? ` — ${c.chapterTitle}` : '';
      return `• [${c.seriesTitle} ${num}${t}](${c.url})`;
    });
    if (count > 10) lines.push(`_...dan ${count - 10} chapter lainnya_`);

    const firstImg = newChapters.length > 0 ? newChapters[0].cover : '';
    const embed = {
      title, description: desc, color, url: `${BASE_URL}/${MANGA_DIR}/`,
      fields: [
        { name: '📚 Chapter Baru', value: lines.join('\n') || '_–_', inline: false },
        { name: '🔗 Katalog', value: `[Lihat semua](${BASE_URL}/${MANGA_DIR}/)`, inline: true },
      ],
      footer: { text: 'yumelyrics.my.id · manga' },
      timestamp: new Date().toISOString(),
    };
    if (firstImg) embed.thumbnail = { url: firstImg };

    await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: DISCORD_ROLE, embeds: [embed] }),
    }).then(r => {
      if (r.ok) console.log(`✓ Notif Discord: ${count} chapter baru.`);
      else      r.text().then(t => console.warn(`⚠ Discord error ${r.status}: ${t}`));
    });
  } catch(e) { console.warn('⚠ Gagal kirim notif Discord:', e.message); }
}

// ── CSS shared constants ──────────────────────────────────────────────────────
const FONT_URL  = 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;1,400&family=DM+Sans:wght@400;500;700&family=Syne:wght@400;500;600;700&display=swap';
const FONT_HEAD = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>`;
const FONT_LINK = `<link rel="preload" href="${FONT_URL}" as="style" onload="this.onload=null;this.rel='stylesheet'"><noscript><link rel="stylesheet" href="${FONT_URL}"></noscript>`;
const THEME_BOOT = `<script>(function(){var t=localStorage.getItem('ym_theme');if(t==='dark')document.documentElement.setAttribute('data-theme','dark');})()</script>`;

const CSS_TOKENS = `
html{-webkit-text-size-adjust:100%;text-size-adjust:100%}
:root{
  --ink:#0a0812;--paper:#f5f0ea;--cream:#ede7dc;--smoke:#c8bfb0;--ash:#8c8278;
  --gold:#c9a96e;--gold2:#e8c98a;--rose:#c4637a;--plum:#7c4d6e;
  --dusk:#6b5b7a;--sakura:#e8b4c8;--sakura-dim:rgba(196,99,122,.12);
  --mist:rgba(10,8,18,.06);--border:rgba(10,8,18,.1);
  --serif:'Cormorant Garamond',Georgia,serif;--sans:'Syne',system-ui,sans-serif;--ro:'DM Sans',system-ui,sans-serif;
  --bg:var(--paper);--text:var(--ink);--muted:var(--ash);
  --accent:var(--rose);--accent2:var(--gold);
  --nm:background .35s ease,color .35s ease,border-color .35s ease;
}
[data-theme="dark"]{
  --ink:#e8e2d9;--paper:#0f0d0b;--cream:#1a1714;--smoke:#4a4540;--ash:#7a7068;
  --gold:#d4a96e;--gold2:#e8c98a;--rose:#d4758a;
  --mist:rgba(232,226,217,.05);--border:rgba(232,226,217,.1);
  --bg:var(--paper);--text:var(--ink);--muted:var(--ash);--accent:var(--rose);
}
`;

const NAV_CSS = `
nav{position:sticky;top:0;z-index:100;display:flex;align-items:center;justify-content:space-between;padding:1rem 3rem;background:var(--paper);border-bottom:1px solid var(--border);transition:var(--nm)}
@media(min-width:768px){nav{background:rgba(245,240,234,.92);backdrop-filter:blur(20px)}}
[data-theme="dark"] nav{background:rgba(15,13,11,.92)}
.nav-logo{display:flex;flex-direction:column;gap:.05rem;text-decoration:none}
.nljp{font-size:1.05rem;font-weight:700;color:var(--ink);letter-spacing:.05em;font-family:var(--sans)}
.nlen{font-size:.52rem;color:var(--ash);letter-spacing:.3em;text-transform:uppercase;font-weight:700}
.nav-links{display:flex;gap:.25rem;align-items:center}
#theme-toggle{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;background:none;border:1px solid var(--border);cursor:pointer;flex-shrink:0;position:relative;overflow:hidden;padding:0;transition:var(--nm)}
#theme-toggle svg{width:14px;height:14px;stroke:var(--ash);fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;position:absolute;transition:opacity .25s,transform .25s}
#theme-toggle .icon-sun{opacity:1;transform:scale(1)}
#theme-toggle .icon-moon{opacity:0;transform:scale(.7) rotate(45deg)}
[data-theme="dark"] #theme-toggle .icon-sun{opacity:0;transform:scale(.7) rotate(-45deg)}
[data-theme="dark"] #theme-toggle .icon-moon{opacity:1;transform:scale(1)}
#nav-menu-btn{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;background:none;border:1px solid var(--border);cursor:pointer;flex-direction:column;padding:0;gap:0}
#nav-menu-btn span{display:block;width:14px;height:1.5px;background:var(--ash);transition:transform .25s,opacity .2s,width .25s}
#nav-menu-btn span:nth-child(2){margin:3px 0}
#nav-menu-btn.open span:nth-child(1){transform:translateY(4.5px) rotate(45deg)}
#nav-menu-btn.open span:nth-child(2){opacity:0;width:0}
#nav-menu-btn.open span:nth-child(3){transform:translateY(-4.5px) rotate(-45deg)}
#nav-dropdown{position:absolute;top:calc(100% + 1px);right:3rem;z-index:200;background:var(--paper);border:1px solid var(--border);display:none;flex-direction:column;min-width:160px;box-shadow:0 8px 32px rgba(10,8,18,.1)}
[data-theme="dark"] #nav-dropdown{background:var(--cream)}
#nav-dropdown.open{display:flex}
.nd-item{background:none;border:none;font-family:var(--sans);font-size:.68rem;color:var(--ash);letter-spacing:.18em;text-transform:uppercase;padding:.75rem 1.2rem;cursor:pointer;text-align:left;width:100%;font-weight:600;text-decoration:none;display:block;white-space:nowrap}
.nd-item:hover,.nd-item.on{color:var(--ink);background:var(--cream)}
@media(max-width:768px){nav{padding:.85rem 1rem}#nav-dropdown{right:1rem}}
`;

const NAV_SCRIPT = `<script>
(function(){
  var s=localStorage.getItem('ym_theme');
  if(s==='dark')document.documentElement.setAttribute('data-theme','dark');
  window.toggleTheme=function(){
    var r=document.documentElement,d=r.getAttribute('data-theme')==='dark';
    d?(r.removeAttribute('data-theme'),localStorage.setItem('ym_theme','light'))
     :(r.setAttribute('data-theme','dark'),localStorage.setItem('ym_theme','dark'));
  };
  function toggleNav(){
    var b=document.getElementById('nav-menu-btn'),d=document.getElementById('nav-dropdown');
    if(!b||!d)return;
    var o=d.classList.toggle('open');
    b.classList.toggle('open',o);b.setAttribute('aria-expanded',o);
  }
  window.toggleNavMenu=toggleNav;
  document.addEventListener('click',function(e){
    var b=document.getElementById('nav-menu-btn'),d=document.getElementById('nav-dropdown');
    if(!d||!d.classList.contains('open')||!b)return;
    if(!b.contains(e.target)&&!d.contains(e.target)){d.classList.remove('open');b.classList.remove('open');b.setAttribute('aria-expanded',false);}
  });
})();
<\/script>`;

function buildNav(prefix, active) {
  const p = prefix || '';
  const links = [
    { href: `${p}index.html`,        label: 'Katalog Lagu' },
    { href: `${p}manga/index.html`,  label: 'Manga',    key: 'manga'  },
    { href: `${p}artis/index.html`,  label: 'Artis'    },
    { href: `${p}resources.html`,    label: 'Resources' },
    { href: `${p}contact.html`,      label: 'Hubungi'  },
  ];
  return `<nav>
  <a class="nav-logo" href="${p}index.html">
    <div class="nljp">夢Lyrics</div>
    <div class="nlen">YumeSubs</div>
  </a>
  <div class="nav-links">
    <button id="theme-toggle" onclick="toggleTheme()" title="Toggle tema" aria-label="Toggle tema">
      <svg class="icon-sun" viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
      <svg class="icon-moon" viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
    </button>
    <button id="nav-menu-btn" onclick="toggleNavMenu()" aria-label="Menu" aria-expanded="false">
      <span></span><span></span><span></span>
    </button>
  </div>
  <div id="nav-dropdown">
    ${links.map(l => `<a class="nd-item${active===l.key?' on':''}" href="${l.href}">${l.label}</a>`).join('')}
  </div>
</nav>`;
}

const DISCORD_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 127.14 96.36" aria-hidden="true"><path fill="currentColor" d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z"/></svg>`;

const DISCORD_POPUP_CSS = `
.discord-popup-overlay{position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;padding:1.25rem;background:rgba(10,8,18,.72);backdrop-filter:blur(8px)}
.discord-popup-overlay.is-hidden{display:none!important}
body.discord-popup-lock{overflow:hidden}
.discord-popup-row{display:flex;flex-direction:row;align-items:flex-start;gap:.65rem;width:min(92vw,380px)}
.discord-popup-card{width:100%;background:linear-gradient(160deg,#2c2f33 0%,#1e2124 100%);border-radius:14px;overflow:hidden;box-shadow:0 24px 64px rgba(0,0,0,.45);border:1px solid rgba(88,101,242,.35);animation:discordPopIn .35s cubic-bezier(.34,1.2,.64,1)}
@keyframes discordPopIn{from{opacity:0;transform:scale(.92) translateY(12px)}to{opacity:1;transform:none}}
.discord-popup-close{flex-shrink:0;width:40px;height:40px;border:2px solid rgba(255,255,255,.28);border-radius:50%;background:#2c2f33;color:#fff;font-size:1.1rem;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .2s;margin-top:.15rem}
.discord-popup-close:hover{background:#5865F2}
.discord-popup-img{display:block;width:100%;aspect-ratio:19/9;object-fit:cover;background:#1e2124}
.discord-popup-title{margin:0;padding:1rem 1.1rem .25rem;font-family:var(--sans);font-size:.95rem;font-weight:700;color:#eeeef2;text-align:center;text-transform:lowercase}
.discord-popup-btn{display:flex;align-items:center;justify-content:center;gap:.55rem;margin:1rem 1.1rem 1.25rem;padding:.85rem 1rem;background:#5865F2;color:#fff;text-decoration:none;border-radius:8px;font-family:var(--sans);font-size:.72rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;transition:background .2s}
.discord-popup-btn:hover{background:#4752c4}
.discord-popup-btn svg{width:22px;height:17px;flex-shrink:0}
.discord-popup-fab{position:fixed;bottom:max(1rem,env(safe-area-inset-bottom,0px));right:max(1rem,env(safe-area-inset-right,0px));z-index:198;width:52px;height:52px;border-radius:50%;background:linear-gradient(160deg,#5865F2 0%,#4752c4 100%);color:#fff;display:none;align-items:center;justify-content:center;box-shadow:0 6px 24px rgba(88,101,242,.45);text-decoration:none;transition:transform .2s}
.discord-popup-fab.is-visible{display:flex}
.discord-popup-fab:hover{transform:scale(1.08)}
.discord-popup-fab svg{width:26px;height:20px}
@media(max-width:768px){.discord-popup-overlay{backdrop-filter:none;background:rgba(10,8,18,.9)}.discord-popup-row{position:relative}.discord-popup-close{position:absolute;top:-12px;right:-12px;z-index:5;width:34px;height:34px;font-size:.95rem;margin-top:0}}
`;

function buildDiscordPopup() {
  return `
<div id="discord-popup-overlay" class="discord-popup-overlay is-hidden" role="dialog" aria-modal="true" aria-hidden="true">
  <div class="discord-popup-row">
    <div class="discord-popup-card">
      <img class="discord-popup-img" data-src="${escHtml(DISCORD_POPUP_IMAGE_OPT)}" data-fallback="${escHtml(DISCORD_POPUP_IMAGE)}" alt="" width="380" height="180" loading="lazy" decoding="async">
      <p class="discord-popup-title">server discord yumelyrics</p>
      <a class="discord-popup-btn" href="${escHtml(DISCORD_SERVER_URL)}" target="_blank" rel="noopener noreferrer">${DISCORD_SVG} Gabung Server Discord</a>
    </div>
    <button class="discord-popup-close" id="discord-popup-close" aria-label="Tutup">✕</button>
  </div>
</div>
<a class="discord-popup-fab" href="${escHtml(DISCORD_SERVER_URL)}" target="_blank" rel="noopener noreferrer" id="discord-popup-fab" aria-label="Discord">${DISCORD_SVG}</a>
<script>
(function(){
  var DELAY=12000,COOLDOWN_KEY='ym_discord_popup_seen',COOLDOWN=7*24*3600*1000;
  var overlay=document.getElementById('discord-popup-overlay');
  var closeBtn=document.getElementById('discord-popup-close');
  var fab=document.getElementById('discord-popup-fab');
  function dismiss(){
    if(!overlay)return;
    overlay.classList.add('is-hidden');overlay.setAttribute('aria-hidden','true');
    document.body.classList.remove('discord-popup-lock');
    if(fab)fab.classList.add('is-visible');
    try{localStorage.setItem(COOLDOWN_KEY,Date.now());}catch(e){}
  }
  function show(){
    if(!overlay)return;
    var img=overlay.querySelector('.discord-popup-img');
    if(img&&img.dataset.src&&!img.src.includes('wsrv')){
      img.src=img.dataset.src;
      img.onerror=function(){if(img.dataset.fallback)img.src=img.dataset.fallback;};
    }
    overlay.classList.remove('is-hidden');overlay.setAttribute('aria-hidden','false');
    document.body.classList.add('discord-popup-lock');
  }
  if(closeBtn)closeBtn.addEventListener('click',dismiss);
  overlay&&overlay.addEventListener('click',function(e){if(e.target===overlay)dismiss();});
  try{
    var seen=parseInt(localStorage.getItem(COOLDOWN_KEY)||'0',10);
    if(Date.now()-seen>COOLDOWN)setTimeout(show,DELAY);
    else if(fab)fab.classList.add('is-visible');
  }catch(e){setTimeout(show,DELAY);}
})();
<\/script>`;
}

// ── Komentar (Firebase, pola sama dengan songs) ───────────────────────────────
function buildCommentsSection(chapterId) {
  return `
<section class="comments-section" id="comments">
  <div class="cm-wrap">
    <h2 class="cm-heading">Komentar</h2>
    <div id="cm-form-area">
      <div class="cm-input-row">
        <input id="cm-name" class="cm-input" type="text" maxlength="40" placeholder="Nama kamu..." autocomplete="off">
        <textarea id="cm-text" class="cm-input cm-textarea" maxlength="500" rows="3" placeholder="Tulis komentar..."></textarea>
        <button class="cm-submit-btn" onclick="submitComment(null)">Kirim</button>
      </div>
    </div>
    <div id="cm-list"><div class="cm-empty">Memuat komentar...</div></div>
  </div>
</section>

<script type="module">
const CHAPTER_ID = ${JSON.stringify(chapterId)};
const FB_CFG = {
  apiKey:'AIzaSyA3dKYhDxX3DE5CAI_yQbjvUUdsBR0QeS8',
  authDomain:'yumesubs7.firebaseapp.com',projectId:'yumesubs7',
  storageBucket:'yumesubs7.firebasestorage.app',
  messagingSenderId:'1076202015626',appId:'1:1076202015626:web:ce89fb668eb6b2bd021673'
};

function escHtml(s){
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function renderMention(s){
  return escHtml(s).replace(/(^|\\s)(@[^\\s<]{1,40})/g,'$1<span class="cm-mention">$2</span>');
}
function timeAgo(ts){
  var d=Date.now()-(ts?.seconds?ts.seconds*1000:(ts||0)),m=Math.floor(d/60000);
  if(m<1)return 'baru saja';if(m<60)return m+'m lalu';
  var h=Math.floor(m/60);if(h<24)return h+'j lalu';
  var dy=Math.floor(h/24);if(dy<30)return dy+'h lalu';
  return Math.floor(dy/30)+'bln lalu';
}

(window.requestIdleCallback||function(cb){setTimeout(cb,300)})(async function(){
  try{
    var fb=await import('https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js');
    var fs=await import('https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js');
    var app=fb.initializeApp(FB_CFG,'manga_comments_'+CHAPTER_ID);
    var db=fs.getFirestore(app);
    var colRef=fs.collection(db,'manga_chapters',CHAPTER_ID,'comments');

    // Realtime listener komentar
    fs.onSnapshot(
      fs.query(colRef,fs.orderBy('createdAt','asc')),
      function(snap){
        var list=document.getElementById('cm-list');
        if(!list)return;
        if(snap.empty){list.innerHTML='<div class="cm-empty">Belum ada komentar. Jadilah yang pertama!</div>';return;}
        var html='';
        snap.forEach(function(d){
          var c=d.data(),id=d.id;
          var name=escHtml(c.name||'Anonim').substring(0,40);
          var text=renderMention(c.text||'');
          var time=timeAgo(c.createdAt);
          html+='<div class="cm-item" id="cm-'+id+'">'+
            '<div class="cm-meta"><span class="cm-author">'+name+'</span><span class="cm-time">'+time+'</span></div>'+
            '<div class="cm-text">'+text+'</div>'+
            '<div class="cm-actions">'+
              '<button class="cm-reply-btn" onclick="startReply(\''+id+'\',\''+name+'\')">↩ Balas</button>'+
            '</div>'+
            (c.replyToName?'<div class="cm-reply-ref">↩ Membalas '+escHtml(c.replyToName)+'</div>':'')+
          '</div>';
        });
        list.innerHTML=html;
      },
      function(e){console.warn('cm snapshot error',e);}
    );

    // Submit komentar
    window.submitComment=async function(replyToId){
      var nameEl=document.getElementById('cm-name');
      var textEl=document.getElementById('cm-text');
      var name=(nameEl?.value||'').trim()||'Anonim';
      var text=(textEl?.value||'').trim();
      if(!text){alert('Tulis komentarmu dulu!');return;}
      if(text.length>500){alert('Komentar terlalu panjang (maks 500 karakter).');return;}
      var data={
        name:name.substring(0,40),text:text.substring(0,500),
        chapterId:CHAPTER_ID,createdAt:fs.serverTimestamp(),
      };
      if(replyToId){
        var rSnap=await fs.getDoc(fs.doc(db,'manga_chapters',CHAPTER_ID,'comments',replyToId)).catch(()=>null);
        if(rSnap?.exists()){data.replyToId=replyToId;data.replyToName=(rSnap.data().name||'Anonim').substring(0,40);}
      }
      try{
        await fs.addDoc(colRef,data);
        if(textEl)textEl.value='';
        window._replyTarget=null;
        var ra=document.getElementById('cm-reply-indicator');
        if(ra)ra.remove();
      }catch(e){alert('Gagal kirim komentar: '+e.message);}
    };

    window.startReply=function(id,name){
      window._replyTarget=id;
      var old=document.getElementById('cm-reply-indicator');
      if(old)old.remove();
      var div=document.createElement('div');
      div.id='cm-reply-indicator';div.className='cm-reply-indicator';
      div.innerHTML='↩ Membalas <strong>'+escHtml(name)+'</strong> <button onclick="cancelReply()">✕</button>';
      var fa=document.getElementById('cm-form-area');
      if(fa)fa.appendChild(div);
      var tb=document.getElementById('cm-text');
      if(tb)tb.focus();
    };
    window.cancelReply=function(){
      window._replyTarget=null;
      var el=document.getElementById('cm-reply-indicator');
      if(el)el.remove();
    };

    // Override submitComment untuk pakai _replyTarget
    var _origSubmit=window.submitComment;
    window.submitComment=function(id){_origSubmit(id||window._replyTarget||null);};

  }catch(e){
    var list=document.getElementById('cm-list');
    if(list)list.innerHTML='<div class="cm-empty">Komentar tidak dapat dimuat.</div>';
    console.warn('cm init error',e);
  }
});
<\/script>`;
}

const COMMENTS_CSS = `
.comments-section{padding:3rem 3.5rem 5rem;border-top:1px solid var(--border);background:var(--cream);transition:var(--nm)}
[data-theme="dark"] .comments-section{background:var(--cream)}
.cm-wrap{max-width:720px;margin:0 auto}
.cm-heading{font-family:var(--serif);font-size:1.8rem;font-weight:300;font-style:italic;color:var(--ink);margin-bottom:1.5rem}
.cm-input-row{display:flex;flex-direction:column;gap:.65rem;margin-bottom:2rem}
.cm-input{background:var(--paper);border:1px solid var(--border);border-radius:4px;color:var(--ink);font-family:var(--ro);font-size:.88rem;padding:.6rem .9rem;outline:none;transition:border-color .15s;resize:vertical}
.cm-input:focus{border-color:var(--gold)}
.cm-textarea{min-height:80px}
.cm-submit-btn{align-self:flex-start;background:var(--ink);color:var(--paper);border:none;font-family:var(--sans);font-size:.68rem;font-weight:700;letter-spacing:.18em;text-transform:uppercase;padding:.6rem 1.4rem;cursor:pointer;transition:background .2s}
.cm-submit-btn:hover{background:var(--gold);color:var(--ink)}
.cm-item{padding:1rem 0;border-bottom:1px solid var(--border)}
.cm-meta{display:flex;align-items:center;gap:.75rem;margin-bottom:.35rem}
.cm-author{font-size:.8rem;font-weight:700;color:var(--ink);font-family:var(--sans)}
.cm-time{font-size:.68rem;color:var(--ash)}
.cm-text{font-size:.88rem;color:var(--ink);line-height:1.7;word-break:break-word;font-family:var(--ro)}
.cm-mention{color:var(--gold);font-weight:600}
.cm-reply-btn{background:none;border:none;color:var(--ash);font-family:var(--sans);font-size:.65rem;font-weight:600;letter-spacing:.1em;cursor:pointer;padding:.2rem 0;transition:color .15s}
.cm-reply-btn:hover{color:var(--ink)}
.cm-reply-ref{font-size:.72rem;color:var(--ash);margin-top:.3rem;padding-left:.75rem;border-left:2px solid var(--border);font-style:italic}
.cm-reply-indicator{font-size:.78rem;color:var(--ash);padding:.5rem .75rem;background:var(--paper);border:1px solid var(--border);border-radius:4px;display:flex;align-items:center;gap:.5rem}
.cm-reply-indicator button{background:none;border:none;cursor:pointer;color:var(--ash);font-size:.85rem;line-height:1}
.cm-empty{color:var(--ash);font-size:.85rem;font-family:var(--ro);padding:1rem 0}
.cm-actions{margin-top:.4rem}
@media(max-width:768px){.comments-section{padding:2rem 1.2rem 4rem}.cm-wrap{max-width:100%}}
`;

// ── Chapter page HTML ──────────────────────────────────────────────────────────
async function generateChapterHTML(chapter, slug, seriesList, prevChapter, nextChapter) {
  const seriesTitle  = chapter.seriesTitle   || '';
  const seriesSlug   = chapter.seriesSlug    || '';
  const chapterNum   = chapter.chapterNum    ?? 0;
  const chapterTitle = chapter.chapterTitle  || '';
  const cover        = chapter.cover         || '';
  const pages        = chapter.pages         || [];
  const description  = chapter.description  || '';
  const translator   = chapter.translator    || '';
  const chapterId    = chapter.id;

  const displayTitle = chapterTitle
    ? `Chapter ${chapterNum}: ${chapterTitle}`
    : `Chapter ${chapterNum}`;
  const pageTitle = `${seriesTitle} ${displayTitle} | YumeSubs`;
  const metaDesc  = description || `Baca ${seriesTitle} ${displayTitle} terjemahan bahasa Indonesia. ${pages.length} halaman.`;
  const pageUrl   = `${BASE_URL}/${MANGA_DIR}/${slug}.html`;
  const seriesUrl = `${BASE_URL}/${MANGA_DIR}/${seriesSlug}.html`;

  const prevHref = prevChapter ? `${prevChapter.slug}.html` : null;
  const nextHref = nextChapter ? `${nextChapter.slug}.html` : null;

  const schema = JSON.stringify([
    {
      '@context':'https://schema.org','@type':'ComicIssue',
      'name': displayTitle,
      'issueNumber': String(chapterNum),
      'description': metaDesc,
      'url': pageUrl,
      'inLanguage':'id',
      'isPartOf':{'@type':'ComicSeries','name':seriesTitle,'url':seriesUrl},
      ...(cover?{'image':cover}:{}),
    },
    {
      '@context':'https://schema.org','@type':'BreadcrumbList',
      'itemListElement':[
        {'@type':'ListItem','position':1,'name':'Beranda','item':BASE_URL},
        {'@type':'ListItem','position':2,'name':'Manga','item':`${BASE_URL}/${MANGA_DIR}/`},
        {'@type':'ListItem','position':3,'name':seriesTitle,'item':seriesUrl},
        {'@type':'ListItem','position':4,'name':displayTitle,'item':pageUrl},
      ]
    }
  ]);

  const pagesHTML = pages.map((url, i) =>
    `<img class="manga-page" src="${escHtml(url)}" alt="${escHtml(seriesTitle)} ${displayTitle} halaman ${i+1}" ` +
    `width="800" loading="${i < 3 ? 'eager' : 'lazy'}" decoding="${i < 3 ? 'sync' : 'async'}">`
  ).join('\n');

  const chapterNavHTML = (top) => `
<div class="chap-nav ${top?'chap-nav-top':'chap-nav-bot'}">
  ${prevHref ? `<a class="chap-nav-btn" href="${escHtml(prevHref)}">← Chapter Sebelumnya</a>` : '<span class="chap-nav-disabled">← Awal</span>'}
  <a class="chap-nav-index" href="${escHtml(seriesSlug)}.html">≡ Daftar Chapter</a>
  ${nextHref ? `<a class="chap-nav-btn" href="${escHtml(nextHref)}">Chapter Berikutnya →</a>` : '<span class="chap-nav-disabled">Terbaru →</span>'}
</div>`;

  return minify(`<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
${THEME_BOOT}
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="index,follow,max-image-preview:large">
<title>${escHtml(pageTitle)}</title>
<meta name="description" content="${escHtml(metaDesc)}">
<meta property="og:title" content="${escHtml(pageTitle)}">
<meta property="og:description" content="${escHtml(metaDesc)}">
<meta property="og:url" content="${pageUrl}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="YumeLyrics">
${cover?`<meta property="og:image" content="${escHtml(cover)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${escHtml(cover)}">`:``}
<link rel="canonical" href="${pageUrl}">
<link rel="icon" type="image/png" href="../anime_icon.png">
<script type="application/ld+json">${schema}</script>
${FONT_HEAD}
${FONT_LINK}
<style>
${CSS_TOKENS}
*{margin:0;padding:0;box-sizing:border-box}
html{scroll-behavior:smooth;background:var(--paper)}
body{background:var(--paper);color:var(--ink);font-family:var(--sans);min-height:100dvh;transition:var(--nm);overflow-x:hidden}
${NAV_CSS}
${DISCORD_POPUP_CSS}
${COMMENTS_CSS}

/* ── Chapter Hero ── */
.chap-hero{padding:3rem 3.5rem 2rem;max-width:900px}
.breadcrumb{display:flex;align-items:center;gap:.5rem;font-size:.58rem;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:var(--ash);margin-bottom:2rem;flex-wrap:wrap}
.breadcrumb a{text-decoration:none;color:inherit;transition:color .2s}.breadcrumb a:hover{color:var(--gold)}
.breadcrumb-sep{color:var(--smoke)}
.chap-series{font-family:var(--serif);font-size:1.1rem;font-weight:300;font-style:italic;color:var(--ash);margin-bottom:.4rem}
.chap-title{font-family:var(--sans);font-size:clamp(1.4rem,4vw,2.4rem);font-weight:700;color:var(--ink);line-height:1.25;margin-bottom:.75rem}
.chap-meta{display:flex;gap:1.5rem;flex-wrap:wrap;font-size:.68rem;color:var(--ash);letter-spacing:.08em}
.chap-meta span{display:flex;align-items:center;gap:.35rem}
.chap-meta strong{color:var(--ink)}

/* ── Chapter nav ── */
.chap-nav{display:flex;align-items:center;justify-content:space-between;gap:.75rem;padding:.85rem 3.5rem;border-top:1px solid var(--border);border-bottom:1px solid var(--border);background:var(--cream);flex-wrap:wrap}
.chap-nav-top{margin-bottom:0}
.chap-nav-bot{margin-top:0}
.chap-nav-btn{font-family:var(--sans);font-size:.72rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--ink);text-decoration:none;padding:.5rem .9rem;border:1px solid var(--border);transition:border-color .2s,background .2s}
.chap-nav-btn:hover{border-color:var(--gold);background:rgba(201,169,110,.08)}
.chap-nav-index{font-family:var(--sans);font-size:.72rem;font-weight:600;color:var(--ash);text-decoration:none;letter-spacing:.08em;transition:color .2s}
.chap-nav-index:hover{color:var(--ink)}
.chap-nav-disabled{font-family:var(--sans);font-size:.72rem;color:var(--smoke);letter-spacing:.08em;user-select:none}

/* ── Manga reader ── */
.manga-reader{display:flex;flex-direction:column;align-items:center;background:#111;padding:1.5rem 1rem;gap:.5rem}
.manga-page{display:block;max-width:800px;width:100%;height:auto;object-fit:contain;background:#1a1a1a}
.reader-hint{font-size:.65rem;color:#666;letter-spacing:.12em;text-transform:uppercase;text-align:center;padding:.6rem;font-family:var(--sans)}

/* ── Footer ── */
footer{display:flex;justify-content:space-between;align-items:flex-start;gap:2rem;padding:2.5rem 3.5rem;border-top:1px solid var(--border);background:var(--cream);flex-wrap:wrap;transition:var(--nm)}
[data-theme="dark"] footer{background:#070604}
.footer-brand{font-family:var(--sans);font-size:1rem;font-weight:700;color:var(--ink)}
.footer-tagline{font-size:.55rem;color:var(--ash);letter-spacing:.15em;text-transform:uppercase;margin-top:.2rem}
.footer-copy{font-size:.52rem;color:var(--smoke);margin-top:.8rem}
.footer-link{display:block;font-size:.72rem;color:var(--ash);text-decoration:none;margin-bottom:.3rem}
.footer-link:hover{color:var(--gold)}

@media(max-width:768px){
  .chap-hero{padding:2rem 1.2rem 1.5rem}
  .chap-nav{padding:.75rem 1.2rem}
  .manga-reader{padding:1rem .5rem;gap:.35rem}
  footer{padding:2rem 1.2rem;gap:1.5rem}
}
</style>
</head>
<body>
${buildNav('../', 'manga')}

<article>
  <section class="chap-hero">
    <div class="breadcrumb">
      <a href="../index.html">Beranda</a>
      <span class="breadcrumb-sep">›</span>
      <a href="index.html">Manga</a>
      <span class="breadcrumb-sep">›</span>
      <a href="${escHtml(seriesSlug)}.html">${escHtml(seriesTitle)}</a>
      <span class="breadcrumb-sep">›</span>
      <span>Chapter ${chapterNum}</span>
    </div>
    <div class="chap-series">${escHtml(seriesTitle)}</div>
    <h1 class="chap-title">${escHtml(displayTitle)}</h1>
    <div class="chap-meta">
      <span>📄 <strong>${pages.length}</strong> halaman</span>
      ${translator?`<span>✏ Penerjemah: <strong>${escHtml(translator)}</strong></span>`:''}
    </div>
  </section>

  ${chapterNavHTML(true)}

  <div class="manga-reader" id="manga-reader">
    <div class="reader-hint">Scroll ke bawah untuk membaca</div>
    ${pagesHTML}
  </div>

  ${chapterNavHTML(false)}
</article>

${buildDiscordPopup()}
${buildCommentsSection(chapterId)}

<footer>
  <div>
    <div class="footer-brand">夢Lyrics · Manga</div>
    <div class="footer-tagline">Komik Terjemahan Indonesia</div>
    <div class="footer-copy">© 2025 YumeSubs — yumelyrics.my.id</div>
  </div>
  <div>
    <a class="footer-link" href="index.html">← Semua Manga</a>
    <a class="footer-link" href="${escHtml(seriesSlug)}.html">Daftar Chapter ${escHtml(seriesTitle)}</a>
    <a class="footer-link" href="../index.html">Katalog Lagu</a>
    <a class="footer-link" href="../contact.html">Hubungi</a>
  </div>
</footer>

${NAV_SCRIPT}
</body>
</html>`);
}

// ── Series page HTML ──────────────────────────────────────────────────────────
async function generateSeriesHTML(series, chapters) {
  const title    = series.title       || '';
  const slug     = series.slug        || '';
  const cover    = series.cover       || '';
  const desc     = series.description || '';
  const genres   = series.genres      || '';
  const author   = series.author      || '';
  const status   = series.status      || '';
  const pageUrl  = `${BASE_URL}/${MANGA_DIR}/${slug}.html`;
  const metaDesc = desc || `Baca ${title} terjemahan Indonesia. ${chapters.length} chapter tersedia di YumeSubs.`;

  const statusLabel = { ongoing: 'Berlangsung', completed: 'Tamat', hiatus: 'Hiatus' }[status] || '';

  const chapterCards = chapters.map(ch => {
    const cSlug  = chapterSlug(slug, ch.chapterNum);
    const cTitle = ch.chapterTitle ? `Ch. ${ch.chapterNum} — ${ch.chapterTitle}` : `Chapter ${ch.chapterNum}`;
    return `<a class="chapter-card" href="${escHtml(cSlug)}.html">
      <span class="cc-num">Ch. ${ch.chapterNum}</span>
      <span class="cc-title">${escHtml(ch.chapterTitle || cTitle)}</span>
      <span class="cc-pages">${(ch.pages||[]).length} hal.</span>
      <span class="cc-arr">→</span>
    </a>`;
  }).join('');

  return minify(`<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
${THEME_BOOT}
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${escHtml(title)} — Manga Terjemahan | YumeSubs</title>
<meta name="description" content="${escHtml(metaDesc)}">
<meta property="og:title" content="${escHtml(title)} | YumeSubs">
<meta property="og:description" content="${escHtml(metaDesc)}">
<meta property="og:url" content="${pageUrl}">
<meta property="og:type" content="website">
${cover?`<meta property="og:image" content="${escHtml(cover)}">`:``}
<link rel="canonical" href="${pageUrl}">
<link rel="icon" type="image/png" href="../anime_icon.png">
${FONT_HEAD}${FONT_LINK}
<style>
${CSS_TOKENS}
*{margin:0;padding:0;box-sizing:border-box}
html{scroll-behavior:smooth;background:var(--paper)}
body{background:var(--paper);color:var(--ink);font-family:var(--sans);min-height:100dvh;transition:var(--nm)}
${NAV_CSS}
.series-hero{display:grid;grid-template-columns:200px 1fr;gap:3rem;padding:3rem 3.5rem 2.5rem;max-width:1000px}
.series-cover{width:200px;height:280px;object-fit:cover;box-shadow:8px 12px 0 rgba(10,8,18,.1)}
.series-cover-placeholder{width:200px;height:280px;background:var(--cream);display:flex;align-items:center;justify-content:center;font-size:3rem;color:var(--smoke)}
.series-info{display:flex;flex-direction:column;justify-content:center;gap:1rem}
.series-title{font-family:var(--serif);font-size:clamp(1.8rem,4vw,3rem);font-weight:300;font-style:italic;color:var(--ink);line-height:1.25}
.series-meta{display:flex;gap:1.5rem;flex-wrap:wrap;font-size:.68rem;color:var(--ash);letter-spacing:.08em}
.series-meta strong{color:var(--ink)}
.series-status{display:inline-block;font-size:.58rem;font-weight:700;letter-spacing:.2em;text-transform:uppercase;padding:.2rem .65rem;border:1px solid var(--border);color:var(--ash);border-radius:2px}
.series-desc{font-size:.88rem;color:var(--ash);line-height:1.8;max-width:520px;font-family:var(--ro)}
.chapter-list{padding:0 3.5rem 5rem;max-width:820px}
.chapter-list h2{font-family:var(--serif);font-size:1.6rem;font-weight:300;font-style:italic;color:var(--ink);margin-bottom:1.25rem;padding-bottom:.75rem;border-bottom:1px solid var(--border)}
.chapter-card{display:flex;align-items:center;gap:1rem;padding:.85rem 0;border-bottom:1px solid var(--border);text-decoration:none;color:inherit;transition:background .15s}
.chapter-card:hover{background:rgba(201,169,110,.05)}
.cc-num{font-family:var(--sans);font-size:.72rem;font-weight:700;color:var(--ash);letter-spacing:.08em;min-width:52px;flex-shrink:0}
.cc-title{flex:1;font-size:.9rem;color:var(--ink);font-family:var(--ro)}
.cc-pages{font-size:.65rem;color:var(--smoke);flex-shrink:0}
.cc-arr{color:var(--gold);font-family:var(--serif);margin-left:.5rem}
footer{display:flex;justify-content:space-between;padding:2.5rem 3.5rem;border-top:1px solid var(--border);background:var(--cream);gap:2rem;flex-wrap:wrap;transition:var(--nm)}
[data-theme="dark"] footer{background:#070604}
.footer-link{display:block;font-size:.72rem;color:var(--ash);text-decoration:none;margin-bottom:.3rem}
.footer-link:hover{color:var(--gold)}
@media(max-width:768px){
  .series-hero{grid-template-columns:1fr;gap:1.5rem;padding:2rem 1.2rem}
  .series-cover,.series-cover-placeholder{width:140px;height:200px}
  .chapter-list{padding:0 1.2rem 4rem}
  footer{padding:2rem 1.2rem}
}
</style>
</head>
<body>
${buildNav('../','manga')}
<div class="series-hero">
  ${cover
    ? `<img class="series-cover" src="${escHtml(cover)}" alt="${escHtml(title)}" width="200" height="280" loading="eager" decoding="sync">`
    : `<div class="series-cover-placeholder">📖</div>`
  }
  <div class="series-info">
    <h1 class="series-title">${escHtml(title)}</h1>
    <div class="series-meta">
      <span>📚 <strong>${chapters.length}</strong> chapter</span>
      ${author?`<span>✏ <strong>${escHtml(author)}</strong></span>`:''}
      ${genres?`<span>🏷 ${escHtml(genres)}</span>`:''}
    </div>
    ${statusLabel?`<div><span class="series-status">${statusLabel}</span></div>`:''}
    ${desc?`<p class="series-desc">${escHtml(desc)}</p>`:''}
  </div>
</div>
<div class="chapter-list">
  <h2>Daftar Chapter</h2>
  ${chapterCards || '<p style="color:var(--ash);font-size:.88rem">Belum ada chapter yang tersedia.</p>'}
</div>
<footer>
  <div>
    <div style="font-family:var(--sans);font-size:1rem;font-weight:700;color:var(--ink)">夢Lyrics · Manga</div>
    <div style="font-size:.52rem;color:var(--smoke);margin-top:.8rem">© 2025 YumeSubs — yumelyrics.my.id</div>
  </div>
  <div>
    <a class="footer-link" href="index.html">← Semua Manga</a>
    <a class="footer-link" href="../index.html">Katalog Lagu</a>
  </div>
</footer>
${NAV_SCRIPT}
</body>
</html>`);
}

// ── Index page HTML ───────────────────────────────────────────────────────────
async function generateIndexHTML(seriesList) {
  const pageUrl = `${BASE_URL}/${MANGA_DIR}/`;
  const total   = seriesList.reduce((s,sr) => s + (sr.chapterCount||0), 0);

  const cards = seriesList.map(sr => `
    <a class="series-card" href="${escHtml(sr.slug)}.html">
      ${sr.cover
        ? `<img class="sc-cover" src="${escHtml(wsrvUrl(sr.cover, 300))}" alt="${escHtml(sr.title)}" width="150" height="210" loading="lazy" decoding="async">`
        : `<div class="sc-cover sc-cover-ph">📖</div>`}
      <div class="sc-info">
        <div class="sc-title">${escHtml(sr.title)}</div>
        <div class="sc-meta">${sr.chapterCount} chapter</div>
        ${sr.genres?`<div class="sc-genres">${escHtml(sr.genres)}</div>`:''}
      </div>
    </a>`).join('');

  return minify(`<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
${THEME_BOOT}
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Manga Terjemahan Indonesia | YumeSubs</title>
<meta name="description" content="${seriesList.length} seri manga terjemahan Indonesia — ${total} chapter tersedia gratis di YumeSubs.">
<meta property="og:title" content="Manga Terjemahan | YumeSubs">
<meta property="og:url" content="${pageUrl}">
<meta property="og:type" content="website">
<link rel="canonical" href="${pageUrl}">
<link rel="icon" type="image/png" href="../anime_icon.png">
${FONT_HEAD}${FONT_LINK}
<style>
${CSS_TOKENS}
*{margin:0;padding:0;box-sizing:border-box}
html{scroll-behavior:smooth;background:var(--paper)}
body{background:var(--paper);color:var(--ink);font-family:var(--sans);min-height:100dvh;transition:var(--nm)}
${NAV_CSS}
.page-hero{padding:4rem 3.5rem 2.5rem}
.page-title{font-family:var(--serif);font-size:clamp(2.2rem,5vw,3.5rem);font-weight:300;font-style:italic;color:var(--ink);line-height:1.3;margin-bottom:.6rem}
.page-sub{font-size:.7rem;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:var(--ash)}
.series-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:1.5rem;padding:0 3.5rem 5rem}
.series-card{text-decoration:none;color:inherit;display:flex;flex-direction:column;gap:.75rem;transition:opacity .2s}
.series-card:hover{opacity:.8}
.sc-cover{width:100%;aspect-ratio:2/3;object-fit:cover;background:var(--cream);display:block}
.sc-cover-ph{display:flex;align-items:center;justify-content:center;font-size:2rem;color:var(--smoke)}
.sc-info{display:flex;flex-direction:column;gap:.3rem}
.sc-title{font-size:.92rem;font-weight:700;color:var(--ink);line-height:1.3;font-family:var(--sans)}
.sc-meta{font-size:.65rem;color:var(--ash);letter-spacing:.05em}
.sc-genres{font-size:.62rem;color:var(--smoke)}
footer{display:flex;justify-content:space-between;padding:2.5rem 3.5rem;border-top:1px solid var(--border);background:var(--cream);gap:2rem;flex-wrap:wrap;transition:var(--nm)}
[data-theme="dark"] footer{background:#070604}
.footer-link{display:block;font-size:.72rem;color:var(--ash);text-decoration:none;margin-bottom:.3rem}
.footer-link:hover{color:var(--gold)}
@media(max-width:768px){.page-hero,.footer{padding-left:1.2rem;padding-right:1.2rem}.series-grid{padding-left:1.2rem;padding-right:1.2rem;gap:1rem}}
</style>
</head>
<body>
${buildNav('../','manga')}
<section class="page-hero">
  <h1 class="page-title">Manga Terjemahan</h1>
  <div class="page-sub">${seriesList.length} seri · ${total} chapter</div>
</section>
<div class="series-grid">${cards}</div>
<footer>
  <div>
    <div style="font-family:var(--sans);font-size:1rem;font-weight:700;color:var(--ink)">夢Lyrics</div>
    <div style="font-size:.52rem;color:var(--smoke);margin-top:.8rem">© 2025 YumeSubs — yumelyrics.my.id</div>
  </div>
  <div>
    <a class="footer-link" href="../index.html">Katalog Lagu</a>
    <a class="footer-link" href="../artis/index.html">Artis</a>
    <a class="footer-link" href="../contact.html">Hubungi</a>
  </div>
</footer>
${NAV_SCRIPT}
</body>
</html>`);
}

// ── Sitemap helpers ───────────────────────────────────────────────────────────
function buildSitemapUrl(loc, lastmod, priority = '0.7', changefreq = 'weekly', imgUrl = '', imgTitle = '') {
  const imgBlock = imgUrl
    ? `<image:image><image:loc>${sitemapEscape(imgUrl)}</image:loc>${imgTitle?`<image:title>${sitemapEscape(imgTitle)}</image:title>`:''}</image:image>`
    : '';
  return `  <url><loc>${loc}</loc><lastmod>${lastmod}</lastmod><priority>${priority}</priority><changefreq>${changefreq}</changefreq>${imgBlock}</url>`;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const t0 = Date.now();
  console.log('🚀 generate-manga.js mulai...');

  const app = initializeApp(firebaseConfig, 'generate_manga');
  const db  = getFirestore(app);

  if (!fs.existsSync(MANGA_DIR)) fs.mkdirSync(MANGA_DIR, { recursive: true });

  // 1. Ambil semua data dari Firestore
  console.log('📡 Mengambil data dari Firestore...');
  const [seriesSnap, chaptersSnap] = await Promise.all([
    getDocs(collection(db, 'manga_series')),
    getDocs(collection(db, 'manga_chapters')),
  ]);

  // Series map: id → data
  const seriesMap = {};
  seriesSnap.forEach(d => { seriesMap[d.id] = { id: d.id, ...d.data() }; });
  console.log(`  ✓ ${Object.keys(seriesMap).length} series`);

  // Filter chapters: hanya published
  const allChapters = [];
  chaptersSnap.forEach(d => {
    const ch = { id: d.id, ...d.data() };
    if (ch.status === 'draft') return;
    // Resolve series info dari seriesId
    if (ch.seriesId && seriesMap[ch.seriesId]) {
      const sr = seriesMap[ch.seriesId];
      ch.seriesTitle = ch.seriesTitle || sr.title || '';
      ch.seriesSlug  = ch.seriesSlug  || sr.slug  || toSlug(sr.title, ch.seriesId);
    }
    if (!ch.seriesSlug) ch.seriesSlug = toSlug(ch.seriesTitle, ch.id);
    allChapters.push(ch);
  });

  // Sort: per series, urut chapterNum
  allChapters.sort((a, b) => {
    const sc = (a.seriesSlug||'').localeCompare(b.seriesSlug||'');
    return sc !== 0 ? sc : (a.chapterNum||0) - (b.chapterNum||0);
  });
  console.log(`  ✓ ${allChapters.length} chapter published`);

  // Group by series
  const bySeries = {};
  for (const ch of allChapters) {
    const key = ch.seriesSlug || 'unknown';
    if (!bySeries[key]) bySeries[key] = [];
    bySeries[key].push(ch);
  }

  // Load manifest
  const manifest = loadManifest();
  const today    = sitemapDate();
  const urls     = [
    buildSitemapUrl(`${BASE_URL}/${MANGA_DIR}/`, today, '0.8', 'weekly'),
  ];

  // 2. Generate chapter pages
  const newChapters    = [];
  const dirtyClears    = [];
  let generated = 0, skipped = 0;
  const errors  = [];

  console.log('📖 Generate halaman chapter...');
  await pConcurrent(8, allChapters.map(ch => async () => {
    const slug = chapterSlug(ch.seriesSlug, ch.chapterNum);
    try {
      const fp = path.join(MANGA_DIR, `${slug}.html`);

      if (!needsGenerate(ch, slug, manifest)) {
        skipped++;
        manifest.chapters[ch.id] = { slug, hash: chapterContentHash(ch) };
        urls.push(buildSitemapUrl(`${BASE_URL}/${MANGA_DIR}/${slug}.html`,
          sitemapLastmod(fp, today), '0.75', 'monthly', ch.cover||'', `${ch.seriesTitle} Ch. ${ch.chapterNum}`));
        return;
      }

      // Cari prev/next dalam series yang sama
      const siblings  = bySeries[ch.seriesSlug] || [];
      const myIdx     = siblings.findIndex(s => s.id === ch.id);
      const prevCh    = myIdx > 0 ? siblings[myIdx-1] : null;
      const nextCh    = myIdx >= 0 && myIdx < siblings.length-1 ? siblings[myIdx+1] : null;
      const prevSlug  = prevCh ? { slug: chapterSlug(ch.seriesSlug, prevCh.chapterNum) } : null;
      const nextSlug  = nextCh ? { slug: chapterSlug(ch.seriesSlug, nextCh.chapterNum) } : null;

      const html = await generateChapterHTML(ch, slug, null, prevSlug, nextSlug);
      await fsWrite(fp, html, 'utf8');

      const wasDirty = ch.htmlDirty === true || ch.htmlDirty === 'true';
      manifest.chapters[ch.id] = { slug, hash: chapterContentHash(ch) };
      if (wasDirty) dirtyClears.push(clearDirtyFlag(db, ch.id));

      const fileExisted = fs.existsSync(fp);
      if (!fileExisted) {
        newChapters.push({
          seriesTitle: ch.seriesTitle, chapterNum: ch.chapterNum,
          chapterTitle: ch.chapterTitle || '',
          url: `${BASE_URL}/${MANGA_DIR}/${slug}.html`,
          cover: ch.cover || '',
        });
      }

      generated++;
      console.log(`  ✓ ${MANGA_DIR}/${slug}.html`);
      urls.push(buildSitemapUrl(`${BASE_URL}/${MANGA_DIR}/${slug}.html`,
        sitemapLastmod(fp, today), '0.75', 'monthly', ch.cover||'', `${ch.seriesTitle} Ch. ${ch.chapterNum}`));
    } catch(e) {
      errors.push({ slug, err: e.message });
      console.error(`  ✗ GAGAL ${slug}: ${e.message}`);
    }
  }));

  if (dirtyClears.length) {
    await Promise.all(dirtyClears);
    console.log(`   Cleared ${dirtyClears.length} htmlDirty flag(s)`);
  }

  // 3. Generate series pages
  console.log('📚 Generate halaman series...');
  for (const [seriesSlug, chapters] of Object.entries(bySeries)) {
    const seriesId = chapters[0]?.seriesId;
    const rawSeries = seriesId && seriesMap[seriesId] ? seriesMap[seriesId] : {
      id: seriesId, title: chapters[0]?.seriesTitle || seriesSlug, slug: seriesSlug,
    };
    const fp = path.join(MANGA_DIR, `${seriesSlug}.html`);
    const html = await generateSeriesHTML(
      { ...rawSeries, slug: seriesSlug },
      chapters
    );
    await fsWrite(fp, html, 'utf8');
    console.log(`  ✓ ${MANGA_DIR}/${seriesSlug}.html (${chapters.length} chapter)`);
    urls.push(buildSitemapUrl(`${BASE_URL}/${MANGA_DIR}/${seriesSlug}.html`,
      sitemapLastmod(fp, today), '0.8', 'weekly'));
  }

  // 4. Generate index
  const seriesListForIndex = Object.entries(bySeries).map(([slug, chs]) => {
    const sr = seriesMap[chs[0]?.seriesId] || {};
    return {
      slug, title: chs[0]?.seriesTitle || slug,
      cover: sr.cover || '', genres: sr.genres || '',
      chapterCount: chs.length,
    };
  }).sort((a,b) => a.title.localeCompare(b.title,'id'));

  const indexHtml = await generateIndexHTML(seriesListForIndex);
  await fsWrite(path.join(MANGA_DIR, 'index.html'), indexHtml, 'utf8');
  console.log(`  ✓ ${MANGA_DIR}/index.html (${seriesListForIndex.length} series)`);

  // 5. Simpan manifest
  saveManifest(manifest);

  // 6. Discord notif
  if (newChapters.length > 0) {
    await sendDiscordNotification(newChapters, true);
  } else {
    console.log('   Discord: tidak ada chapter baru, skip notif.');
  }

  // 7. Sitemap (append ke sitemap.xml yang sudah ada — kalau mau, merge manual)
  const mangaSitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls.join('\n')}
</urlset>`;
  await fsWrite('sitemap-manga.xml', mangaSitemap, 'utf8');

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n✅ Selesai! ${generated} chapter di-generate, ${skipped} dilewati — ${elapsed}s`);
  if (errors.length) {
    console.warn(`⚠ ${errors.length} error:`);
    for (const e of errors) console.warn(`  ✗ ${e.slug}: ${e.err}`);
  }
  console.log(`   Total: ${allChapters.length} chapter · ${seriesListForIndex.length} series · sitemap-manga.xml`);
  process.exit(0);
}

main().catch(async e => {
  console.error('💥 Fatal:', e);
  await sendDiscordNotification([], false).catch(()=>{});
  process.exit(1);
});
