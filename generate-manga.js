// generate-manga.js — v2026-07-updated
// GitHub Actions: ambil data Firestore → generate HTML per chapter manga/komik terjemahan
//
// Firestore collections:
//   manga_series/{id}    → metadata series (judul, cover, deskripsi, dsb.)
//   manga_chapters/{id}  → data chapter (pages[], seriesId, chapterNum, dsb.)
//   manga_chapters/{id}/comments/{cmId} → sudah diganti Waline (tidak dipakai)
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
const WALINE_SERVER = 'https://yumelyrics-comment.vercel.app'; // Waline server URL
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
.discord-popup-fab{position:fixed;bottom:max(5.5rem,calc(env(safe-area-inset-bottom,0px)+5.5rem));right:max(1rem,env(safe-area-inset-right,0px));z-index:198;width:48px;height:48px;border-radius:50%;background:linear-gradient(160deg,#5865F2 0%,#4752c4 100%);color:#fff;display:none;align-items:center;justify-content:center;box-shadow:0 6px 24px rgba(88,101,242,.45);text-decoration:none;transition:transform .2s}
.discord-popup-fab.is-visible{display:flex}
.discord-popup-fab:hover{transform:scale(1.08)}
.discord-popup-fab svg{width:24px;height:18px}
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

// ── Waline Comments ────────────────────────────────────────────────────────────
const WALINE_CSS = `
.comments-section{padding:3rem 2.5rem 7rem;border-top:1px solid var(--border);background:var(--paper);transition:var(--nm)}
[data-theme="dark"] .comments-section{background:var(--paper)}
.cm-inner{max-width:760px;margin:0 auto}
.cm-heading{font-family:var(--serif);font-size:1.8rem;font-weight:300;font-style:italic;color:var(--ink);margin-bottom:.35rem}
.cm-sub{font-size:.75rem;color:var(--ash);font-family:var(--ro);margin-bottom:2rem}
#waline{width:100%;--waline-font-size:.88rem;--waline-border-color:rgba(10,8,18,.1);--waline-bgcolor:var(--paper);--waline-bgcolor-hover:var(--cream);--waline-color:var(--ink);--waline-theme-color:var(--rose);--waline-active-color:var(--rose);--waline-border:1px solid var(--border);--waline-avatar-size:36px;--waline-box-shadow:none}
[data-theme="dark"] #waline{--waline-border-color:rgba(232,226,217,.1);--waline-bgcolor:var(--paper);--waline-bgcolor-hover:var(--cream);--waline-color:var(--ink)}
#waline .wl-browser,#waline .wl-os{display:none!important}
#waline .wl-content img{max-width:100%;height:auto;display:block}
#waline .wl-input[name="url"],#waline label[for*="url"],#waline .wl-header-item:has(input[name="url"]){display:none!important}
@media(max-width:768px){.comments-section{padding:2rem 1.2rem 5rem}}
`;

function buildWalineSection(chapterPath) {
  const pathJson = JSON.stringify(chapterPath);
  const serverJson = JSON.stringify(WALINE_SERVER);
  return `
<section class="comments-section" id="comments">
  <div class="cm-inner">
    <h2 class="cm-heading">Komentar</h2>
    <p class="cm-sub">Bagikan pendapatmu — bebas sebagai tamu, tanpa perlu login.</p>
    <div id="waline"></div>
  </div>
</section>
<script>
(function(){
  var walineLoaded=false;
  function loadWaline(){
    if(walineLoaded)return;
    walineLoaded=true;
    if(!document.getElementById('waline-css')){
      var wlCss=document.createElement('link');
      wlCss.id='waline-css';wlCss.rel='stylesheet';
      wlCss.href='https://unpkg.com/@waline/client@3/dist/waline.css';
      document.head.appendChild(wlCss);
    }
    import('https://unpkg.com/@waline/client@3/dist/waline.js').then(function(m){
      m.init({
        el:'#waline',
        serverURL:${serverJson},
        path:${pathJson},
        comment:true,
        pageview:false,
        reaction:false,
        dark:'html[data-theme="dark"]',
        meta:['nick'],
        requiredMeta:[],
        locale:{
          placeholder:'Tulis komentarmu di sini...',
          sofa:'Jadilah yang pertama berkomentar!',
          submit:'Kirim',nick:'Nama',preview:'Pratinjau',
          comment:'Komentar',reply:'Balas',more:'Muat lebih banyak...',
          admin:'Admin',word:'{0} kata',anonymous:'Tamu',
          level0:'Pendatang',level1:'Pengunjung',level2:'Reguler',
          level3:'Veteran',level4:'Master',level5:'Legenda',
        },
      });
    }).catch(function(e){console.error('Waline load error:',e);});
  }
  var isMobile=window.matchMedia('(max-width:768px)').matches;
  if('IntersectionObserver' in window){
    var obs=new IntersectionObserver(function(entries){
      if(entries[0].isIntersecting){obs.disconnect();loadWaline();}
    },{rootMargin:isMobile?'120px':'200px'});
    var el=document.querySelector('.comments-section');
    if(el)obs.observe(el);
  }
  setTimeout(loadWaline,isMobile?9000:4000);
})();
<\/script>`;
}

// ── Reader HUD CSS ─────────────────────────────────────────────────────────────
const READER_HUD_CSS = `
/* ── Floating Reader HUD — melayang di atas konten manga ── */
#reader-hud{
  position:fixed;
  bottom:clamp(1.5rem, 8vh, 3.5rem);
  left:50%;transform:translateX(-50%);
  z-index:500;
  display:flex;flex-direction:column;align-items:center;gap:.55rem;
  pointer-events:none;
  transition:opacity .3s cubic-bezier(.4,0,.2,1),transform .3s cubic-bezier(.4,0,.2,1);
}
#reader-hud.hud-hidden{opacity:0;transform:translateX(-50%) translateY(12px);pointer-events:none!important}
#reader-hud > *{pointer-events:auto}
/* Pil judul di atas tombol */
.hud-title{
  display:flex;flex-direction:column;align-items:center;gap:.1rem;
  background:rgba(10,8,16,.82);
  backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);
  border-radius:999px;
  padding:.38rem .9rem .42rem;
  max-width:min(360px,80vw);
}
.hud-series-name{font-size:.48rem;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:rgba(200,192,208,.45);font-family:var(--sans);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.hud-chapter-name{font-size:.75rem;font-weight:600;color:rgba(220,210,230,.88);font-family:var(--sans);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;text-align:center}
/* Baris tiga tombol bulat */
.hud-btns{display:flex;align-items:center;gap:1.1rem}
.hud-btn{
  display:inline-flex;align-items:center;justify-content:center;
  width:46px;height:46px;border-radius:50%;
  background:rgba(14,11,22,.88);
  border:none;outline:none;
  color:rgba(220,210,230,.82);font-size:1.05rem;line-height:1;
  text-decoration:none;cursor:pointer;flex-shrink:0;
  box-shadow:0 2px 14px rgba(0,0,0,.55),0 0 0 1px rgba(255,255,255,.07);
  transition:background .18s,color .18s,transform .14s,box-shadow .18s;
  -webkit-tap-highlight-color:transparent;
}
.hud-btn:hover{background:rgba(30,24,44,.95);color:#fff;transform:scale(1.08);box-shadow:0 4px 18px rgba(0,0,0,.65),0 0 0 1px rgba(255,255,255,.13)}
.hud-btn:active{transform:scale(.92)}
.hud-btn-disabled{background:rgba(14,11,22,.5)!important;color:rgba(255,255,255,.18)!important;cursor:default;pointer-events:none;box-shadow:none}
.hud-btn-list{font-size:.72rem}
.hud-btn-list.active,.hud-btn-list:hover{background:rgba(40,28,14,.92);color:rgba(201,169,110,.95)}
/* ── Chapter Drawer — slide up dari bawah layar ── */
#chapter-drawer{
  position:fixed;left:0;right:0;bottom:0;z-index:499;
  background:rgba(6,5,10,.97);
  backdrop-filter:blur(22px) saturate(1.3);-webkit-backdrop-filter:blur(22px) saturate(1.3);
  border-top:1px solid rgba(255,255,255,.08);
  border-radius:1rem 1rem 0 0;
  max-height:60vh;overflow-y:auto;overscroll-behavior:contain;
  display:flex;flex-direction:column;
  transition:transform .3s cubic-bezier(.4,0,.2,1),opacity .3s;
  transform:translateY(100%);opacity:0;pointer-events:none;
}
#chapter-drawer.drawer-open{transform:translateY(0);opacity:1;pointer-events:auto}
.drawer-handle{width:36px;height:4px;border-radius:2px;background:rgba(255,255,255,.15);margin:.75rem auto .4rem;flex-shrink:0}
.drawer-header{display:flex;align-items:center;justify-content:space-between;padding:.6rem 1.4rem .7rem;border-bottom:1px solid rgba(255,255,255,.06);position:sticky;top:0;z-index:2;background:rgba(6,5,10,.99)}
.drawer-title{font-size:.6rem;font-weight:700;letter-spacing:.22em;text-transform:uppercase;color:rgba(200,192,208,.5);font-family:var(--sans)}
.drawer-close{width:26px;height:26px;border-radius:50%;border:none;background:rgba(255,255,255,.07);color:rgba(200,192,208,.55);cursor:pointer;font-size:.7rem;display:inline-flex;align-items:center;justify-content:center;transition:background .15s,color .15s}
.drawer-close:hover{background:rgba(255,255,255,.14);color:#fff}
.drawer-list{padding:.3rem 0 .8rem}
.drawer-ch-item{display:flex;align-items:center;gap:.9rem;padding:.62rem 1.4rem;text-decoration:none;color:rgba(200,192,208,.6);font-family:var(--ro);font-size:.82rem;transition:background .14s,color .14s;border-bottom:1px solid rgba(255,255,255,.025)}
.drawer-ch-item:last-child{border-bottom:none}
.drawer-ch-item:hover{background:rgba(255,255,255,.045);color:#e8e2d9}
.drawer-ch-item.current{color:var(--gold);background:rgba(201,169,110,.06)}
.drawer-ch-num{font-size:.6rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:rgba(200,192,208,.28);flex-shrink:0;min-width:44px}
.drawer-ch-title{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.drawer-ch-pages{font-size:.58rem;color:rgba(200,192,208,.28);flex-shrink:0}
#drawer-backdrop{position:fixed;inset:0;z-index:498;background:transparent;pointer-events:none;transition:background .3s}
#drawer-backdrop.active{background:rgba(0,0,0,.45);pointer-events:auto}
@media(max-width:480px){
  .hud-btn{width:42px;height:42px;font-size:.95rem}
  .hud-btns{gap:.85rem}
  .hud-chapter-name{font-size:.7rem}
  #reader-hud{bottom:clamp(1rem,5vh,2rem)}
}
`;

const READER_HUD_SCRIPT = `<script>
(function(){
  var hud=document.getElementById('reader-hud');
  var drawer=document.getElementById('chapter-drawer');
  var backdrop=document.getElementById('drawer-backdrop');
  var listBtn=document.getElementById('hud-list-btn');
  var closeBtn=document.getElementById('drawer-close-btn');
  var reader=document.getElementById('manga-reader');
  var visible=true,drawerOpen=false,timer=null;

  function show(){
    if(!hud)return;
    hud.classList.remove('hud-hidden');visible=true;
    clearTimeout(timer);timer=setTimeout(hide,3500);
  }
  function hide(){
    if(!hud||drawerOpen)return;
    hud.classList.add('hud-hidden');visible=false;
  }
  function openDrawer(){
    if(!drawer||!backdrop)return;
    drawerOpen=true;
    drawer.classList.add('drawer-open');drawer.setAttribute('aria-hidden','false');
    backdrop.classList.add('active');
    listBtn&&listBtn.classList.add('active');
    clearTimeout(timer);
    show();
    requestAnimationFrame(function(){
      var cur=drawer.querySelector('.drawer-ch-item.current');
      if(cur)cur.scrollIntoView({block:'nearest',behavior:'smooth'});
    });
  }
  function closeDrawer(){
    if(!drawer||!backdrop)return;
    drawerOpen=false;
    drawer.classList.remove('drawer-open');drawer.setAttribute('aria-hidden','true');
    backdrop.classList.remove('active');
    listBtn&&listBtn.classList.remove('active');
    clearTimeout(timer);timer=setTimeout(hide,3500);
  }
  if(listBtn)listBtn.addEventListener('click',function(e){e.stopPropagation();drawerOpen?closeDrawer():openDrawer();});
  if(closeBtn)closeBtn.addEventListener('click',closeDrawer);
  if(backdrop)backdrop.addEventListener('click',closeDrawer);
  if(reader)reader.addEventListener('click',function(e){
    if(e.target.closest('#reader-hud')||e.target.closest('#chapter-drawer'))return;
    if(drawerOpen){closeDrawer();return;}
    if(visible)hide();else show();
  });
  timer=setTimeout(hide,3500);
})();
<\/script>`;

// ── Chapter page HTML ──────────────────────────────────────────────────────────
// seriesChapters: sorted ASC by chapterNum — used to render the in-page drawer
async function generateChapterHTML(chapter, slug, seriesList, prevChapter, nextChapter, seriesChapters) {
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

  // Chapter drawer — urutan terbaru di atas
  const siblingChapters = seriesChapters || [];
  const drawerItems = [...siblingChapters]
    .sort((a, b) => (b.chapterNum ?? 0) - (a.chapterNum ?? 0))
    .map(ch => {
      const cSlug   = chapterSlug(seriesSlug, ch.chapterNum);
      const cTitle  = ch.chapterTitle || `Chapter ${ch.chapterNum}`;
      const isCur   = ch.id === chapter.id;
      return `<a class="drawer-ch-item${isCur?' current':''}" href="${escHtml(cSlug)}.html">`+
        `<span class="drawer-ch-num">Ch. ${ch.chapterNum}</span>`+
        `<span class="drawer-ch-title">${escHtml(cTitle)}</span>`+
        `<span class="drawer-ch-pages">${(ch.pages||[]).length} hal</span>`+
        `</a>`;
    }).join('');

  const walinePath = `/${MANGA_DIR}/${slug}`;

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
    `width="800" loading="${i < 2 ? 'eager' : 'lazy'}" decoding="${i < 2 ? 'sync' : 'async'}">`
  ).join('\n');

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
html{scroll-behavior:smooth;background:#111}
body{background:#111;color:var(--ink);font-family:var(--sans);min-height:100dvh;transition:var(--nm);overflow-x:hidden}

/* Reader nav overrides — dark bar */
nav{background:rgba(8,6,12,.92)!important;border-bottom-color:rgba(255,255,255,.07)!important}
.nljp{color:#e8e2d9}.nlen{color:#5a5060}
#theme-toggle,#nav-menu-btn{border-color:rgba(255,255,255,.12)!important}
#theme-toggle svg{stroke:#7a7068}
#nav-menu-btn span{background:#7a7068}
#nav-dropdown{background:#1a1714!important;border-color:rgba(255,255,255,.08)!important}
.nd-item{color:#7a7068}.nd-item:hover,.nd-item.on{color:#e8e2d9;background:#221e1a}

${NAV_CSS}
${DISCORD_POPUP_CSS}
${WALINE_CSS}
${READER_HUD_CSS}

/* ── Chapter header (dark) ── */
.chap-header{background:#0d0b0e;border-bottom:1px solid rgba(255,255,255,.06);padding:2rem 2.5rem 1.75rem}
.breadcrumb{display:flex;align-items:center;gap:.5rem;font-size:.55rem;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:#4a4550;margin-bottom:1.5rem;flex-wrap:wrap}
.breadcrumb a{text-decoration:none;color:inherit;transition:color .2s}.breadcrumb a:hover{color:var(--gold)}
.breadcrumb-sep{color:#2a2535}
.chap-series{font-family:var(--serif);font-size:1rem;font-weight:300;font-style:italic;color:#7a6880;margin-bottom:.3rem}
.chap-title{font-family:var(--sans);font-size:clamp(1.3rem,3.5vw,2.2rem);font-weight:700;color:#e8e2d9;line-height:1.2;margin-bottom:.7rem}
.chap-meta{display:flex;gap:1.5rem;flex-wrap:wrap;font-size:.65rem;color:#5a5060;letter-spacing:.08em}
.chap-meta strong{color:#9a9098}

/* ── Manga reader ── */
.manga-reader{display:flex;flex-direction:column;align-items:center;background:#111;padding:1rem 0 6rem;gap:2px;cursor:pointer;user-select:none;overflow-x:hidden}
.manga-reader img{width:100%;max-width:800px;height:auto;display:block;object-fit:contain}
.manga-page{display:block;width:100%;max-width:800px;height:auto;object-fit:contain;background:#1a1a1a}

/* ── Footer ── */
footer{display:flex;justify-content:space-between;align-items:flex-start;gap:2rem;padding:2.5rem 2.5rem 5rem;border-top:1px solid var(--border);background:var(--cream);flex-wrap:wrap;transition:var(--nm)}
[data-theme="dark"] footer{background:#070604}
.footer-link{display:block;font-size:.72rem;color:var(--ash);text-decoration:none;margin-bottom:.3rem}
.footer-link:hover{color:var(--gold)}

@media(max-width:768px){
  .chap-header{padding:1.5rem 1rem 1.25rem}
  .manga-reader{gap:1px}
  footer{padding:2rem 1rem 4rem}
}
</style>
</head>
<body>
${buildNav('../', 'manga')}

<div class="chap-header">
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
</div>

<div class="manga-reader" id="manga-reader">
  ${pagesHTML}
</div>

<!-- Floating Reader HUD — judul di atas, tiga tombol bulat renggang -->
<div id="reader-hud">
  <div class="hud-title">
    <span class="hud-series-name">${escHtml(seriesTitle)}</span>
    <span class="hud-chapter-name">${escHtml(displayTitle)}</span>
  </div>
  <div class="hud-btns">
    ${prevHref
      ? `<a class="hud-btn" href="${escHtml(prevHref)}" title="Chapter sebelumnya" aria-label="Chapter sebelumnya">←</a>`
      : `<span class="hud-btn hud-btn-disabled" title="Sudah chapter pertama" aria-label="Chapter pertama">←</span>`}
    <button class="hud-btn hud-btn-list" id="hud-list-btn" title="Daftar chapter" aria-label="Daftar chapter">
      <svg width="16" height="12" viewBox="0 0 16 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
        <line x1="0" y1="1" x2="16" y2="1"/><line x1="0" y1="6" x2="16" y2="6"/><line x1="0" y1="11" x2="16" y2="11"/>
      </svg>
    </button>
    ${nextHref
      ? `<a class="hud-btn" href="${escHtml(nextHref)}" title="Chapter berikutnya" aria-label="Chapter berikutnya">→</a>`
      : `<span class="hud-btn hud-btn-disabled" title="Sudah chapter terbaru" aria-label="Chapter terbaru">→</span>`}
  </div>
</div>

<!-- Chapter Drawer — slide up dari bawah, tanpa redirect -->
<div id="drawer-backdrop"></div>
<div id="chapter-drawer" role="dialog" aria-label="Daftar Chapter" aria-hidden="true">
  <div class="drawer-handle"></div>
  <div class="drawer-header">
    <span class="drawer-title">Daftar Chapter — ${escHtml(seriesTitle)}</span>
    <button class="drawer-close" id="drawer-close-btn" aria-label="Tutup">✕</button>
  </div>
  <div class="drawer-list">
    ${drawerItems || `<div style="padding:1.2rem 1.4rem;font-size:.8rem;color:rgba(200,192,208,.4)">Belum ada chapter lain.</div>`}
  </div>
</div>

${buildDiscordPopup()}
${buildWalineSection(walinePath)}

<footer>
  <div>
    <div style="font-family:var(--sans);font-size:1rem;font-weight:700;color:var(--ink)">夢Lyrics · Manga</div>
    <div style="font-size:.55rem;color:var(--ash);letter-spacing:.15em;text-transform:uppercase;margin-top:.2rem">Komik Terjemahan Indonesia</div>
    <div style="font-size:.52rem;color:var(--smoke);margin-top:.8rem">© 2025 YumeSubs — yumelyrics.my.id</div>
  </div>
  <div>
    <a class="footer-link" href="index.html">← Semua Manga</a>
    <a class="footer-link" href="${escHtml(seriesSlug)}.html">Daftar Chapter ${escHtml(seriesTitle)}</a>
    <a class="footer-link" href="../index.html">Katalog Lagu</a>
    <a class="footer-link" href="../contact.html">Hubungi</a>
  </div>
</footer>

${NAV_SCRIPT}
${READER_HUD_SCRIPT}
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

  // Urutkan terbaru (chapterNum terbesar) di atas
  const sortedChapters = [...chapters].sort((a, b) => (b.chapterNum ?? 0) - (a.chapterNum ?? 0));

  const chapterCards = sortedChapters.map(ch => {
    const cSlug  = chapterSlug(slug, ch.chapterNum);
    const cTitle = ch.chapterTitle || '';
    const thumbUrl = ch.pages && ch.pages[0] ? wsrvUrl(ch.pages[0], 120, 65) : '';
    const thumbHtml = thumbUrl
      ? `<img class="cc-thumb-img" src="${escHtml(thumbUrl)}" alt="" width="52" height="72" loading="lazy" decoding="async">`
      : `<div class="cc-thumb-ph"></div>`;

    return `<a class="chapter-card" href="${escHtml(cSlug)}.html">
      <div class="cc-thumb">${thumbHtml}</div>
      <div class="cc-body">
        <span class="cc-num">Ch. ${ch.chapterNum}</span>
        <span class="cc-title">${escHtml(cTitle || `Chapter ${ch.chapterNum}`)}</span>
      </div>
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
body{background:var(--paper);color:var(--ink);font-family:var(--sans);min-height:100dvh;transition:var(--nm);overflow-x:hidden}
${NAV_CSS}

/* ── Series hero — full width ── */
.series-hero{display:flex;flex-direction:row;width:100%;min-height:300px;border-bottom:1px solid var(--border)}
.series-cover-col{flex-shrink:0;width:220px;position:relative;overflow:hidden;background:var(--cream);padding-right:1px}
.series-cover-col img{width:calc(100% - 12px);height:100%;object-fit:cover;display:block;margin-left:0;margin-right:12px}
.series-cover-ph{width:100%;height:100%;min-height:300px;display:flex;align-items:flex-end;padding:1.5rem;background:linear-gradient(160deg,#1a1020 0%,#3d1f3a 50%,#7c3b5e 100%)}
.series-cover-ph-text{font-family:var(--serif);font-size:1.4rem;font-weight:600;color:#e8c0d0;line-height:1.3}
.series-info-col{flex:1;display:flex;flex-direction:column;justify-content:center;padding:3rem 4rem;border-left:1px solid var(--border);min-width:0}
.breadcrumb{display:flex;align-items:center;gap:.5rem;font-size:.58rem;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:var(--ash);margin-bottom:1.5rem;flex-wrap:wrap}
.breadcrumb a{text-decoration:none;color:inherit;transition:color .2s}.breadcrumb a:hover{color:var(--gold)}
.breadcrumb-sep{color:var(--smoke)}
.series-title{font-family:var(--serif);font-size:clamp(2rem,4vw,3.2rem);font-weight:300;font-style:italic;color:var(--ink);line-height:1.2;margin-bottom:1rem}
.series-meta{display:flex;gap:1rem 1.5rem;flex-wrap:wrap;font-size:.7rem;color:var(--ash);letter-spacing:.08em;align-items:center;margin-bottom:1rem}
.series-meta strong{color:var(--ink)}
.series-meta-sep{color:var(--smoke);font-size:.8rem}
.series-status{display:inline-block;font-size:.58rem;font-weight:700;letter-spacing:.2em;text-transform:uppercase;padding:.2rem .65rem;border:1px solid var(--border);color:var(--ash);border-radius:2px;margin-bottom:1rem}
.series-desc{font-size:.9rem;color:var(--ash);line-height:1.85;font-family:var(--ro)}

/* ── Chapter list — full width ── */
.chapter-list-wrap{padding:2.5rem 4rem 6rem;width:100%}
.chapter-list-head{display:flex;align-items:baseline;gap:1rem;margin-bottom:1.5rem;padding-bottom:.75rem;border-bottom:1px solid var(--border)}
.chapter-list-head h2{font-family:var(--serif);font-size:1.6rem;font-weight:300;font-style:italic;color:var(--ink)}
.ch-count{font-size:.62rem;color:var(--ash);letter-spacing:.15em;text-transform:uppercase;font-weight:600}
.chapter-card{display:flex;align-items:center;gap:1rem;padding:.65rem 0;border-bottom:1px solid var(--border);text-decoration:none;color:inherit;transition:padding-left .18s,background .18s}
.chapter-card:hover{background:rgba(201,169,110,.05);padding-left:.5rem}
.cc-thumb{flex-shrink:0;width:52px;height:72px;background:var(--cream);overflow:hidden;border:1px solid var(--border);display:flex;align-items:center;justify-content:center}
.cc-thumb-img{width:100%;height:100%;object-fit:cover;display:block}
.cc-thumb-ph{width:52px;height:72px;background:linear-gradient(160deg,#1a1020,#3d1f3a)}
.cc-body{flex:1;display:flex;flex-direction:column;gap:.18rem;min-width:0}
.cc-num{font-family:var(--sans);font-size:.68rem;font-weight:700;color:var(--ash);letter-spacing:.1em;text-transform:uppercase}
.cc-title{font-size:.9rem;color:var(--ink);font-family:var(--ro);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cc-pages{font-size:.62rem;color:var(--smoke);flex-shrink:0;white-space:nowrap}
.cc-arr{color:var(--gold);font-family:var(--serif);margin-left:.5rem;flex-shrink:0;font-size:1.05rem}

footer{display:flex;justify-content:space-between;padding:2.5rem 4rem;border-top:1px solid var(--border);background:var(--cream);gap:2rem;flex-wrap:wrap;transition:var(--nm)}
[data-theme="dark"] footer{background:#070604}
.footer-link{display:block;font-size:.72rem;color:var(--ash);text-decoration:none;margin-bottom:.3rem}
.footer-link:hover{color:var(--gold)}

@media(max-width:900px){
  .series-hero{flex-direction:column}
  .series-cover-col{width:100%;height:240px;min-height:unset}
  .series-cover-ph{min-height:240px}
  .series-info-col{padding:2rem 1.5rem;border-left:none;border-top:1px solid var(--border)}
  .chapter-list-wrap{padding:2rem 1.5rem 5rem}
  footer{padding:2rem 1.5rem}
}
@media(max-width:600px){
  .series-cover-col{height:200px}
  .series-cover-ph{min-height:200px}
}
</style>
</head>
<body>
${buildNav('../','manga')}

<div class="series-hero">
  <div class="series-cover-col">
    ${cover
      ? `<img src="${escHtml(wsrvUrl(cover, 440))}" alt="${escHtml(title)}" width="220" loading="eager" decoding="sync">`
      : `<div class="series-cover-ph"><div class="series-cover-ph-text">${escHtml(title)}</div></div>`
    }
  </div>
  <div class="series-info-col">
    <div class="breadcrumb">
      <a href="../index.html">Beranda</a>
      <span class="breadcrumb-sep">›</span>
      <a href="index.html">Manga</a>
      <span class="breadcrumb-sep">›</span>
      <span>${escHtml(title)}</span>
    </div>
    <h1 class="series-title">${escHtml(title)}</h1>
    <div class="series-meta">
      <span>📚 <strong>${chapters.length}</strong> chapter</span>
      ${author?`<span class="series-meta-sep">—</span><span>✏ <strong>${escHtml(author)}</strong></span>`:''}
      ${genres?`<span class="series-meta-sep">→</span><span>${escHtml(genres)}</span>`:''}
    </div>
    ${statusLabel?`<div><span class="series-status">${statusLabel}</span></div>`:''}
    ${desc?`<p class="series-desc">${escHtml(desc)}</p>`:''}
  </div>
</div>

<div class="chapter-list-wrap">
  <div class="chapter-list-head">
    <h2>Daftar Chapter</h2>
    <span class="ch-count">${chapters.length} chapter · terbaru di atas</span>
  </div>
  ${chapterCards || '<p style="color:var(--ash);font-size:.88rem;padding:1rem 0">Belum ada chapter yang tersedia.</p>'}
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
@media(max-width:768px){.page-hero{padding:2.5rem 1.2rem 1.5rem}.series-grid{padding-left:1.2rem;padding-right:1.2rem;gap:1rem}footer{padding:2rem 1.2rem}}
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
    ? `\n    <image:image><image:loc>${sitemapEscape(imgUrl)}</image:loc>${imgTitle?`<image:title>${sitemapEscape(imgTitle)}</image:title>`:''}</image:image>`
    : '';
  return `  <url>\n    <loc>${sitemapEscape(loc)}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>${imgBlock}\n  </url>`;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('📖 Mulai generate manga halaman...');

  const app = initializeApp(firebaseConfig);
  const db  = getFirestore(app);

  fs.mkdirSync(MANGA_DIR, { recursive: true });

  const manifest    = loadManifest();
  const today       = sitemapDate();
  const newChapters = [];
  let generated = 0, skipped = 0, cleared = 0;

  // ── Ambil data series ──
  const seriesSnap = await getDocs(collection(db, 'manga_series'));
  const seriesMap  = {};
  const seriesList = [];
  seriesSnap.forEach(d => {
    const s = { id: d.id, ...d.data() };
    s.slug  = s.slug || toSlug(s.title, d.id);
    seriesMap[d.id] = s;
    seriesList.push(s);
  });

  // ── Ambil semua chapter ──
  const chapSnap = await getDocs(collection(db, 'manga_chapters'));
  const allChapters = [];
  chapSnap.forEach(d => {
    const ch = { id: d.id, ...d.data() };
    const sr = seriesMap[ch.seriesId] || {};
    ch.seriesTitle = sr.title || ch.seriesTitle || '';
    ch.seriesSlug  = sr.slug  || ch.seriesSlug  || toSlug(ch.seriesTitle);
    ch.slug        = chapterSlug(ch.seriesSlug, ch.chapterNum);
    allChapters.push(ch);
  });

  // Group chapter per series untuk prev/next navigation
  const chaptersBySeriesId = {};
  for (const ch of allChapters) {
    if (!chaptersBySeriesId[ch.seriesId]) chaptersBySeriesId[ch.seriesId] = [];
    chaptersBySeriesId[ch.seriesId].push(ch);
  }
  for (const arr of Object.values(chaptersBySeriesId)) {
    arr.sort((a, b) => (a.chapterNum ?? 0) - (b.chapterNum ?? 0));
  }

  // ── Generate chapter pages ──
  await pConcurrent(4, allChapters.map(ch => async () => {
    const slug = ch.slug;
    if (!needsGenerate(ch, slug, manifest)) {
      skipped++;
      return;
    }

    const seriesSiblings = chaptersBySeriesId[ch.seriesId] || [];
    const idx        = seriesSiblings.findIndex(s => s.id === ch.id);
    const prevCh     = idx > 0 ? { ...seriesSiblings[idx - 1], slug: chapterSlug(ch.seriesSlug, seriesSiblings[idx - 1].chapterNum) } : null;
    const nextCh     = idx < seriesSiblings.length - 1 ? { ...seriesSiblings[idx + 1], slug: chapterSlug(ch.seriesSlug, seriesSiblings[idx + 1].chapterNum) } : null;

    try {
      const html = await generateChapterHTML(ch, slug, seriesList, prevCh, nextCh, seriesSiblings);
      await fsWrite(path.join(MANGA_DIR, `${slug}.html`), html, 'utf8');
      manifest.chapters[ch.id] = { slug, hash: chapterContentHash(ch) };
      generated++;

      if (ch.htmlDirty === true || ch.htmlDirty === 'true') {
        clearDirtyFlag(db, ch.id);
        cleared++;
      } else {
        newChapters.push({
          seriesTitle: ch.seriesTitle,
          chapterNum: ch.chapterNum,
          chapterTitle: ch.chapterTitle || '',
          cover: ch.cover || '',
          url: `${BASE_URL}/${MANGA_DIR}/${slug}.html`,
        });
      }
      console.log(`  ✓ ${slug}.html`);
    } catch(e) {
      console.error(`  ✗ Gagal generate ${slug}:`, e.message);
    }
  }));

  // ── Generate series pages ──
  for (const sr of seriesList) {
    const srChapters = (chaptersBySeriesId[sr.id] || []);
    // Update chapterCount untuk index
    sr.chapterCount = srChapters.length;
    try {
      const html = await generateSeriesHTML(sr, srChapters);
      await fsWrite(path.join(MANGA_DIR, `${sr.slug}.html`), html, 'utf8');
      console.log(`  ✓ ${sr.slug}.html (series)`);
    } catch(e) {
      console.error(`  ✗ Gagal generate series ${sr.slug}:`, e.message);
    }
  }

  // ── Generate index ──
  try {
    const indexHtml = await generateIndexHTML(seriesList);
    await fsWrite(path.join(MANGA_DIR, 'index.html'), indexHtml, 'utf8');
    console.log('  ✓ index.html');
  } catch(e) {
    console.error('  ✗ Gagal generate index:', e.message);
  }

  saveManifest(manifest);

  // ── Kirim notif Discord ──
  if (newChapters.length > 0) {
    await sendDiscordNotification(newChapters, true);
  }

  console.log(`\n✅ Selesai — ${generated} chapter di-generate, ${skipped} dilewati, ${cleared} htmlDirty di-clear.`);
}

main().catch(e => {
  console.error('❌ Error fatal:', e);
  process.exit(1);
});
