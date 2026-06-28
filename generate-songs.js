// generate-songs.js — v2026-06-15 (夢の夜 · Syne + Cormorant · perf-100 optimized)
// Jalankan via GitHub Actions — ambil data Firebase, generate HTML per lagu + sitemap.xml
// Cek baris 20: harus ada "Cormorant" di FONT_URL (bukan Plus Jakarta)

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, orderBy, doc, updateDoc } from 'firebase/firestore';
import fs from 'fs';
import { writeFile as fsWrite } from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
let minifyHtmlTerser;
try {
  ({ minify: minifyHtmlTerser } = await import('html-minifier-terser'));
} catch {
  // html-minifier-terser tidak terinstall — fallback tanpa minifikasi
  minifyHtmlTerser = async (html) => html;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || '';

// ── DISCORD SERVER LINK ──────────────────────────────────────────────────────
// Ganti URL di bawah dengan invite link Discord server kamu.
// Contoh: 'https://discord.gg/abcdefg'
// Kalau server sudah punya vanity URL, ganti juga bagian ini.
const DISCORD_SERVER_URL = 'https://discord.gg/SW9bTRHK8H';
const DISCORD_POPUP_IMAGE = 'https://raw.githubusercontent.com/yumelyrics/yumelyrics.github.io/refs/heads/main/images/miku.jpg';
const DISCORD_POPUP_IMAGE_OPT = `https://wsrv.nl/?url=${encodeURIComponent(DISCORD_POPUP_IMAGE)}&w=640&h=300&fit=cover&output=webp&q=70`;
// ─────────────────────────────────────────────────────────────────────────────

function isHtmlDirty(song) {
  return song.htmlDirty === true || song.htmlDirty === 'true';
}

/** Notif Discord: hanya lagu baru (belum punya halaman HTML) */
function shouldNotifyDiscord(_song, kind) {
  return kind === 'upload';
}

function formatDiscordSongLine(s) {
  const t = s.titleRo || s.titleJp || s.slug;
  const a = s.artist ? ` — ${s.artist}` : '';
  return `• [${t}${a}](${s.url})`;
}

async function sendDiscordNotification(generatedSongs, success = true) {
  if (!DISCORD_WEBHOOK_URL) return;
  try {
    const count = generatedSongs.length;
    const SITE_URL = 'https://yumelyrics.my.id';
    let title, desc, listTitle, color;
    if (!success) {
      title = '❌ Upload Gagal';
      desc = 'Terjadi error saat upload halaman lagu ke website.';
      listTitle = '🎶 Lagu';
      color = 15158332;
    } else {
      title = '🎵 Lagu Baru Diupload';
      desc = `**${count}** lagu baru berhasil diupload ke website.`;
      listTitle = '🎶 Lagu Baru';
      color = 3066993;
    }

    const lines = generatedSongs.slice(0, 10).map(formatDiscordSongLine);
    if (count > 10) lines.push(`_...dan ${count - 10} lagu baru lainnya_`);
    const songListValue = count > 0 ? lines.join('\n') : '_Tidak ada lagu baru._';

    const firstImg = generatedSongs.length > 0 ? generatedSongs[0].img : '';
    const embed = {
      title,
      description: desc,
      color,
      url: SITE_URL,
      fields: [
        { name: listTitle, value: songListValue, inline: false },
        { name: '🔗 Website', value: `[yumelyrics.my.id](${SITE_URL})`, inline: true },
      ],
      footer: { text: 'yumelyrics.my.id' },
      timestamp: new Date().toISOString(),
    };
    if (firstImg) {
      if (count === 1) {
        embed.image = { url: firstImg };
      } else {
        embed.thumbnail = { url: firstImg };
      }
    }

    const payload = {
      content: '<@&1513469865451716771>',
      embeds: [embed],
    };
    const res = await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      console.log(`✓ Notif Discord terkirim (${count} lagu).`);
    } else {
      console.warn(`⚠ Discord webhook error: ${res.status} ${await res.text()}`);
    }
  } catch (e) {
    console.warn('⚠ Gagal kirim notif Discord:', e.message);
  }
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
const DEFAULT_COMMENT_PROFILE_URL = '';
const MANIFEST_PATH = '.yume-generate-manifest.json';

/** Normalisasi lirik supaya hash stabil (field kosong / ans hilang tidak bikin mismatch) */
function normalizeLyrics(lyrics) {
  return (lyrics || []).map(l => ({
    jp: l.jp || '',
    ro: l.ro || '',
    id: l.id || '',
    ans: l.ans || '',
  }));
}

/** Hash isi lagu — dipakai manifest & deteksi htmlDirty yang sudah ter-generate */
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
    mood: Array.isArray(song.mood) ? song.mood.join(', ') : (song.mood || ''),
    jlpt: song.jlpt || '',
    difficulty: song.difficulty || '',
    order: song.order ?? null,
    lyrics: normalizeLyrics(song.lyrics),
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

/** Run pertama / manifest kosong: sinkronkan dari HTML yang sudah ada (tanpa generate ulang) */
function seedManifestFromDisk(manifest, songMeta) {
  let seeded = 0;
  for (const { song, slug } of songMeta) {
    // Lagu htmlDirty: jangan timpa hash manifest dengan Firebase — biarkan needsSongGenerate yang putuskan.
    if (isHtmlDirty(song)) continue;
    const fp = path.join('lagu', `${slug}.html`);
    if (!fs.existsSync(fp)) continue;
    const hash = songContentHash(song);
    const prev = manifest.songs[song.id];
    if (!prev || prev.slug !== slug || prev.hash !== hash) {
      manifest.songs[song.id] = { slug, hash };
      seeded++;
    }
  }
  return seeded;
}

/**
 * Incremental: generate hanya jika
 * - file HTML belum ada (lagu baru), atau
 * - slug berubah, atau
 * - htmlDirty === true DAN hash manifest belum sama dengan Firebase (belum sync)
 */
function needsSongGenerate(song, slug, manifest, fullMode) {
  if (fullMode) return true;
  const fp = path.join('lagu', `${slug}.html`);
  if (!fs.existsSync(fp)) return true;
  const prev = manifest.songs[song.id];
  if (prev && prev.slug !== slug) return true;
  if (isHtmlDirty(song)) {
    const currentHash = songContentHash(song);
    // Flag macet / sudah pernah di-generate: hash manifest sudah = Firebase → skip
    return !prev || prev.hash !== currentHash;
  }
  return false;
}

async function clearHtmlDirtyFlag(db, songId) {
  try {
    await updateDoc(doc(db, 'songs', songId), { htmlDirty: false });
  } catch (e) {
    console.warn(`  ⚠ htmlDirty tidak bisa di-clear untuk ${songId}: ${e.message || e}`);
  }
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

const FONT_URL = 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;1,400&family=DM+Sans:wght@400;500;700&display=swap';
const FONT_HEAD = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>`;

/** Non-blocking font loading — preload trick prevents render-blocking */
const FONT_LINK = `<link rel="preload" href="${FONT_URL}" as="style" onload="this.onload=null;this.rel='stylesheet'"><noscript><link rel="stylesheet" href="${FONT_URL}"></noscript>`;

const THEME_BOOT_SCRIPT = `<script>(function(){if(localStorage.getItem('ym_theme')==='dark')document.documentElement.setAttribute('data-theme','dark');})()</script>`;
const SONG_CSP = "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'self'; script-src 'self' 'unsafe-inline' https://www.gstatic.com https://unpkg.com https://static.cloudflareinsights.com; connect-src 'self' https://firestore.googleapis.com https://yumelyrics-comment.vercel.app; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com; img-src 'self' data: https:; font-src 'self' data: https://fonts.gstatic.com; frame-src https://www.youtube.com;";

/** Token + latar — selaras dengan index.html (夢の夜 · sakura dusk). */
const CSS_TOKENS = `
html{-webkit-text-size-adjust:100%;text-size-adjust:100%}
:root{
  --ink:#0a0812;--paper:#f5f0ea;--cream:#ede7dc;--smoke:#c8bfb0;--ash:#8c8278;
  --gold:#c9a96e;--gold2:#e8c98a;--rose:#c4637a;--plum:#7c4d6e;
  --dusk:#6b5b7a;--sakura:#e8b4c8;--sakura-dim:rgba(196,99,122,.12);
  --mist:rgba(10,8,18,.06);--border:rgba(10,8,18,.1);
  --jp:'Hiragino Mincho ProN','Yu Mincho','MS Mincho',serif;--en:'Syne',sans-serif;--serif:'Cormorant Garamond',Georgia,serif;
  --ro:'DM Sans',sans-serif;
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
/* bgwrap: fixed layer hanya di desktop (gradient); mobile pakai bg body langsung */
#bgwrap{display:none}
@media(min-width:768px){
#bgwrap{display:block;position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:0;pointer-events:none;background:radial-gradient(ellipse 80% 50% at 8% -8%,rgba(232,180,200,.18) 0%,transparent 60%),var(--paper)}
[data-theme="dark"] #bgwrap{background:radial-gradient(ellipse 80% 50% at 15% -5%,rgba(154,138,184,.18) 0%,transparent 60%),var(--paper)}
}
.wrap{position:relative;z-index:1}
`;

// ── Performance helpers ──────────────────────────────────────────────────────

/** Concurrency-limited Promise.all — runs at most `n` tasks at a time. */
async function pConcurrent(n, tasks) {
  let i = 0;
  async function worker() {
    while (i < tasks.length) {
      const idx = i++;
      await tasks[idx]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, tasks.length) }, worker));
}

/** HTML minification options — agresif tapi aman untuk output halaman lagu. */
const MINIFY_OPTIONS = {
  collapseWhitespace: true,
  removeComments: true,
  minifyCSS: true,
  minifyJS: true,
  keepClosingSlash: false,
  removeAttributeQuotes: true,
  removeEmptyAttributes: true,
  removeRedundantAttributes: true,
};
async function minifyHtml(html) {
  try { return await minifyHtmlTerser(html, MINIFY_OPTIONS); }
  catch { return html; }
}

/** Escape a string for XML/sitemap — escapes &, <, > (title) or just & (artist). */
function sitemapEscape(str, escGt = true) {
  let s = String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  if (escGt) s = s.replace(/>/g, '&gt;');
  return s;
}

function sitemapDate(d = new Date()) {
  return d.toISOString().split('T')[0];
}

function sitemapLastmodFromPath(filePath, fallback) {
  try {
    if (fs.existsSync(filePath)) return sitemapDate(fs.statSync(filePath).mtime);
  } catch (_) { /* ignore */ }
  return fallback;
}

function buildSitemapImageBlock(song, title, artist) {
  if (!song.img) return '';
  return `
    <image:image>
      <image:loc>${sitemapEscape(song.img)}</image:loc>
      <image:title>${title} - ${artist}</image:title>
      <image:caption>Lirik ${title} - ${artist} | YumeLyrics</image:caption>
    </image:image>`;
}

/** YouTube embed — player_loc saja (tanpa content_loc ke youtube.com, sesuai panduan Google). */
function buildSitemapVideoBlock(song, title, artist) {
  if (!song.ytId) return '';
  return `
    <video:video>
      <video:thumbnail_loc>https://i.ytimg.com/vi/${song.ytId}/hqdefault.jpg</video:thumbnail_loc>
      <video:title>${title} - ${artist}</video:title>
      <video:description>Lirik ${title} - ${artist} lengkap dengan romaji dan terjemahan Indonesia di YumeLyrics.</video:description>
      <video:player_loc allow_embed="yes">https://www.youtube.com/embed/${song.ytId}</video:player_loc>
    </video:video>`;
}

function buildSitemapSongUrl(song, slug, today) {
  const title = sitemapEscape(song.titleRo || song.titleJp || '');
  const artist = sitemapEscape(song.artist || '', false);
  const lastmod = sitemapLastmodFromPath(path.join('lagu', `${slug}.html`), today);
  const imgBlock = buildSitemapImageBlock(song, title, artist);
  const videoBlock = buildSitemapVideoBlock(song, title, artist);
  return `  <url><loc>${BASE_URL}/lagu/${slug}.html</loc><lastmod>${lastmod}</lastmod><priority>0.8</priority><changefreq>monthly</changefreq>${imgBlock}${videoBlock}
  </url>`;
}

function artistSitemapLastmod(artistSongs, aSlug, today) {
  let best = sitemapLastmodFromPath(path.join('artis', `${aSlug}.html`), today);
  for (const ref of artistSongs) {
    const lm = sitemapLastmodFromPath(path.join('lagu', `${ref.slug}.html`), today);
    if (lm > best) best = lm;
  }
  return best;
}

// ────────────────────────────────────────────────────────────────────────────

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

/**
 * Wrap URL gambar pakai wsrv.nl CDN proxy:
 * - Convert otomatis ke WebP (next-gen format, ~60-80% lebih kecil)
 * - Resize sesuai lebar target sebelum dikirim ke browser
 * - Tidak install dependency apapun — proxy gratis, zero-cost
 */
function wsrvUrl(url, w, q = 80) {
  if (!url || typeof url !== 'string') return url;
  const u = url.trim();
  if (!u.startsWith('http')) return u;
  return `https://wsrv.nl/?url=${encodeURIComponent(u)}&w=${w}&output=webp&q=${q}`;
}

/** URL cover utama — link langsung HD (Spotify/YouTube), naikkan resolusi YouTube kecil saja. */
function coverImgUrl(url) {
  if (!url || typeof url !== 'string') return url;
  let u = url.trim();
  if (u.includes('mqdefault')) u = u.replace('mqdefault', 'hqdefault');
  if (u.includes('sddefault')) u = u.replace('sddefault', 'hqdefault');
  return u;
}

/** Thumbnail kecil (related, spotify card). */
function thumbImgUrl(url) {
  if (!url || typeof url !== 'string') return url;
  let u = url.trim();
  if (u.includes('img.youtube.com') && u.includes('maxresdefault')) u = u.replace('maxresdefault', 'hqdefault');
  if (u.includes('genius.com') && /1000x\d+x\d/.test(u)) u = u.replace(/1000x\d+x\d+[^/]*/, '300x300');
  if (u.includes('mzstatic.com')) u = u.replace(/\/(\d+)x(\d+)(bb|cc)/, '/300x300$3');
  if (u.includes('scdn.co/image/ab67616d0000b273')) u = u.replace('0000b273', '00001e02');
  return u;
}

function imgTag(src, alt, opts = {}) {
  const cls = opts.cls || 'related-thumb';
  const w = opts.w || 52;
  const h = opts.h || 52;
  const eager = !!opts.eager;
  const hd = !!opts.hd;
  if (!src) return '';
  const u = hd ? coverImgUrl(src) : thumbImgUrl(src);
  const fp = eager ? ' fetchpriority="high"' : '';
  return `<img class="${cls}" src="${escHtml(u)}" alt="${escHtml(alt)}" width="${w}" height="${h}" loading="${eager ? 'eager' : 'lazy'}" decoding="async"${fp}>`;
}

const DISCORD_SVG_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 127.14 96.36" aria-hidden="true"><path fill="currentColor" d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z"/></svg>`;

const DISCORD_POPUP_CSS = `
/* ── DISCORD POPUP ── */
.discord-popup-overlay{position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;padding:1.25rem;background:rgba(10,8,18,.72);backdrop-filter:blur(8px)}
.discord-popup-overlay.is-hidden{display:none!important}
body.discord-popup-lock{overflow:hidden}
.discord-popup-row{display:flex;flex-direction:row;align-items:flex-start;gap:.65rem;width:min(92vw,380px)}
.discord-popup-card{width:100%;flex-shrink:0;background:linear-gradient(160deg,#2c2f33 0%,#1e2124 100%);border-radius:14px;overflow:hidden;box-shadow:0 24px 64px rgba(0,0,0,.45);border:1px solid rgba(88,101,242,.35);animation:discordPopIn .35s cubic-bezier(.34,1.2,.64,1);contain:layout paint}
@keyframes discordPopIn{from{opacity:0;transform:scale(.92) translateY(12px)}to{opacity:1;transform:none}}
.discord-popup-close{flex-shrink:0;width:40px;height:40px;border:2px solid rgba(255,255,255,.28);border-radius:50%;background:#2c2f33;color:#fff;font-size:1.1rem;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .2s,border-color .2s,transform .15s;box-shadow:0 4px 16px rgba(0,0,0,.35);margin-top:.15rem}
.discord-popup-close:hover{background:#5865F2;border-color:rgba(255,255,255,.4);transform:scale(1.05)}
.discord-popup-close[disabled]{opacity:.45;cursor:not-allowed;pointer-events:none;transform:none}
.discord-popup-img{display:block;width:100%;height:auto;aspect-ratio:19/9;object-fit:cover;background:#1e2124}
.discord-popup-title{margin:0;padding:1rem 1.1rem .25rem;font-family:var(--sans);font-size:.95rem;font-weight:700;letter-spacing:.04em;text-transform:lowercase;color:#eeeef2;text-align:center}
.discord-popup-btn{display:flex;align-items:center;justify-content:center;gap:.55rem;margin:1rem 1.1rem 1.25rem;padding:.85rem 1rem;background:#5865F2;color:#fff;text-decoration:none;border-radius:8px;font-family:var(--sans);font-size:.72rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;transition:background .2s,transform .15s}
.discord-popup-btn:hover{background:#4752c4;transform:translateY(-1px)}
.discord-popup-btn svg{width:22px;height:17px;flex-shrink:0}
.discord-popup-fab{position:fixed;bottom:max(1rem,env(safe-area-inset-bottom,0px));right:max(1rem,env(safe-area-inset-right,0px));z-index:198;width:52px;height:52px;border-radius:50%;background:linear-gradient(160deg,#5865F2 0%,#4752c4 100%);color:#fff;display:none;align-items:center;justify-content:center;box-shadow:0 6px 24px rgba(88,101,242,.45);text-decoration:none;transition:transform .2s,box-shadow .2s}
.discord-popup-fab.is-visible{display:flex}
.discord-popup-fab:hover{transform:scale(1.08);box-shadow:0 8px 28px rgba(88,101,242,.55)}
.discord-popup-fab svg{width:26px;height:20px}
@media(max-width:768px){
.discord-popup-overlay{padding:1.25rem;backdrop-filter:none;-webkit-backdrop-filter:none;background:rgba(10,8,18,.9)}
.discord-popup-row{position:relative}
.discord-popup-img{aspect-ratio:21/9}
.discord-popup-close{position:absolute;top:-12px;right:-12px;z-index:5;width:34px;height:34px;font-size:.95rem;margin-top:0}
}
@media(prefers-reduced-motion:reduce){.discord-popup-card{animation:none}}
`;

const NOTIF_BAR_CSS = `
/* ── YM NOTIFICATION BANNER ── */
#ym-notif{
  position:fixed;top:0;left:50%;
  transform:translateX(-50%) translateY(-120%);
  z-index:9998;
  background:rgba(245,240,234,.88);
  backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);
  border:1px solid rgba(201,169,110,.45);
  border-top:none;
  border-radius:0 0 16px 16px;
  box-shadow:0 8px 32px rgba(10,8,18,.12),0 2px 0 rgba(201,169,110,.3) inset;
  padding:.65rem 1.1rem .65rem 1.5rem;
  display:flex;align-items:center;gap:.75rem;
  max-width:min(94vw,620px);min-width:260px;
  pointer-events:none;
  will-change:transform,opacity;
}
[data-theme="dark"] #ym-notif{
  background:rgba(26,23,20,.88);
  border-color:rgba(212,169,110,.35);
  box-shadow:0 8px 32px rgba(0,0,0,.35),0 2px 0 rgba(212,169,110,.2) inset;
}
#ym-notif.ym-in{
  pointer-events:auto;
  animation:ymNotifIn .55s cubic-bezier(.34,1.28,.64,1) forwards;
}
#ym-notif.ym-out{
  pointer-events:none;
  animation:ymNotifOut .38s cubic-bezier(.4,0,.6,1) forwards;
}
@keyframes ymNotifIn{
  from{transform:translateX(-50%) translateY(-120%);opacity:0}
  60%{opacity:1}
  to{transform:translateX(-50%) translateY(0);opacity:1}
}
@keyframes ymNotifOut{
  from{transform:translateX(-50%) translateY(0);opacity:1}
  to{transform:translateX(-50%) translateY(-120%);opacity:0}
}
#ym-notif-deco{
  flex-shrink:0;font-family:var(--jp);font-size:.95rem;
  color:var(--gold,#c9a96e);line-height:1;user-select:none;opacity:.85;
}
[data-theme="dark"] #ym-notif-deco{color:var(--gold2,#e8c98a)}
#ym-notif-text{
  flex:1;
  font-family:var(--serif,'Cormorant Garamond',Georgia,serif);
  font-size:.9rem;font-style:italic;font-weight:400;
  color:var(--ink,#0a0812);line-height:1.45;letter-spacing:.02em;min-width:0;
}
[data-theme="dark"] #ym-notif-text{color:var(--ink,#e8e2d9)}
#ym-notif-close{
  flex-shrink:0;background:none;
  border:1px solid rgba(201,169,110,.35);
  color:var(--ash,#8c8278);
  width:26px;height:26px;border-radius:50%;cursor:pointer;
  display:flex;align-items:center;justify-content:center;
  font-size:.65rem;line-height:1;
  transition:background .2s,border-color .2s,color .2s,transform .15s;
  padding:0;font-family:sans-serif;
}
#ym-notif-close:hover{
  background:rgba(201,169,110,.12);border-color:rgba(201,169,110,.7);
  color:var(--ink,#0a0812);transform:scale(1.08) rotate(90deg);
}
[data-theme="dark"] #ym-notif-close{border-color:rgba(212,169,110,.3);color:rgba(232,226,217,.55)}
[data-theme="dark"] #ym-notif-close:hover{color:var(--ink,#e8e2d9);border-color:rgba(212,169,110,.6)}
@media(prefers-reduced-motion:reduce){
  #ym-notif.ym-in,#ym-notif.ym-out{animation:none!important}
  #ym-notif.ym-in{transform:translateX(-50%) translateY(0)!important;opacity:1!important;pointer-events:auto}
  #ym-notif.ym-out{display:none!important}
}
@media(max-width:600px){
  #ym-notif{max-width:calc(100vw - 2rem);min-width:0;padding:.55rem .85rem .55rem 1.1rem;gap:.55rem;border-radius:0 0 12px 12px}
  #ym-notif-text{font-size:.82rem}
  #ym-notif-deco{font-size:.85rem}
}
`;

function buildDiscordPopupMarkup() {
  const popupImg = escHtml(DISCORD_POPUP_IMAGE_OPT);
  const popupFallback = escHtml(DISCORD_POPUP_IMAGE);
  return `
<div id="discord-popup-overlay" class="discord-popup-overlay is-hidden" role="dialog" aria-modal="true" aria-labelledby="discord-popup-title" aria-hidden="true">
  <div class="discord-popup-row">
    <div class="discord-popup-card">
      <img class="discord-popup-img" data-src="${popupImg}" data-fallback="${popupFallback}" alt="" width="380" height="180" loading="lazy" decoding="async">
      <p class="discord-popup-title" id="discord-popup-title">server discord yumelyrics</p>
      <a class="discord-popup-btn" href="${DISCORD_SERVER_URL}" target="_blank" rel="noopener noreferrer">
        ${DISCORD_SVG_ICON}
        <span>Gabung Discord</span>
      </a>
    </div>
    <button type="button" class="discord-popup-close" id="discord-popup-close" aria-label="Tutup notifikasi" disabled aria-disabled="true">✕</button>
  </div>
</div>
<a class="discord-popup-fab" id="discord-popup-fab" href="${DISCORD_SERVER_URL}" target="_blank" rel="noopener noreferrer" aria-label="Server Discord YumeLyrics" title="Server Discord YumeLyrics">
  ${DISCORD_SVG_ICON}
</a>
<script>
(function(){
  var ov=document.getElementById('discord-popup-overlay');
  var fab=document.getElementById('discord-popup-fab');
  var closeBtn=document.getElementById('discord-popup-close');
  if(!ov||!fab||!closeBtn)return;
  var wrap=document.querySelector('.wrap');
  var popupImg=ov.querySelector('.discord-popup-img');
  var popupImgReady=false;
  var popupGuardTimer=null;
  function setCloseEnabled(enabled){
    closeBtn.disabled = !enabled;
    closeBtn.setAttribute('aria-disabled', enabled ? 'false' : 'true');
  }
  function lockPage(on){
    document.body.classList.toggle('discord-popup-lock',on);
    if(wrap)wrap.inert=on;
    ['img-lightbox'].forEach(function(id){
      var el=document.getElementById(id);
      if(el)el.inert=on;
    });
  }
  function loadPopupImg(){
    if(!popupImg){ setCloseEnabled(true); return; }
    if(popupImgReady){ setCloseEnabled(true); return; }
    setCloseEnabled(false);
    if(popupGuardTimer==null){
      popupGuardTimer = setTimeout(function(){
        if(!popupImgReady){
          popupImgReady = true;
          setCloseEnabled(true);
        }
      }, 2500);
    }
    if(popupImg.complete && popupImg.naturalWidth > 0){
      popupImgReady = true;
      setCloseEnabled(true);
      return;
    }
    var fallback = popupImg.getAttribute('data-fallback');
    var fallbackTried = false;
    popupImg.onload = function(){
      popupImgReady = true;
      setCloseEnabled(true);
      if(popupGuardTimer){ clearTimeout(popupGuardTimer); popupGuardTimer=null; }
    };
    popupImg.onerror = function(){
      if(!fallbackTried && fallback && popupImg.src !== fallback){
        fallbackTried = true;
        popupImg.src = fallback;
        return;
      }
      popupImgReady = true;
      setCloseEnabled(true);
      if(popupGuardTimer){ clearTimeout(popupGuardTimer); popupGuardTimer=null; }
    };
    if(popupImg.src) return;
    var src = popupImg.getAttribute('data-src');
    if(src) popupImg.src = src;
    else { popupImgReady = true; setCloseEnabled(true); }
  }
  function toFab(){
    ov.classList.add('is-hidden');
    ov.setAttribute('aria-hidden','true');
    fab.classList.add('is-visible');
    document.body.classList.add('discord-fab-active');
    lockPage(false);
  }
  function toModal(){
    loadPopupImg();
    ov.classList.remove('is-hidden');
    ov.setAttribute('aria-hidden','false');
    fab.classList.remove('is-visible');
    document.body.classList.remove('discord-fab-active');
    lockPage(true);
  }
  function init(){
    toModal();
  }
  closeBtn.addEventListener('click',function(e){
    e.preventDefault();
    e.stopPropagation();
    toFab();
  });
  ov.addEventListener('click',function(e){
    if(e.target===ov)e.preventDefault();
  });
  document.addEventListener('keydown',function(e){
    if(!ov.classList.contains('is-hidden')&&e.key==='Escape'){
      e.preventDefault();
      e.stopPropagation();
    }
  },true);
  function runInit(){
    // Delay kecil supaya first paint selesai dulu (jaga skor mobile).
    setTimeout(function(){
      (window.requestIdleCallback||function(cb){setTimeout(cb,1)})(init);
    }, 1200);
  }
  if(document.readyState==='complete')runInit();
  else window.addEventListener('load',runInit,{once:true});
})();
</script>`;
}

function buildNotifBar() {
  return `
<div id="ym-notif" role="status" aria-live="polite" aria-atomic="true" hidden>
  <span id="ym-notif-deco" aria-hidden="true">✦</span>
  <span id="ym-notif-text"></span>
  <button id="ym-notif-close" aria-label="Tutup notifikasi" title="Tutup">✕</button>
</div>
<script>
(function(){
  var SK='ym_notif_v1';
  var bar=document.getElementById('ym-notif');
  var txt=document.getElementById('ym-notif-text');
  var cls=document.getElementById('ym-notif-close');
  var autoTimer=null;
  if(!bar||!txt||!cls)return;
  function dismiss(){
    if(autoTimer){clearTimeout(autoTimer);autoTimer=null;}
    bar.classList.remove('ym-in');
    bar.classList.add('ym-out');
    sessionStorage.setItem(SK,'1');
    bar.addEventListener('animationend',function h(){
      bar.hidden=true;bar.removeEventListener('animationend',h);
    },{once:true});
  }
  function show(text,durationSec){
    txt.textContent=text;
    bar.hidden=false;
    requestAnimationFrame(function(){requestAnimationFrame(function(){bar.classList.add('ym-in');});});
    if(autoTimer){clearTimeout(autoTimer);autoTimer=null;}
    var dur=parseInt(durationSec,10);
    if(!isNaN(dur)&&dur>0){
      autoTimer=setTimeout(dismiss,dur*1000);
    }
  }
  function init(){
    if(sessionStorage.getItem(SK))return;
    var ck=Math.floor(Date.now()/3e5);
    fetch('../notification.json?v='+ck,{cache:'force-cache',priority:'low'})
      .then(function(r){return r.ok?r.json():null})
      .then(function(d){
        if(d&&d.active&&d.text){
          var dur=(typeof d.durationSec==='number')?d.durationSec:8;
          setTimeout(function(){show(d.text,dur);},900);
        }
      })
      .catch(function(){});
  }
  cls.addEventListener('click',dismiss);
  if(document.readyState==='complete'){
    (window.requestIdleCallback||function(cb){setTimeout(cb,200)})(init);
  } else {
    window.addEventListener('load',function(){
      (window.requestIdleCallback||function(cb){setTimeout(cb,200)})(init);
    },{once:true});
  }
})();
<\/script>`;
}

function renderText(str) {
  return escHtml(str||'').replace(/(^|\s)(@[^\s<]{1,40})/g, '$1<span class="cm-mention">$2</span>');
}

/** Navbar & menu — sama dengan index.html (prefix relatif ke folder artis/). */
const SITE_NAV_CSS = `
nav{position:sticky;top:0;z-index:100;display:flex;align-items:center;justify-content:space-between;padding:1.2rem 3rem;min-width:0;max-width:100%;background:var(--paper);border-bottom:1px solid rgba(10,8,18,.08);isolation:isolate}
@media(min-width:768px){nav{background:rgba(245,240,234,.92);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px)}}
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
  .artist-title{font-size:1.6rem;line-height:1.4}
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
  .related-ro{font-size:.6rem;line-height:1.6;padding-bottom:.2rem;display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden}
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

function buildSongPageTitle(titleMain, artist) {
  const t = String(titleMain || '').trim();
  const a = String(artist || '').trim();
  if (a) return `${t} - ${a} | Terjemahan Indonesia`;
  return `${t} | Terjemahan Indonesia`;
}

/** Meta description: tentang lagu (ID) → cuplikan terjemahan lirik → fallback singkat. */
function buildSongMetaDesc(song, lyrics, titleMain, artist) {
  const descId = String(song.descId || '').replace(/\s+/g, ' ').trim();
  if (descId) return descId.substring(0, 160);

  const idLines = (lyrics || []).map(l => String(l.id || '').trim()).filter(Boolean);
  if (idLines.length) {
    const fromLyrics = idLines.slice(0, 5).join(' ').replace(/\s+/g, ' ').trim();
    if (fromLyrics) return fromLyrics.substring(0, 160);
  }

  const roLines = (lyrics || []).map(l => String(l.ro || l.jp || '').trim()).filter(Boolean);
  if (roLines.length) {
    const fromRo = roLines.slice(0, 5).join(' ').replace(/\s+/g, ' ').trim();
    if (fromRo) return fromRo.substring(0, 160);
  }

  const t = String(titleMain || '').trim();
  const a = String(artist || '').trim();
  return `Lirik ${t}${a ? ` - ${a}` : ''} dengan terjemahan bahasa Indonesia.`.substring(0, 160);
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

async function buildGlossaryPages(songMeta, today) {
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
<title>${escHtml(term.title)} — Glosarium | YumeLyrics</title>
<meta name="description" content="${escHtml(term.desc)} Contoh dari lirik lagu Jepang di YumeLyrics.">
<link rel="canonical" href="${BASE_URL}/kata/${term.slug}.html">
<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: [{ '@type': 'Question', name: `Apa itu pola tata bahasa Jepang ${term.title}?`, acceptedAnswer: { '@type': 'Answer', text: term.desc + ' Temukan contoh penggunaan nyata dari lirik lagu Jepang di YumeLyrics.' } }, { '@type': 'Question', name: `Bagaimana cara menggunakan ${term.title} dalam bahasa Jepang?`, acceptedAnswer: { '@type': 'Answer', text: term.desc } }] })}</script>
${buildGeoAeoMeta({ title: `${term.title} — Glosarium | YumeLyrics`, description: term.desc + ' Contoh dari lirik lagu Jepang di YumeLyrics.', url: `${BASE_URL}/kata/${term.slug}.html` })}
${FONT_HEAD}
${FONT_LINK}
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
<title>Glosarium Tata Bahasa Jepang | YumeLyrics</title>
<meta name="description" content="Glosarium partikel dan pola bahasa Jepang dari lirik lagu — contoh nyata dari katalog YumeLyrics.">
<link rel="canonical" href="${BASE_URL}/kata/">
${buildGeoAeoMeta({ title: 'Glosarium Tata Bahasa Jepang | YumeLyrics', description: 'Glosarium partikel dan pola bahasa Jepang dari lirik lagu — contoh nyata dari katalog YumeLyrics.', url: `${BASE_URL}/kata/` })}
${FONT_HEAD}
${FONT_LINK}
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

/**
 * ─────────────────────────────────────────────────────────────────
 *  AI SEO · AEO · GEO helpers
 *  Tambahkan ke semua halaman yang di-generate agar dapat diindeks
 *  oleh AI search (Perplexity, ChatGPT, Gemini, dll.) dan muncul di
 *  featured snippet / voice answer.
 * ─────────────────────────────────────────────────────────────────
 */

/**
 * buildGeoAeoMeta — blok meta tag AI SEO / AEO / GEO.
 *
 * AI SEO  : meta robots eksplisit untuk setiap AI crawler utama.
 * AEO     : citation metadata agar AI men-cite sumber dengan benar +
 *           sinyal speakable untuk voice search.
 * GEO     : Dublin Core (dcterms) agar AI generatif (ChatGPT, Gemini,
 *           Perplexity) memahami entitas, bahasa, dan pemilik konten.
 */
function buildGeoAeoMeta({ title, description, url = '', dateModified = '', language = 'id', author = 'YumeLyrics' }) {
  const dm         = dateModified || new Date().toISOString().split('T')[0];
  const cleanDesc  = String(description || '').replace(/"/g, '&quot;').substring(0, 200);
  const cleanTitle = String(title || '').replace(/"/g, '&quot;');
  const cleanUrl   = String(url || '');
  return `<!-- ── AI SEO: izinkan AI crawler utama ──────────────────────── -->
<meta name="GPTBot" content="index">
<meta name="ChatGPT-User" content="index">
<meta name="Google-Extended" content="index">
<meta name="PerplexityBot" content="index">
<meta name="ClaudeBot" content="index">
<meta name="anthropic-ai" content="index">
<meta name="cohere-ai" content="index">
<meta name="YouBot" content="index">
<meta name="Diffbot" content="index">
<!-- ── AEO: Citation metadata — AI atribusi sumber dengan benar ── -->
<meta name="citation_title" content="${cleanTitle}">
<meta name="citation_author" content="${author}">
<meta name="citation_publisher" content="YumeLyrics — yumelyrics.my.id">
<meta name="citation_online_date" content="${dm}">
<meta name="citation_language" content="${language}">${cleanUrl ? `
<meta name="citation_abstract_html_url" content="${cleanUrl}">` : ''}
<!-- ── GEO: Dublin Core — machine-readable untuk AI generatif ─── -->
<meta name="dcterms.title" content="${cleanTitle}">
<meta name="dcterms.description" content="${cleanDesc}">
<meta name="dcterms.language" content="${language}">
<meta name="dcterms.creator" content="${author}">
<meta name="dcterms.publisher" content="YumeLyrics — yumelyrics.my.id">
<meta name="dcterms.rights" content="© YumeLyrics — yumelyrics.my.id">
<meta name="dcterms.modified" content="${dm}">${cleanUrl ? `
<meta name="dcterms.identifier" content="${cleanUrl}">` : ''}
<meta name="dcterms.type" content="Text">
<meta name="dcterms.format" content="text/html">
<!-- ── AEO: voice search / featured snippet signal ───────────── -->
<meta name="speakable" content="true">`;
}

/**
 * buildFAQSchema — FAQPage schema.org untuk halaman lagu.
 *
 * AEO: FAQ schema menjadi sumber jawaban di Google's People Also Ask,
 *      Bing Answer Box, dan voice assistant.
 * GEO: Pertanyaan terstruktur membantu AI generatif menjawab query
 *      seperti "apa arti lagu X" dengan mengutip YumeSubs.
 */
function buildFAQSchema(titleMain, titleId, artist, animeDisplay, metaDesc) {
  const faqs = [
    {
      q: `Apa arti lagu ${titleMain}${artist ? ` oleh ${artist}` : ''}?`,
      a: metaDesc
    },
    {
      q: `Di mana bisa baca lirik ${titleMain}${artist ? ` - ${artist}` : ''} terjemahan bahasa Indonesia?`,
      a: `Lirik lengkap ${titleMain}${artist ? ` oleh ${artist}` : ''} beserta terjemahan bahasa Indonesia dan romaji tersedia di YumeSubs (yumelyrics.my.id). ${metaDesc}`
    },
    {
      q: `Apakah lirik ${titleMain} tersedia dalam romaji dan terjemahan?`,
      a: `Ya. YumeSubs menyediakan tiga versi teks untuk lagu ${titleMain}: teks Jepang asli (kanji/kana), romaji, dan terjemahan bahasa Indonesia secara lengkap per baris.`
    },
  ];
  if (titleId) {
    faqs.push({
      q: `Apa makna judul lagu "${titleMain}"?`,
      a: `Judul lagu "${titleMain}" dalam bahasa Indonesia berarti "${titleId}".`
    });
  }
  if (animeDisplay) {
    faqs.push({
      q: `Lagu "${titleMain}" berasal dari anime apa?`,
      a: `"${titleMain}"${artist ? ` oleh ${artist}` : ''} adalah lagu dari anime ${animeDisplay}.`
    });
  }
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(f => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a }
    }))
  });
}

/**
 * buildArtistFAQSchema — FAQPage schema untuk halaman artis.
 * AEO: muncul di "People Also Ask" untuk query seperti "lirik [artis]".
 */
function buildArtistFAQSchema(artistName, count, metaDesc) {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: `Di mana bisa baca lirik lagu ${artistName} terjemahan Indonesia?`,
        acceptedAnswer: {
          '@type': 'Answer',
          text: `Lirik lagu ${artistName} dengan terjemahan bahasa Indonesia tersedia di YumeLyrics (yumelyrics.my.id). ${metaDesc}`
        }
      },
      {
        '@type': 'Question',
        name: `Berapa banyak lagu ${artistName} yang tersedia di YumeLyrics?`,
        acceptedAnswer: {
          '@type': 'Answer',
          text: `YumeLyrics memiliki ${count} lagu ${artistName} lengkap dengan teks Jepang, romaji, dan terjemahan bahasa Indonesia.`
        }
      },
      {
        '@type': 'Question',
        name: `Apakah lirik ${artistName} di YumeLyrics disertai romaji?`,
        acceptedAnswer: {
          '@type': 'Answer',
          text: `Ya, semua lirik ${artistName} di YumeLyrics dilengkapi tiga lapisan teks: Jepang asli (kanji/kana), romaji, dan terjemahan bahasa Indonesia.`
        }
      },
    ]
  });
}

async function generateArtistIndexHTML(artists) {
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
    name: 'Daftar Artis — YumeLyrics',
    description: `${sorted.length} artis, ${totalSongs} lagu lirik Jepang dengan terjemahan Indonesia.`,
    url: `${BASE_URL}/artis/`,
    inLanguage: 'id',
    isPartOf: { '@type': 'WebSite', name: 'YumeLyrics', alternateName: ['YumeSubs', 'Yume Lyrics'], url: BASE_URL },
  });

  return minifyHtml(`<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<meta name="robots" content="index, follow">
<title>Daftar Artis — Lirik Jepang + Terjemahan Indonesia | YumeLyrics</title>
<meta name="description" content="${sorted.length} artis dengan lirik Jepang, romaji, dan terjemahan bahasa Indonesia di YumeLyrics.">
<meta property="og:title" content="Daftar Artis | YumeLyrics">
<meta property="og:site_name" content="YumeLyrics">
<meta property="og:url" content="${BASE_URL}/artis/">
<meta property="og:type" content="website">
<link rel="canonical" href="${BASE_URL}/artis/">
<link rel="icon" type="image/jpeg" href="../anime_icon.png">
<script type="application/ld+json">${schema}</script>
${buildGeoAeoMeta({ title: 'Daftar Artis — Lirik Jepang + Terjemahan Indonesia | YumeLyrics', description: sorted.length + ' artis dengan lirik Jepang, romaji, dan terjemahan bahasa Indonesia di YumeLyrics.', url: BASE_URL + '/artis/' })}
${FONT_HEAD}
${FONT_LINK}
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
.artist-title{font-family:var(--serif);font-size:clamp(2.2rem,5vw,3.4rem);font-weight:300;font-style:italic;line-height:1.35;padding-bottom:.3rem}
.artist-count{font-size:.62rem;font-weight:700;letter-spacing:.22em;text-transform:uppercase;color:var(--smoke);margin-top:.6rem}
.catalog{padding:2rem 3.5rem 5rem}
.related-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:1rem}
.related-card{display:flex;align-items:center;gap:1rem;padding:1rem;border:1px solid var(--border);text-decoration:none;color:inherit;transition:border-color .2s,background .2s}
.related-card:hover{border-color:var(--gold);background:rgba(201,169,110,.06)}
.related-thumb{width:52px;height:52px;object-fit:cover;flex-shrink:0}
.rc-no-img{width:52px;height:52px;display:flex;align-items:center;justify-content:center;background:var(--cream);color:var(--smoke);flex-shrink:0}
.related-title{font-size:.88rem;font-weight:600}
.related-ro{font-size:.68rem;color:var(--ash);margin-top:.2rem;line-height:1.9;padding-bottom:.3rem}
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
</html>`);
}

async function generateArtistHTML(artistName, songs, artistSlug) {
  const count = songs.length;
  const metaDesc = `${count} lagu ${artistName} dengan lirik Jepang, romaji, dan terjemahan bahasa Indonesia di YumeLyrics.`;
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
    name: `Lirik ${artistName} — YumeLyrics`,
    description: metaDesc,
    url: `${BASE_URL}/artis/${artistSlug}.html`,
    inLanguage: 'id',
    isPartOf: { '@type': 'WebSite', name: 'YumeLyrics', alternateName: ['YumeSubs', 'Yume Lyrics'], url: BASE_URL },
    mainEntity: {
      '@type': 'MusicGroup',
      name: artistName,
      url: `${BASE_URL}/artis/${artistSlug}.html`,
    },
  });

  return minifyHtml(`<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<meta name="robots" content="index, follow">
<title>Lirik ${escHtml(artistName)} — ${count} Lagu + Terjemahan Indonesia | YumeLyrics</title>
<meta name="description" content="${escHtml(metaDesc)}">
<meta property="og:title" content="Lirik ${escHtml(artistName)} | YumeLyrics">
<meta property="og:description" content="${escHtml(metaDesc)}">
<meta property="og:url" content="${BASE_URL}/artis/${artistSlug}.html">
<meta property="og:type" content="website">
<meta property="og:site_name" content="YumeLyrics">
<link rel="canonical" href="${BASE_URL}/artis/${artistSlug}.html">
<link rel="icon" type="image/jpeg" href="../anime_icon.png">
<script type="application/ld+json">${schema}</script>
<script type="application/ld+json">${buildArtistFAQSchema(artistName, count, metaDesc)}</script>
${buildGeoAeoMeta({ title: 'Lirik ' + artistName + ' — ' + count + ' Lagu + Terjemahan Indonesia | YumeLyrics', description: metaDesc, url: BASE_URL + '/artis/' + artistSlug + '.html' })}
${FONT_HEAD}
${FONT_LINK}
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
.artist-title{font-family:var(--serif);font-size:clamp(2.2rem,5vw,3.4rem);font-weight:300;font-style:italic;color:var(--ink);line-height:1.35;padding-bottom:.3rem;margin-bottom:.6rem}
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
.related-ro{font-family:var(--serif);font-size:.75rem;font-style:italic;color:var(--ash);line-height:1.9;padding-bottom:.3rem}
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
</html>`);
}

async function generateHTML(song, slug, relatedByArtist=[], relatedByAnime=[], artistSlug='', generatedAt='') {
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
  const descId       = song.descId || '';
  const descJp       = song.descJp || '';

  const pageTitle    = buildSongPageTitle(titleMain, artist);
  const metaDesc     = buildSongMetaDesc(song, lyrics, titleMain, artist);
  const moodChipsHTML = buildMoodChipsHTML(song.mood);
  const learnMetaHTML = buildLearnMetaHTML(song);
  const lyricsPlain = lyrics.map(l => ({ jp: l.jp || '', ro: l.ro || '', id: l.id || '' }));
  // Build teks lirik mentah saat generate — dipakai doCopyLyric tanpa baca DOM
  const rawLyricsText = lyricsPlain
    .map(l => [l.jp, l.ro, l.id].filter(Boolean).join('\n'))
    .filter(Boolean)
    .join('\n\n') + '\n\n© YumeSubs — yumelyrics.my.id';
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
    '<div class="ljp">' + escHtml(l.jp||'') + '</div>' +
    (l.ro ? '<div class="lro">' + escHtml(l.ro) + '</div>' : '') +
    '</div>' +
    (l.id ? '<div class="lyric-right"><div class="lid">' + escHtml(l.id) + '</div></div>' : '<div class="lyric-right"></div>') +
    '<div class="line-actions">' +
    '<button type="button" class="line-share-btn" onclick="event.stopPropagation();shareLine(' + i + ')" title="Bagikan baris ini" aria-label="Bagikan baris">↗</button>' +
    '</div></div>'
  ).join('');

  const lyricsHTMLJson = JSON.stringify(lyricsHTML);
  const dateModified = generatedAt || new Date().toISOString();
  // AEO / GEO: FAQ schema + meta block untuk halaman lagu ini
  const faqSchema  = buildFAQSchema(titleMain, titleId, artist, animeDisplay, metaDesc);
  const geoAeoMeta = buildGeoAeoMeta({
    title: pageTitle,
    description: metaDesc,
    url: `${BASE_URL}/lagu/${slug}.html`,
    dateModified,
  });
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
      "url":`${BASE_URL}/lagu/${slug}.html`,
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
      "name": pageTitle,
      "description":metaDesc,
      "url":`${BASE_URL}/lagu/${slug}.html`,
      "inLanguage":"id",
      "datePublished":"2025-01-01",
      "dateModified":dateModified,
      "isPartOf":{
        "@type":"WebSite",
        "name":"YumeLyrics",
        "alternateName":["YumeSubs","Yume Lyrics","Yume Subs","yumelyrics"],
        "url":BASE_URL,
        "description":"YumeLyrics — website lirik lagu Jepang lengkap dengan romaji dan terjemahan bahasa Indonesia.",
        "potentialAction":{
          "@type":"SearchAction",
          "target":{"@type":"EntryPoint","urlTemplate":`${BASE_URL}/index.html?q={search_term_string}`},
          "query-input":"required name=search_term_string"
        },
        "publisher":{
          "@type":"Organization",
          "name":"YumeLyrics",
          "url":BASE_URL,
          "logo":{"@type":"ImageObject","url":`${BASE_URL}/anime_icon.png`,"width":512,"height":512}
        }
      },
      "breadcrumb":{
        "@type":"BreadcrumbList",
        "itemListElement":[
          {"@type":"ListItem","position":1,"name":"Beranda","item":BASE_URL},
          {"@type":"ListItem","position":2,"name":"Katalog","item":`${BASE_URL}/index.html`},
          {"@type":"ListItem","position":3,"name":`${titleMain} - ${artist}`,"item":`${BASE_URL}/lagu/${slug}.html`}
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
      "headline": pageTitle,
      "description":metaDesc,
      "url":`${BASE_URL}/lagu/${slug}.html`,
      "inLanguage":"id",
      "datePublished":"2025-01-01",
      "dateModified":dateModified,
      "author":{"@type":"Organization","name":"YumeLyrics","url":BASE_URL},
      "publisher":{
        "@type":"Organization",
        "name":"YumeLyrics",
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

  return minifyHtml(`<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${SONG_CSP}">
<meta http-equiv="Referrer-Policy" content="strict-origin-when-cross-origin">
<meta http-equiv="Permissions-Policy" content="camera=(), microphone=(), geolocation=()">
${THEME_BOOT_SCRIPT}
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1">
<meta name="googlebot" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1">
<meta name="author" content="YumeLyrics">
<meta name="theme-color" content="#f5f0ea">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="YumeLyrics">
<meta name="mobile-web-app-capable" content="yes">
<meta name="readable" content="false">
<meta name="application-name" content="YumeLyrics">
<meta name="format-detection" content="telephone=no">
<meta name="copyright" content="YumeLyrics — yumelyrics.my.id">
<meta name="geo.region" content="ID">
<meta name="content-language" content="id">
<meta name="classification" content="Entertainment/Music">
<meta name="language" content="Indonesian">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
${song.img && /ytimg\.com|img\.youtube\.com/i.test(song.img) ? '<link rel="preconnect" href="https://i.ytimg.com" crossorigin>' : ''}
${song.img && /i\.scdn\.co/i.test(song.img) ? '<link rel="preconnect" href="https://i.scdn.co" crossorigin>' : ''}
<link rel="dns-prefetch" href="https://www.youtube.com">
<link rel="dns-prefetch" href="https://nicovideo.cdn.nimg.jp">
${song.img ? `<link rel="preload" as="image" href="${escHtml(coverImgUrl(song.img))}" fetchpriority="high">` : ''}
<title>${escHtml(pageTitle)}</title>
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
  'YumeLyrics',
  'YumeSubs',
].filter(Boolean).join(', ')}">
<meta property="og:title" content="${escHtml(pageTitle)}">
<meta property="og:description" content="${escHtml(metaDesc)}">
<meta property="og:url" content="${BASE_URL}/lagu/${slug}.html">
<meta property="og:type" content="music.song">
<meta property="og:site_name" content="YumeLyrics">
<meta property="og:locale" content="id_ID">
${song.img?`<meta property="og:image" content="${escHtml(song.img)}">
<meta property="og:image:secure_url" content="${escHtml(song.img)}">
<meta property="og:image:alt" content="Cover ${escHtml(titleMain)} - ${escHtml(artist)}">
<meta property="og:image:width" content="600">
<meta property="og:image:height" content="600">` : `<meta property="og:image" content="${BASE_URL}/anime_icon.png">`}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:site" content="@YumeSubs">
<meta name="twitter:title" content="${escHtml(pageTitle)}">
<meta name="twitter:description" content="${escHtml(metaDesc)}">
${song.img?`<meta name="twitter:image" content="${escHtml(song.img)}">` : `<meta name="twitter:image" content="${BASE_URL}/anime_icon.png">`}
<link rel="canonical" href="${BASE_URL}/lagu/${slug}.html">
<link rel="alternate" hreflang="id" href="${BASE_URL}/lagu/${slug}.html">
<link rel="alternate" hreflang="x-default" href="${BASE_URL}/lagu/${slug}.html">
<link rel="icon" type="image/jpeg" href="../anime_icon.png">
<script type="application/ld+json">${schema}</script>
<script type="application/ld+json">${faqSchema}</script>
${geoAeoMeta}
${FONT_LINK}
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
.combx{position:relative}
.ll-item,.ljp,.lro,.lid{-webkit-user-modify:read-only}
html.readability-mode #ll,html.readability-mode .lyrics-main,html.readability-mode .lyrics-section,
body.moz-reader-content #ll,body.moz-reader-content .lyrics-section,
#moz-reader-content #ll,.readability-styled #ll{display:none!important;visibility:hidden!important;height:0!important;overflow:hidden!important;pointer-events:none!important}
.rm-poison{font-size:1px;line-height:1px;color:transparent;background:transparent;border:none;padding:0;margin:0;max-height:1px;overflow:hidden}
.rm-decoy{font-size:1px;color:transparent;overflow:hidden;max-height:1px}
*{margin:0;padding:0;box-sizing:border-box;-webkit-user-select:none;-moz-user-select:none;-ms-user-select:none;user-select:none}
.no-transition,html.no-transition *{transition:none!important}
html{transition:background-color .35s ease}
body,nav,.lyrics-sidebar,.lyrics-main,.hero,.hero-text,.hero-visual,.section-divider,.cover-frame,.cover-wrap,.cmsec,.related-section-block,.comments-section{transition:background .35s ease,color .35s ease,border-color .35s ease}
input,textarea,*[contenteditable]{-webkit-user-select:text;-moz-user-select:text;user-select:text}
html,body{margin:0;padding:0}
html{scroll-behavior:smooth;background:var(--paper);scrollbar-gutter:stable}
body{background:var(--paper);color:var(--ink);font-family:var(--sans);min-height:100dvh;overflow-x:hidden;position:relative;-webkit-touch-callout:none;transition:var(--nm-transition)}
nav{transition:var(--nm-transition)}
::-webkit-scrollbar{width:3px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:rgba(10,8,18,.15)}

/* ── NAV ── */
nav{display:flex;align-items:center;justify-content:space-between;padding:1.4rem 3rem;border-bottom:1px solid rgba(10,8,18,.08);position:sticky;top:0;z-index:100;background:var(--paper)}
@media(min-width:769px){nav{background:rgba(245,240,234,.9);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px)}}
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
.song-title-ro{font-family:var(--serif);font-size:1.5rem;font-weight:300;font-style:italic;color:var(--ash);letter-spacing:.05em;line-height:1.55;padding-bottom:.35rem;margin-bottom:.3rem}
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
.lyrics-section{display:block;min-height:auto}
.lyrics-sidebar{padding:1.2rem 3.5rem;border-bottom:1px solid rgba(10,8,18,.08);display:flex;flex-direction:row;flex-wrap:wrap;gap:1.25rem 3rem;align-items:flex-start;position:static;height:auto;overflow:visible}
.sidebar-section-label{font-size:.58rem;font-weight:700;letter-spacing:.25em;text-transform:uppercase;color:var(--smoke);margin-bottom:1rem;display:block}
.toggle-group{display:flex;flex-direction:column;gap:.35rem}
.toggle-item{display:flex;align-items:center;justify-content:space-between;cursor:pointer;padding:.4rem 0;border-bottom:1px solid rgba(10,8,18,.06)}
.toggle-label{font-size:.78rem;font-weight:600;letter-spacing:.08em;color:var(--ash);transition:color .15s}
.toggle-item:hover .toggle-label{color:var(--ink)}
.toggle-switch{width:28px;height:16px;border-radius:8px;border:1.5px solid rgba(10,8,18,.2);background:transparent;position:relative;transition:all .2s;cursor:pointer}
.toggle-switch.on{background:var(--gold);border-color:var(--gold)}
.toggle-switch::after{content:'';position:absolute;top:2px;left:2px;width:10px;height:10px;border-radius:50%;background:var(--ash);transition:all .2s}
.toggle-switch.on::after{left:14px;background:#fff}
.thumbs-block{display:flex;flex-direction:column;gap:.75rem;flex:1;min-width:320px}
.thumbs-row{display:flex;flex-direction:column;align-items:stretch;gap:.75rem}

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
.line-share-btn{opacity:0;border:none;background:transparent;color:var(--smoke);cursor:pointer;font-size:.7rem;padding:.15rem .35rem;transition:opacity .15s,color .15s}
.ll-item:hover .line-share-btn{opacity:1}
.line-share-btn:hover{color:var(--gold)}
@media(max-width:768px){.line-actions{top:.4rem;right:.2rem}.line-share-btn{opacity:.55}}
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
.ll-item{display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid rgba(10,8,18,.06);padding:1.5rem 2.75rem 1.5rem 0;position:relative;transition:background .15s;content-visibility:auto;contain-intrinsic-size:0 60px}
body.mode-quiz .ll-item:hover,body.mode-karaoke .ll-item:hover{background:rgba(201,169,110,.04);margin:0 -1rem;padding:1.5rem 2.75rem 1.5rem 1rem}
.ll-item:last-child{border-bottom:none}
/* Sembunyikan lirik sampai JS selesai */
.ljp{font-family:var(--jp);font-size:1.25rem;font-weight:400;color:var(--ink);line-height:1.7;overflow:visible;visibility:hidden;word-break:break-word;overflow-wrap:break-word;display:flex;flex-wrap:wrap;align-items:baseline;gap:0;max-width:100%;-webkit-user-select:none;-moz-user-select:none;-ms-user-select:none;user-select:none}
.lro{font-family:var(--ro);font-size:.88rem;color:var(--dusk);font-style:normal;font-weight:400;letter-spacing:.01em;line-height:1.95;overflow:visible;visibility:hidden;padding-bottom:.3rem;overflow-wrap:anywhere;display:flex;flex-wrap:wrap;align-items:baseline;gap:0;max-width:100%;-webkit-user-select:none;-moz-user-select:none;-ms-user-select:none;user-select:none}
.lid{font-family:var(--ro);font-size:.93rem;color:var(--plum);font-weight:400;line-height:1.8;overflow:visible;visibility:hidden;padding-bottom:.3rem;overflow-wrap:anywhere;display:flex;flex-wrap:wrap;align-items:baseline;gap:0;max-width:100%;-webkit-user-select:none;-moz-user-select:none;-ms-user-select:none;user-select:none}
.rdy .ljp,.rdy .lro,.rdy .lid{visibility:visible;transition:opacity .15s}
.lro.h,.lid.h,.ljp.h{visibility:hidden!important;pointer-events:none}
.lyric-left,.lyric-right{display:flex;flex-direction:column;gap:.4rem}
.lyric-right{padding-left:2rem;border-left:1px solid rgba(10,8,18,.06);min-width:0;overflow-wrap:break-word;word-break:break-word}
.lyric-num{position:absolute;left:-2.5rem;top:1.5rem;font-family:var(--serif);font-size:.72rem;font-weight:300;color:var(--smoke);letter-spacing:.05em}
.lsep{display:none}

/* ── THUMBS (sidebar) ── */
.thumbs-btn{display:flex;align-items:center;gap:.75rem;background:none;border:1.5px solid var(--border);padding:.6rem 1rem;cursor:pointer;transition:all .2s;width:100%;box-sizing:border-box;flex-shrink:0;white-space:nowrap;font-family:var(--sans);color:var(--ink)}
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
.spbtn{display:flex;align-items:center;gap:.6rem;background:#1DB954;border:none;padding:.65rem 1rem;cursor:pointer;font-family:var(--sans);font-size:.62rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#000;text-decoration:none;transition:opacity .2s}
.spbtn:hover{opacity:.87}
.spbtn svg{width:14px;height:14px;fill:#000;flex-shrink:0}
/* Discord-style Spotify card */
.spotify-card{display:flex;align-items:center;gap:0;background:#1e1f22;border-radius:8px;overflow:hidden;text-decoration:none;color:#fff;transition:background .15s;position:relative;flex:none;width:100%;max-width:100%;min-width:0;border-left:4px solid #1DB954;box-sizing:border-box}
.spotify-card:hover{background:#2a2b2f}
.spotify-card-art{width:72px;height:72px;min-width:72px;object-fit:cover;display:block;flex-shrink:0}
.spotify-card-art-fallback{width:72px;height:72px;min-width:72px;flex-shrink:0;background:#2a2b2f;display:flex;align-items:center;justify-content:center}
.spotify-card-body{flex:1;min-width:0;padding:10px 12px;display:flex;flex-direction:column;gap:3px;overflow:hidden}
.spotify-card-label{font-size:.58rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#1DB954;display:flex;align-items:center;gap:4px;white-space:nowrap}
.spotify-card-label svg{width:10px;height:10px;fill:#1DB954;flex-shrink:0}
.spotify-card-title{font-size:.8rem;font-weight:700;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-family:var(--sans)}
.spotify-card-artist{font-size:.72rem;color:#b5bac1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-family:var(--sans)}
.spotify-card-play{width:34px;height:34px;border-radius:50%;background:#1DB954;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-right:10px;transition:background .15s,transform .1s}
.spotify-card:hover .spotify-card-play{background:#1ed760;transform:scale(1.06)}
.spotify-card-play svg{width:12px;height:12px;fill:#000;margin-left:2px}
.ytwrap{margin-top:2rem;display:none} /* video tetap tersedia di-DOM tapi sidebar menggantinya */
.ytframe{width:100%;aspect-ratio:16/9;border:1px solid var(--border);background:#000;display:block}
.nico-card{display:flex;align-items:stretch;gap:0;background:linear-gradient(135deg,#1c1c22 0%,#161618 100%);border-radius:8px;overflow:hidden;text-decoration:none;color:#fff;transition:background .2s,box-shadow .2s;border-left:3px solid rgba(180,180,210,.35);box-sizing:border-box;max-width:340px;box-shadow:0 2px 14px rgba(0,0,0,.28);margin-top:.5rem}
.nico-card:hover{background:linear-gradient(135deg,#242430 0%,#1c1c22 100%);box-shadow:0 4px 22px rgba(0,0,0,.38)}
.nico-card-art{width:72px;height:72px;min-width:72px;object-fit:cover;display:block;flex-shrink:0;filter:brightness(.9) saturate(.85)}
.nico-card-art-fallback{width:72px;height:72px;min-width:72px;flex-shrink:0;background:#1e1e28;display:flex;align-items:center;justify-content:center;font-size:1.4rem;color:rgba(200,200,220,.4)}
.nico-card-body{flex:1;min-width:0;padding:10px 12px;display:flex;flex-direction:column;gap:3px;overflow:hidden}
.nico-card-label{font-size:.52rem;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:rgba(190,190,215,.65);display:flex;align-items:center;gap:5px;white-space:nowrap}
.nico-card-label svg{flex-shrink:0}
.nico-card-title{font-size:.8rem;font-weight:700;color:#eeeef2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-family:var(--sans)}
.nico-card-sub{font-size:.7rem;color:#7a7a8a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-family:var(--sans)}
.nico-card-cta{font-size:.6rem;font-weight:700;letter-spacing:.08em;color:rgba(210,210,230,.45);margin-top:3px;white-space:nowrap;font-family:var(--sans);text-transform:uppercase}
.nico-card:hover .nico-card-cta{color:rgba(210,210,230,.7)}
.nico-card-play{width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,.1);display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-right:12px;align-self:center;transition:background .15s,transform .12s;border:1.5px solid rgba(255,255,255,.15)}
.nico-card:hover .nico-card-play{background:rgba(255,255,255,.2);transform:scale(1.08)}
.nico-card-play svg{width:11px;height:11px;fill:#fff;margin-left:2px}

.card-duo{display:flex;flex-direction:row;gap:.5rem;flex-wrap:wrap;margin-top:.5rem}
.card-duo .nico-card{flex:1;min-width:200px;max-width:100%;margin-top:0}
${DISCORD_POPUP_CSS}
${NOTIF_BAR_CSS}

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
.related-ro{font-family:var(--serif);font-size:.75rem;font-style:italic;color:var(--ash);line-height:1.9;padding-bottom:.3rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
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
#waline .wl-input[name="url"],#waline label[for*="url"],#waline .wl-header-item:has(input[name="url"]){display:none!important}
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



/* ── MODALS ── */
#img-lightbox{position:fixed;inset:0;z-index:2000;background:rgba(10,8,18,.85);display:none;align-items:center;justify-content:center;cursor:zoom-out;backdrop-filter:blur(6px)}
#img-lightbox.open{display:flex}
#img-lightbox img{max-width:90vw;max-height:88vh;object-fit:contain;box-shadow:0 8px 48px rgba(0,0,0,.4);user-select:none}
#img-lightbox-close{position:absolute;top:1rem;right:1.2rem;background:none;border:none;color:#fff;font-size:1.6rem;cursor:pointer;opacity:.7;transition:opacity .15s;z-index:10;line-height:1}
#img-lightbox-close:hover{opacity:1}

/* ── ANIMATIONS ── */
@keyframes fadeUp{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:translateY(0)}}
/* heroFadeUp starts at opacity:.5 so LCP elements are painted immediately (not opacity:0) */
@keyframes heroFadeUp{from{opacity:.5;transform:translateY(14px)}to{opacity:1;transform:none}}
.hero-text>*{animation:heroFadeUp .6s ease both}
.hero-text .breadcrumb{animation-delay:.05s}
.hero-text .song-type{animation-delay:.1s}
.hero-text .song-title-jp{animation-delay:.15s}
.hero-text .song-title-ro{animation-delay:.2s}
.hero-text .song-title-id{animation-delay:.22s}
.hero-text .meta-row{animation-delay:.28s}
.hero-text .hero-actions{animation-delay:.35s}
.hero-visual{animation:heroFadeUp .7s ease .2s both}

/* ── RESPONSIVE ── */
@media(max-width:768px){
  .hero-visual,.hero-text>*{animation:none!important}
  .cover-img{filter:none;box-shadow:8px 10px 0 rgba(10,8,18,.08)}
}
@media(max-width:900px){
  nav{padding:1.2rem 1.5rem}
  .kanji-bg{display:none}
  .comments-section,.related-section-block,.cmsec{content-visibility:auto;contain-intrinsic-size:auto 400px}
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
  /* Sidebar 2 kolom di layar tablet */
  .lyrics-sidebar{
    display:grid;
    grid-template-columns:1fr 1fr;
    padding:1.2rem 1.5rem;
    gap:1.2rem;
    align-items:start;
  }
  /* Online counter span full width */
  .lyrics-sidebar>div:last-child{grid-column:1/-1}
  /* Tombol suka & spotify: full width, tidak overflow keluar sidebar */
  .thumbs-block{display:flex;flex-direction:column;gap:.6rem;min-width:0;overflow:hidden;box-sizing:border-box}
  #online-counter{width:100%;box-sizing:border-box}
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
  #online-counter{width:100%}
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
      <div class="thumbs-row">
        <button class="thumbs-btn" id="thumbs-btn" onclick="window.doThumb()" aria-label="Suka lagu ini">
          <span class="thumbs-icon">♡</span>
          <span id="thumbs-count-sb">…</span>
          <span id="thumbs-label">Suka lagu ini?</span>
        </button>
        ${song.sp ? `<a class="spotify-card" href="${escHtml(song.sp)}" target="_blank" rel="noopener" aria-label="Dengarkan di Spotify">
          ${song.img
            ? `<img class="spotify-card-art" src="${escHtml(thumbImgUrl(song.img))}" alt="Cover ${escHtml(titleMain)}" width="72" height="72" loading="lazy" decoding="async">`
            : `<div class="spotify-card-art-fallback"><svg viewBox="0 0 24 24" fill="#1DB954" width="24" height="24"><path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424a.622.622 0 0 1-.857.207c-2.348-1.435-5.304-1.76-8.785-.964a.622.622 0 1 1-.277-1.215c3.809-.87 7.077-.496 9.712 1.115.294.18.387.563.207.857zm1.223-2.722a.78.78 0 0 1-1.072.257c-2.687-1.652-6.785-2.131-9.965-1.166a.78.78 0 0 1-.973-.519.781.781 0 0 1 .519-.972c3.632-1.102 8.147-.568 11.234 1.329a.78.78 0 0 1 .257 1.071zm.105-2.835C14.692 8.95 9.375 8.775 6.297 9.71a.937.937 0 0 1-.582-1.782c3.532-1.155 9.404-.932 13.115 1.338a.937.937 0 0 1-.916 1.6z"/></svg></div>`
          }
          <div class="spotify-card-body">
            <span class="spotify-card-label">
              <svg viewBox="0 0 24 24"><path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424a.622.622 0 0 1-.857.207c-2.348-1.435-5.304-1.76-8.785-.964a.622.622 0 1 1-.277-1.215c3.809-.87 7.077-.496 9.712 1.115.294.18.387.563.207.857zm1.223-2.722a.78.78 0 0 1-1.072.257c-2.687-1.652-6.785-2.131-9.965-1.166a.78.78 0 0 1-.973-.519.781.781 0 0 1 .519-.972c3.632-1.102 8.147-.568 11.234 1.329a.78.78 0 0 1 .257 1.071zm.105-2.835C14.692 8.95 9.375 8.775 6.297 9.71a.937.937 0 0 1-.582-1.782c3.532-1.155 9.404-.932 13.115 1.338a.937.937 0 0 1-.916 1.6z"/></svg>
              Spotify
            </span>
            <span class="spotify-card-title">${escHtml(titleMain)}</span>
            <span class="spotify-card-artist">${escHtml(artist)}</span>
          </div>
          <div class="spotify-card-play">
            <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          </div>
        </a>` : ''}
      </div>
      ${song.nicoId ? `<div class="card-duo">
        <a class="nico-card" href="https://www.nicovideo.jp/watch/${escHtml(song.nicoId)}" target="_blank" rel="noopener" aria-label="Tonton di Niconico">
          <img class="nico-card-art" src="https://nicovideo.cdn.nimg.jp/thumbnails/${escHtml(song.nicoId.replace('sm',''))}/1" alt="Niconico thumbnail" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
          <div class="nico-card-art-fallback" style="display:none">▶</div>
          <div class="nico-card-body">
            <span class="nico-card-label">
              <svg viewBox="0 0 24 24" width="9" height="9" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
              NICONICO
            </span>
            <span class="nico-card-title">${escHtml(titleMain)}</span>
            <span class="nico-card-sub">${escHtml(artist)}</span>
            <span class="nico-card-cta">Tonton di Niconico →</span>
          </div>
          <div class="nico-card-play">
            <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          </div>
        </a>
      </div>` : ''}
      <div id="online-counter">
        <div class="online-dot-row">
          <div class="online-dot"></div>
          <span class="online-num" id="online-count">—</span>
        </div>
        <span class="online-sub">pembaca aktif</span>
      </div>
    </div>
</aside>

<!-- ── DIVIDER ── -->
<div class="section-divider" style="margin:2rem 0">
  <div class="divider-line"></div>
  <div class="divider-ornament">— Lirik Lengkap —</div>
  <div class="divider-line"></div>
</div>

<!-- ── LYRICS ── -->
<section class="lyrics-section combx supplemental" id="lyrics" data-nosnippet translate="no">

  <main class="lyrics-main">
    <div class="lyrics-controls">
      <button class="ctrl-pill active" data-view="all">Semua</button>
      <button class="ctrl-pill" data-view="jp">Jepang</button>
      <button class="ctrl-pill" data-view="ro">Romaji</button>
      <button class="ctrl-pill" data-view="tr">Terjemahan</button>
      <button class="ctrl-pill" id="focus-prev" type="button" onclick="focusStep(-1)" style="display:none">←</button>
      <button class="ctrl-pill" id="focus-next" type="button" onclick="focusStep(1)" style="display:none">→</button>
      <button class="ctrl-pill" id="copy-lyric-btn" onclick="doCopyLyric()" style="margin-left:auto" title="Copy semua lirik">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="vertical-align:-.1em"><rect x="9" y="9" width="13" height="13" rx="1"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        <span id="copy-btn-label">Copy</span>
      </button>
    </div>

    <div class="lyrics-container combx" id="ll" data-nosnippet translate="no" role="presentation" aria-label="Lirik interaktif"></div>
    <noscript><div class="lyrics-container lyrics-noscript">${lyricsHTML}</div></noscript>
    <script>
    (function(){
      var ll=document.getElementById('ll');
      if(ll) ll.innerHTML=${lyricsHTMLJson};
      document.body.classList.add('rdy');
    })();
    </script>
    <script>
    (function(){
      var RM_MSG='<p style="color:var(--ash);font-family:var(--sans);font-size:.9rem;line-height:1.7;padding:2rem 0">Lirik tidak tersedia di Reader Mode. Matikan Reader Mode lalu buka <a href="${BASE_URL}/lagu/${slug}.html" style="color:var(--gold)">yumelyrics.my.id</a> untuk melihat lirik lengkap.</p>';
      var RM_SEL='.readability-mode,.moz-reader-content,#moz-reader-content,.readability-styled,.reader-content,#reader-estimated-time';
      if(location.href.indexOf('about:reader')===0||document.documentElement.getAttribute('data-is-reader-mode')){
        document.body.innerHTML='<div style="font-family:sans-serif;padding:2rem;text-align:center;max-width:480px;margin:4rem auto"><h2>Konten tidak tersedia di Reader Mode</h2><p>Silakan matikan Reader Mode untuk melihat lirik di <a href="${BASE_URL}/lagu/${slug}">YumeSubs</a>.</p></div>';
        return;
      }
      var blocked=false;
      function isReaderActive(){
        var html=document.documentElement, body=document.body;
        if(html.classList.contains('readability-mode')||html.getAttribute('readability')!==null) return true;
        if(body.classList.contains('moz-reader-content')||document.getElementById('moz-reader-content')) return true;
        if(document.querySelector(RM_SEL)) return true;
        return false;
      }
      function blockLyrics(){
        if(blocked) return;
        blocked=true;
        var ll=document.getElementById('ll');
        if(ll) ll.innerHTML=RM_MSG;
        document.querySelectorAll('.lyrics-noscript').forEach(function(el){el.innerHTML='';});
      }
      function guard(){ if(isReaderActive()) blockLyrics(); }
      guard();
      if(window.MutationObserver){
        var obs=new MutationObserver(guard);
        obs.observe(document.documentElement,{attributes:true,attributeFilter:['class','data-is-reader-mode','readability'],childList:true,subtree:true});
        obs.observe(document.body,{attributes:true,attributeFilter:['class'],childList:true,subtree:false});
      }
      document.addEventListener('visibilitychange',guard,{passive:true});
      window.addEventListener('pageshow',guard,{passive:true});
      setInterval(guard,800);
    })();
    </script>

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
      <iframe class="ytframe" src="https://www.youtube.com/embed/${escHtml(song.ytId)}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe>
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
      <p class="comment-desc">Bagikan pendapatmu lewat Komentar — bebas sebagai tamu, tanpa perlu login.</p>
    </div>
  </div>
  <div id="waline"></div>
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

<div class="toast" id="toast"></div>
<!-- ── Lightbox ── -->
<div id="img-lightbox" onclick="closeLightbox()">
  <button id="img-lightbox-close" onclick="closeLightbox()">✕</button>
  <img id="img-lightbox-img" src="" alt="foto komentar">
</div>
<script>
/* ── Ctrl Pills (Semua / Jepang / Romaji / Terjemahan) ── */
function _initLyricPills(){
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
      var targets = {jp: view==='all'||view==='jp', ro: view==='all'||view==='ro', tr: view==='all'||view==='tr'};
      if(window._lyricSetView) window._lyricSetView(targets.jp, targets.ro, targets.tr);
      pills.forEach(function(p){ p.classList.remove('active'); });
      pill.classList.add('active');
    });
  });
}
if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',function(){
    (window.requestIdleCallback||function(cb){setTimeout(cb,1)})(_initLyricPills);
  },{once:true});
}else{
  (window.requestIdleCallback||function(cb){setTimeout(cb,1)})(_initLyricPills);
}
</script>
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

  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootYumeFeatures);
  else bootYumeFeatures();
  function bootYumeFeatures() {
    var run = function(){ initYumeFeatures(); };
    if (window.matchMedia('(max-width:768px)').matches) {
      (window.requestIdleCallback || function(cb){ setTimeout(cb, 1); })(run);
    } else {
      run();
    }
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
    if(isDark){
      root.removeAttribute('data-theme');
      localStorage.setItem('ym_theme','light');
    } else {
      root.setAttribute('data-theme','dark');
      localStorage.setItem('ym_theme','dark');
    }
  };
})();
</script>
<script type="module">
let _fbLoaded=false;
async function _initHeavy(){
if(_fbLoaded)return;_fbLoaded=true;
// Preconnect Firebase tepat sebelum load — tidak di head agar tidak hambat koneksi awal
['https://www.gstatic.com','https://firestore.googleapis.com'].forEach(h=>{const l=document.createElement('link');l.rel='preconnect';l.href=h;document.head.appendChild(l);});
const{initializeApp}=await import("https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js");
const{getFirestore,doc,increment,updateDoc,setDoc,deleteDoc,onSnapshot,serverTimestamp,collection}=await import("https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js");

const _app = initializeApp({
  apiKey:"AIzaSyA3dKYhDxX3DE5CAI_yQbjvUUdsBR0QeS8",
  authDomain:"yumesubs7.firebaseapp.com",
  projectId:"yumesubs7",
  storageBucket:"yumesubs7.firebasestorage.app",
  messagingSenderId:"1076202015626",
  appId:"1:1076202015626:web:ce89fb668eb6b2bd021673"
});
const db = getFirestore(_app);

const SONG_ID = ${JSON.stringify(songId)};
const SONG_SEED = ${JSON.stringify(songSeedObj)};
const __YUME_RAW_LYRICS = ${JSON.stringify(rawLyricsText)};
try { updateDoc(doc(db,'songs',SONG_ID), { views: increment(1) }); } catch(e){}

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
let _thumbVoted = false;
let _unsubSongStats = null;
const SONG_THUMB_KEY = 'ym_song_thumb_' + SONG_ID;

function fmtNum(n){ return n >= 1000 ? (n/1000).toFixed(1).replace(/\.0$/,'')+'k' : String(n||0); }

function loadThumb(){
  // Realtime listener untuk suka & dibaca
  if(_unsubSongStats) _unsubSongStats();
  _unsubSongStats = onSnapshot(doc(db,'songs',SONG_ID), snap => {
    const data = snap.exists() ? snap.data() : {};
    const total = (typeof data.thumbsUp === 'number' ? data.thumbsUp : (data.thumbs || 0));
    const views = data.views || 0;
    const tcEl = document.getElementById('thumbs-count');
    const tcSbEl = document.getElementById('thumbs-count-sb');
    const vcEl = document.getElementById('views-count');
    // Update keduanya dari sumber yang sama (onSnapshot) — jangan dari observer terpisah
    if(tcEl) animateCount(tcEl, fmtNum(total));
    if(tcSbEl && tcSbEl.textContent !== fmtNum(total)) tcSbEl.textContent = fmtNum(total);
    if(vcEl) animateCount(vcEl, fmtNum(views));
  }, ()=>{});

  // Status vote disimpan lokal (tanpa login), supaya klik tetap ringan
  _thumbVoted = false;
  try { _thumbVoted = localStorage.getItem(SONG_THUMB_KEY) === '1'; } catch(e){}
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
  const songRef = doc(db,'songs',SONG_ID);
  const labelEl = document.getElementById('thumbs-label');

  try {
    if(!_thumbVoted){
      // Tambah vote (tanpa login)
      await updateDoc(songRef, { thumbsUp: increment(1) });
      _thumbVoted = true;
      try { localStorage.setItem(SONG_THUMB_KEY, '1'); } catch(e){}
      btn.classList.add('voted','pop');
      setTimeout(()=>btn.classList.remove('pop'),400);
      // JANGAN update count manual di sini — onSnapshot di loadThumb() sudah handle ini
      // agar tidak double-update (manual +1 lalu onSnapshot trigger lagi → count naik 2x)
      labelEl.textContent = 'Kamu sudah suka lagu ini';
      const iconEl = btn.querySelector('.thumbs-icon');
      if(iconEl) iconEl.textContent = '♥';
    } else {
      // Hapus vote (toggle)
      await updateDoc(songRef, { thumbsUp: increment(-1) });
      _thumbVoted = false;
      try { localStorage.removeItem(SONG_THUMB_KEY); } catch(e){}
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

const WALINE_COMMENT_KEY = 'ym_waline2_' + ${JSON.stringify(slug)};
let _hasCommented = false;
try { _hasCommented = !!localStorage.getItem(WALINE_COMMENT_KEY); } catch(e) {}

function markWalineCommented() {
  if (_hasCommented) return;
  _hasCommented = true;
  try { localStorage.setItem(WALINE_COMMENT_KEY, String(Date.now())); } catch(e) {}
  updateCopyGate();
  toast('Terima kasih sudah berkomentar! 💬');
}
window.__yumeMarkWalineCommented = markWalineCommented;

function updateCopyGate() {
  const btn = document.getElementById('copy-lyric-btn');
  const label = document.getElementById('copy-btn-label');
  if (!btn) return;
  btn.disabled = false;
  btn.style.opacity = '';
  btn.style.cursor = '';
  btn.title = 'Copy semua lirik';
  if (label) label.textContent = 'Copy';
}
updateCopyGate();

/* ── Copy Lyric ── */
window.doCopyLyric = async () => {
  const full = typeof __YUME_RAW_LYRICS === 'string' && __YUME_RAW_LYRICS.trim()
    ? __YUME_RAW_LYRICS
    : '';
  if (!full) { toast('Tidak ada lirik untuk di-copy.'); return; }
  navigator.clipboard.writeText(full).then(() => {
    toast('✓ Lirik berhasil di-copy!');
    const badge = document.getElementById('copy-done-badge');
    if (badge) { badge.classList.add('show'); setTimeout(() => badge.classList.remove('show'), 3000); }
  }).catch(() => {
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
  // Use rAF so getBoundingClientRect() never forces a synchronous reflow
  requestAnimationFrame(function(){
    const y = target.getBoundingClientRect().top + window.scrollY - 80;
    window._smoothScrollTo(y);
  });
  const btn = document.querySelector('.hero-actions .btn-primary');
  if(btn){ btn.style.transform='translateY(4px)'; setTimeout(()=>btn.style.transform='',300); }
};

window._scrollToMV = function(){
  const sec = document.getElementById('yt-section');
  if(!sec) return;
  requestAnimationFrame(function(){
    const y = sec.getBoundingClientRect().top + window.scrollY - 80;
    window._smoothScrollTo(y);
  });
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

// Defer Waline loading until comments section is visible (IntersectionObserver)
(function(){
  var walineLoaded = false;
  function loadWaline(){
    if(walineLoaded) return;
    walineLoaded = true;
    if(!document.getElementById('waline-css')){
      var wlCss=document.createElement('link');
      wlCss.id='waline-css';
      wlCss.rel='stylesheet';
      wlCss.href='https://unpkg.com/@waline/client@3/dist/waline.css';
      document.head.appendChild(wlCss);
    }
    import('https://unpkg.com/@waline/client@3/dist/waline.js').then(function(m){
      var _walineInit = m.init;
      window._walineAppInstance = _walineInit({
        el: '#waline',
        serverURL: 'https://yumelyrics-comment.vercel.app',
        path: ${JSON.stringify('/lagu/' + slug)},
        comment: true,
        pageview: false,
        reaction: false,
        dark: 'html[data-theme="dark"]',
        meta: ['nick'],
        requiredMeta: [],
        imageUploader: function(file) {
          return new Promise(function(resolve, reject) {
            var reader = new FileReader();
            reader.onload = function(e) {
              var dataUrl = e.target.result;
              var panel = document.getElementById('yume-img-preview');
              if (!panel) {
                panel = document.createElement('div');
                panel.id = 'yume-img-preview';
                panel.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;padding:8px 4px 0;';
                var wEl = document.getElementById('waline');
                if (wEl) {
                  var editor = wEl.querySelector('.wl-editor');
                  if (editor) editor.appendChild(panel);
                  else wEl.prepend(panel);
                }
              }
              var img = document.createElement('img');
              img.src = dataUrl;
              img.title = file.name;
              img.style.cssText = 'width:72px;height:72px;object-fit:cover;border-radius:6px;border:1px solid rgba(0,0,0,.15);cursor:pointer;';
              img.onclick = function() {
                if (confirm('Hapus gambar ini dari pratinjau?')) { img.remove(); }
              };
              panel.appendChild(img);
              resolve(dataUrl);
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
        },
        locale: {
          placeholder: 'Tulis komentarmu di sini...',
          sofa: 'Jadilah yang pertama berkomentar!',
          submit: 'Kirim',
          nick: 'Nama',
          preview: 'Pratinjau',
          comment: 'Komentar',
          reply: 'Balas',
          more: 'Muat lebih banyak...',
          admin: 'Admin',
          word: '{0} kata',
          anonymous: 'Tamu',
          level0: 'Pendatang',
          level1: 'Pengunjung',
          level2: 'Reguler',
          level3: 'Veteran',
          level4: 'Master',
          level5: 'Legenda',
        },
      });
    }).catch(function(e){ console.error('Waline load error:', e); });
  }
  // Load when comments section is visible — fallback lebih lambat di mobile
  var _walineMobile = window.matchMedia('(max-width:768px)').matches;
  if('IntersectionObserver' in window){
    var observer = new IntersectionObserver(function(entries){
      if(entries[0].isIntersecting){
        observer.disconnect();
        loadWaline();
      }
    }, {rootMargin: _walineMobile ? '120px' : '200px'});
    var commentsEl = document.querySelector('.comments-section');
    if(commentsEl) observer.observe(commentsEl);
  }
  setTimeout(loadWaline, _walineMobile ? 9000 : 3000);
})();

// ── Waline submit-click detector ─────────────────────────────────────────
// Set flag HANYA ketika user benar-benar klik tombol Submit Waline,
// bukan saat inisialisasi/fetch internal Waline yang juga POST ke /api/comment.
// Flag di-reset setelah 8 detik atau setelah berhasil unlock.
window._ymPendingWalineSubmit = false;
(function() {
  var walineEl = document.getElementById('waline');
  if (!walineEl) return;
  walineEl.addEventListener('click', function(e) {
    var btn = e.target && (e.target.closest ? e.target.closest('button') : null);
    if (!btn) return;
    // Waline v3 submit button: class wl-btn + primary, atau type=submit
    if (btn.type === 'submit' || btn.classList.contains('wl-submit') ||
        (btn.classList.contains('primary') && btn.classList.contains('wl-btn'))) {
      window._ymPendingWalineSubmit = true;
      // Auto-reset jika dalam 8 detik tidak ada POST berhasil
      setTimeout(function() { window._ymPendingWalineSubmit = false; }, 8000);
    }
  }, true);
})();

// ── Fetch interceptor: unlock copy HANYA jika user benar-benar submit ────
(function() {
  var _orig = window.fetch;
  window.fetch = function(url, opts) {
    var p = _orig.apply(this, arguments);
    try {
      var u = typeof url === 'string' ? url : (url && url.url) || '';
      // Cek: harus POST ke /api/comment DAN user sudah klik Submit (flag aktif)
      if (window._ymPendingWalineSubmit &&
          opts && opts.method && opts.method.toUpperCase() === 'POST' &&
          u.indexOf('/api/comment') !== -1) {
        p.then(function(res) {
          if (res && res.ok) {
            window._ymPendingWalineSubmit = false;
            if (window.__yumeMarkWalineCommented) window.__yumeMarkWalineCommented();
          }
        }).catch(function() { window._ymPendingWalineSubmit = false; });
      }
    } catch(e) {}
    return p;
  };
})();

(function() {
  var _path = ${JSON.stringify('/lagu/' + slug)};
  var _api = 'https://yumelyrics-comment.vercel.app/api/comment?path=' + encodeURIComponent(_path) + '&pageSize=1&page=1&lang=id';
  var _knownCount = null;
  function _fetchCount() {
    if (document.hidden) return;
    fetch(_api).then(function(r){ return r.json(); }).then(function(d) {
      var cnt = d && typeof d.count === 'number' ? d.count : null;
      if (cnt === null) return;
      if (_knownCount === null) { _knownCount = cnt; return; }
      if (cnt > _knownCount) {
        _knownCount = cnt;
        var existing = document.getElementById('yume-rt-banner');
        if (existing) return;
        var banner = document.createElement('div');
        banner.id = 'yume-rt-banner';
        banner.style.cssText = 'cursor:pointer;padding:8px 16px;background:var(--rose,#e85d7a);color:#fff;border-radius:8px;font-size:.82rem;text-align:center;margin-bottom:12px;transition:opacity .3s;';
        banner.textContent = 'Ada komentar baru! Klik untuk memuat.';
        banner.onclick = function() {
          banner.remove();
          if (window._walineAppInstance) window._walineAppInstance.update();
        };
        var wEl = document.getElementById('waline');
        if (wEl) wEl.parentNode.insertBefore(banner, wEl);
      }
    }).catch(function(){});
  }
  setTimeout(_fetchCount, 5000);
  setInterval(_fetchCount, 30000);
})();
}
function _scheduleHeavy(){
  if(_fbLoaded)return;
  (window.requestIdleCallback||function(cb){setTimeout(cb,1)})(_initHeavy);
}
(function(){
  var fired=false;
  var isMobile=window.matchMedia('(max-width:768px)').matches;
  function go(){if(fired)return;fired=true;_scheduleHeavy();}
  var cmSec=document.querySelector('.cmsec');
  if(cmSec&&'IntersectionObserver' in window){
    new IntersectionObserver(function(entries,o){
      if(entries.some(function(e){return e.isIntersecting;})){
        o.disconnect();
        go();
      }
    },{rootMargin:isMobile?'80px':'300px'}).observe(cmSec);
  }
  setTimeout(go,isMobile?12000:8000);
})();
</script>
<script>
/* fixBg: desktop only — mobile pakai min-height:100dvh dari CSS */
(function(){
  var scheduled=0;
  function fixBg(){
    if(window.innerWidth<768)return;
    var bg=document.getElementById('bgwrap');
    if(!bg)return;
    var vh=(window.visualViewport&&window.visualViewport.height)||window.innerHeight;
    var vw=(window.visualViewport&&window.visualViewport.width)||window.innerWidth;
    bg.style.height=vh+'px';
    bg.style.width=vw+'px';
  }
  function scheduleFixBg(){
    if(scheduled)return;
    scheduled=requestAnimationFrame(function(){
      scheduled=0;
      fixBg();
    });
  }
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',scheduleFixBg,{once:true});
  }else{
    scheduleFixBg();
  }
  window.addEventListener('resize',scheduleFixBg,{passive:true});
  if(window.visualViewport){
    window.visualViewport.addEventListener('resize',scheduleFixBg,{passive:true});
  }
})();
</script>
<script>
/* ── YumeSubs Copy Protection (v5) — lite segera, full ditunda ── */
(function(){
  var WATERMARK='\\n\\n© YumeSubs — yumelyrics.my.id';
  var _verifiedAdmin=false;
  var _bridgeUsed=false;
  var _liteDone=false;
  var _fullDone=false;
  var isMobile=window.matchMedia('(max-width:768px)').matches;

  Object.defineProperty(window,'__yumeAuthBridge',{
    configurable:true,
    get:function(){return undefined;},
    set:function(val){
      if(_bridgeUsed) return;
      _bridgeUsed=true;
      _verifiedAdmin=(val===true);
      try{delete window.__yumeAuthBridge;}catch(ex){}
    }
  });

  function isProtected(){return !_verifiedAdmin;}
  function isInput(el){var t=el&&el.tagName;return t==='INPUT'||t==='TEXTAREA';}

  function _startCopyProtectLite(){
    if(_liteDone) return;
    _liteDone=true;

    document.addEventListener('contextmenu',function(e){
      if(!isProtected()) return;
      e.preventDefault(); e.stopImmediatePropagation();
    },true);

    document.addEventListener('keydown',function(e){
      if(!isProtected()) return;
      var k=e.key?e.key.toLowerCase():'';
      var code=e.code?e.code.toLowerCase():'';
      if(e.ctrlKey||e.metaKey){
        var keyOrCode=k||code;
        if(['a','c','u','s','p','i','j','x','keya','keyc','keyu','keys','keyp','keyi','keyj','keyx'].indexOf(keyOrCode)!==-1){
          if((k==='a'||code==='keya')&&isInput(e.target)) return;
          e.preventDefault(); e.stopImmediatePropagation(); return;
        }
        if(e.shiftKey&&['i','j','c','k','s'].indexOf(k)!==-1){
          e.preventDefault(); e.stopImmediatePropagation(); return;
        }
      }
      if(k==='f12'||k==='printscreen'||k==='contextmenu'){
        e.preventDefault(); e.stopImmediatePropagation(); return;
      }
    },true);

    document.addEventListener('copy',function(e){
      if(!isProtected()) return;
      try{e.clipboardData.setData('text/plain',WATERMARK);}catch(ex){}
      e.preventDefault(); e.stopImmediatePropagation();
    },true);

    document.addEventListener('cut',function(e){
      if(!isProtected()) return;
      try{e.clipboardData.setData('text/plain',WATERMARK);}catch(ex){}
      e.preventDefault(); e.stopImmediatePropagation();
    },true);

    document.addEventListener('selectstart',function(e){
      if(!isProtected()) return;
      if(isInput(e.target)) return;
      e.preventDefault(); e.stopImmediatePropagation();
    },true);

    document.addEventListener('dragstart',function(e){
      if(!isProtected()) return;
      if(isInput(e.target)) return;
      e.preventDefault(); e.stopImmediatePropagation();
    },true);

    try{Object.defineProperty(window,'print',{value:function(){return false;},writable:false,configurable:false});}catch(ex){}

    (function(){
      var STYLE_ID='yume-noselect-v4';
      var STYLE_CSS='html,body,#ll,.ljp,.lro,.lid,.ll-item,.lyric-left,.lyric-right,[data-obf]{-webkit-user-select:none!important;-moz-user-select:none!important;-ms-user-select:none!important;user-select:none!important;-webkit-touch-callout:none!important;}input,textarea,*[contenteditable]{-webkit-user-select:text!important;-moz-user-select:text!important;user-select:text!important;}';
      var s=document.getElementById(STYLE_ID);
      if(!s){s=document.createElement('style');s.id=STYLE_ID;s.textContent=STYLE_CSS;document.head.appendChild(s);}
    })();
  }

  function enforceNoSelect(){
    if(!isProtected()) return;
    var sel=window.getSelection?window.getSelection():null;
    if(sel&&!sel.isCollapsed){
      var node=sel.anchorNode;
      var el=node?(node.nodeType===3?node.parentElement:node):null;
      var inInput=false;
      var cur=el;
      while(cur&&cur!==document.body){if(isInput(cur)){inInput=true;break;}cur=cur.parentElement;}
      if(!inInput) sel.removeAllRanges();
    }
    var targets=[document.body,document.getElementById('ll')].filter(Boolean);
    document.querySelectorAll('.ljp,.lro,.lid,.ll-item,.lyric-left,.lyric-right').forEach(function(el){targets.push(el);});
    targets.forEach(function(el){
      el.style.setProperty('-webkit-user-select','none','important');
      el.style.setProperty('-moz-user-select','none','important');
      el.style.setProperty('-ms-user-select','none','important');
      el.style.setProperty('user-select','none','important');
      el.style.setProperty('-webkit-touch-callout','none','important');
    });
  }

  function _startCopyProtectFull(){
    if(_fullDone) return;
    _fullDone=true;

    document.addEventListener('selectionchange',function(e){
      if(!isProtected()) return;
      if(e&&e.stopImmediatePropagation) e.stopImmediatePropagation();
      var sel=window.getSelection?window.getSelection():null;
      if(!sel||sel.isCollapsed) return;
      var node=sel.anchorNode;
      if(!node){sel.removeAllRanges();return;}
      var el=node.nodeType===3?node.parentElement:node;
      var cur=el;
      while(cur&&cur!==document.body){if(isInput(cur)) return;cur=cur.parentElement;}
      sel.removeAllRanges();
    },true);

    document.addEventListener('touchend',function(e){
      if(!isProtected()) return;
      if(isInput(e.target)) return;
      setTimeout(function(){
        var sel=window.getSelection?window.getSelection():null;
        if(sel) sel.removeAllRanges();
      },0);
    },{passive:true,capture:true});

    enforceNoSelect();
    setInterval(enforceNoSelect,isMobile?8000:5000);

    if(window.MutationObserver){
      var obs=new MutationObserver(function(){if(isProtected()) enforceNoSelect();});
      var ll=document.getElementById('ll');
      if(ll) obs.observe(ll,{attributes:true,attributeFilter:['style','class'],subtree:true,childList:true});
      obs.observe(document.body,{attributes:true,attributeFilter:['style','class']});
      obs.observe(document.documentElement,{attributes:true,attributeFilter:['class']});
    }

    (function(){
      var STYLE_ID='yume-noselect-v4';
      var STYLE_CSS='html,body,#ll,.ljp,.lro,.lid,.ll-item,.lyric-left,.lyric-right,[data-obf]{-webkit-user-select:none!important;-moz-user-select:none!important;-ms-user-select:none!important;user-select:none!important;-webkit-touch-callout:none!important;}input,textarea,*[contenteditable]{-webkit-user-select:text!important;-moz-user-select:text!important;user-select:text!important;}';
      function injectStyle(){
        var existing=document.getElementById(STYLE_ID);
        if(existing){if(existing.textContent!==STYLE_CSS) existing.textContent=STYLE_CSS;return;}
        var s=document.createElement('style');s.id=STYLE_ID;s.textContent=STYLE_CSS;document.head.appendChild(s);
      }
      if(window.MutationObserver){
        var headObs=new MutationObserver(function(muts){
          if(!isProtected()) return;
          var need=false;
          muts.forEach(function(m){
            m.removedNodes.forEach(function(n){if(n.id===STYLE_ID) need=true;});
            if(m.type==='childList') need=true;
          });
          if(need) injectStyle();
        });
        headObs.observe(document.head,{childList:true,subtree:false});
        var styleEl=document.getElementById(STYLE_ID);
        if(styleEl) headObs.observe(styleEl,{characterData:true,childList:true});
      }
    })();
  }

  function _scheduleLite(){
    (window.requestIdleCallback||function(cb){setTimeout(cb,1);})(_startCopyProtectLite);
  }
  function _scheduleFull(){
    var delay=isMobile?2500:1500;
    function run(){(window.requestIdleCallback||function(cb){setTimeout(cb,50);})(_startCopyProtectFull);}
    if(document.readyState==='complete') setTimeout(run,delay);
    else window.addEventListener('load',function(){setTimeout(run,delay);},{once:true});
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',_scheduleLite,{once:true});
  } else {
    _scheduleLite();
  }
  _scheduleFull();
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
${buildDiscordPopupMarkup()}
${buildNotifBar()}
<!-- yume-gen:${dateModified} -->
</body>
</html>`);
}

async function main() {
  const t0 = Date.now();
  // ── Resolve generate mode ──────────────────────────────────────────────────
  // Priority (highest → lowest):
  //   1. GENERATE_MODE env var          — explicit override in workflow YAML
  //   2. --full CLI flag                — local testing
  //   3. GitHub Actions event payload   — workflow_dispatch inputs.mode
  //      (read from GITHUB_EVENT_PATH so the YAML never needs to map inputs manually)
  let _ghEventMode = '';
  try {
    if (process.env.GITHUB_EVENT_PATH) {
      const _evt = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
      _ghEventMode = (_evt?.inputs?.mode || '').trim().toLowerCase();
    }
  } catch (_) { /* non-fatal — event file missing or malformed */ }

  const fullMode = process.env.GENERATE_MODE === 'full'
    || process.argv.includes('--full')
    || _ghEventMode === 'full';
  console.log(fullMode ? '🔥 Mode: FULL (semua lagu)' : '⚡ Mode: INCREMENTAL (baru + diedit saja)');
  console.log('🔥 Menghubungkan ke Firebase...');
  const app = initializeApp(firebaseConfig);
  const db  = getFirestore(app);

  const snap = await getDocs(collection(db,'songs'));
  const songs = snap.docs
    .map(d=>({id:d.id,...d.data()}))
    .sort((a,b)=>(a.order??Infinity)-(b.order??Infinity));
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
  const batchGeneratedAt = new Date().toISOString();
  const urls = [
    `  <url><loc>${BASE_URL}/</loc><lastmod>${today}</lastmod><priority>1.0</priority><changefreq>weekly</changefreq></url>`,
    `  <url><loc>${BASE_URL}/latihan.html</loc><lastmod>${today}</lastmod><priority>0.7</priority><changefreq>monthly</changefreq></url>`,
    `  <url><loc>${BASE_URL}/stories.html</loc><lastmod>${today}</lastmod><priority>0.65</priority><changefreq>weekly</changefreq></url>`,
    `  <url><loc>${BASE_URL}/contact.html</loc><lastmod>${today}</lastmod><priority>0.5</priority><changefreq>monthly</changefreq></url>`,
    `  <url><loc>${BASE_URL}/artis/</loc><lastmod>${today}</lastmod><priority>0.8</priority><changefreq>weekly</changefreq></url>`,
  ];
  const slugMap = {};

  // Pass 1: build slug map (required before any HTML can reference other songs)
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

  // Build lookup maps: artist → songs, anime → songs
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
  const generatedSongs = [];
  const dirtyFlagClears = []; // collected, flushed all at once after the loop

  if (!fullMode) {
    const dirtySongs = songs.filter(isHtmlDirty);
    const dirtyNeedGen = dirtySongs.filter(s => {
      const meta = songMeta.find(m => m.song.id === s.id);
      if (!meta) return false;
      const prev = manifest.songs[s.id];
      const hash = songContentHash(s);
      return !prev || prev.slug !== meta.slug || prev.hash !== hash;
    });
    console.log(`📝 htmlDirty: ${dirtySongs.length} total, ${dirtyNeedGen.length} perlu generate (hash belum sync)`);
    if (dirtySongs.length > dirtyNeedGen.length) {
      console.log(`   ${dirtySongs.length - dirtyNeedGen.length} flag macet — akan di-clear tanpa generate ulang`);
    }
  }

  console.log('🎵 Generate halaman lagu...');

  // ── Pass 2: parallel HTML generation with concurrency cap ──────────────────
  const songErrors = [];
  await pConcurrent(12, songMeta.map(({song, slug: finalSlug}) => async () => {
    try {
    if (!needsSongGenerate(song, finalSlug, manifest, fullMode)) {
      skippedSongCount++;
      // htmlDirty tapi hash sudah sync → clear flag macet (mis. clear Firebase gagal run sebelumnya)
      if (!fullMode && isHtmlDirty(song)) {
        dirtyFlagClears.push(clearHtmlDirtyFlag(db, song.id));
      }
      const skipHash = songContentHash(song);
      const prev = manifest.songs[song.id];
      if (!prev || prev.slug !== finalSlug || prev.hash !== skipHash) {
        manifest.songs[song.id] = { slug: finalSlug, hash: skipHash };
      }
      urls.push(buildSitemapSongUrl(song, finalSlug, today));
      return;
    }

    const artistKey = song.artist ? normalizeArtistKey(song.artist) : '';
    if (artistKey) touchedArtistKeys.add(artistKey);
    const relByArtist = artistKey
      ? (byArtist[artistKey]||[]).filter(r=>r.slug!==finalSlug)
      : [];
    const relByAnime = song.anime
      ? (byAnime[song.anime]||[]).filter(r=>r.slug!==finalSlug)
      : [];

    const songPath = path.join('lagu', `${finalSlug}.html`);
    const wasDirty = isHtmlDirty(song);
    const songKind = fullMode ? 'refresh' : (fs.existsSync(songPath) ? 'edit' : 'upload');

    // generateHTML is now async (minification + async write overlap via await)
    const html = await generateHTML(song, finalSlug, relByArtist, relByAnime, artistKey ? artistSlugByKey[artistKey] : '', batchGeneratedAt);
    await fsWrite(songPath, html, 'utf8'); // non-blocking file write

    manifest.songs[song.id] = { slug: finalSlug, hash: songContentHash(song) };
    if (wasDirty) {
      dirtyFlagClears.push(clearHtmlDirtyFlag(db, song.id));
    }
    generatedSongCount++;
    if (shouldNotifyDiscord(song, songKind)) {
      generatedSongs.push({
        kind: songKind,
        titleRo: song.titleRo || song.titleJp || '',
        artist: song.artist || '',
        slug: finalSlug,
        url: `${BASE_URL}/lagu/${finalSlug}.html`,
        img: song.img || '',
      });
    }
    console.log(`  ✓ lagu/${finalSlug}.html (${fullMode ? 'full' : songKind})`);
    urls.push(buildSitemapSongUrl(song, finalSlug, today));
    } catch(e) {
      // Lagu gagal di-generate — catat error tapi lanjut ke lagu berikutnya
      songErrors.push({ slug: finalSlug, id: song.id, err: e.message || String(e) });
      console.error(`  ✗ GAGAL lagu/${finalSlug}.html: ${e.message || e}`);
    }
  }));

  // Laporan lagu yang gagal (per-task error tidak menghentikan batch)
  if (songErrors.length) {
    console.warn(`\n⚠ ${songErrors.length} lagu GAGAL di-generate:`);
    for (const { slug, id, err } of songErrors) {
      console.warn(`  ✗ ${slug} (id: ${id}): ${err}`);
    }
  }

  // Flush all dirty-flag Firestore updates in one parallel batch
  if (dirtyFlagClears.length) {
    await Promise.all(dirtyFlagClears);
    console.log(`   Cleared ${dirtyFlagClears.length} dirty flag(s) (batched)`);
  }

  const artistIndexList = [];
  console.log(`🎤 Halaman artis (${Object.keys(byArtist).length} total)...`);

  // Generate artist pages with async writes (fan-out, then collect)
  const artistWritePromises = [];
  for(const key of Object.keys(byArtist).sort((a, b) => artistMeta[a].displayName.localeCompare(artistMeta[b].displayName, 'id'))){
    const meta = artistMeta[key];
    const aSlug = meta.slug;
    const artistPath = path.join('artis', `${aSlug}.html`);
    const needArtist = fullMode || touchedArtistKeys.has(key) || !fs.existsSync(artistPath);
    artistIndexList.push({
      name: meta.displayName,
      slug: aSlug,
      count: byArtist[key].length,
      img: byArtist[key][0]?.img || '',
    });
    urls.push(`  <url><loc>${BASE_URL}/artis/${aSlug}.html</loc><lastmod>${artistSitemapLastmod(byArtist[key], aSlug, today)}</lastmod><priority>0.75</priority><changefreq>monthly</changefreq></url>`);
    if (!needArtist) continue;
    artistWritePromises.push(
      generateArtistHTML(meta.displayName, byArtist[key], aSlug)
        .then(html => fsWrite(artistPath, html, 'utf8'))
        .then(() => console.log(`  ✓ artis/${aSlug}.html (${byArtist[key].length} lagu) — ${meta.displayName}`))
    );
  }
  await Promise.all(artistWritePromises);

  const artistIndexHtml = await generateArtistIndexHTML(artistIndexList);
  await fsWrite(path.join('artis', 'index.html'), artistIndexHtml, 'utf8');
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
    const glossUrls = await buildGlossaryPages(songMeta, today);
    urls.push(...glossUrls);
  } else {
    console.log('📖 Glosarium dilewati (tidak ada lagu yang di-generate ulang)');
    if (fs.existsSync('kata')) {
      for (const f of fs.readdirSync('kata').filter(x => x.endsWith('.html'))) {
        const slug = f.replace(/\.html$/, '');
        const loc = slug === 'index' ? `${BASE_URL}/kata/` : `${BASE_URL}/kata/${slug}.html`;
        const lastmod = sitemapLastmodFromPath(path.join('kata', f), today);
        urls.push(`  <url><loc>${loc}</loc><lastmod>${lastmod}</lastmod><priority>0.55</priority></url>`);
      }
    }
  }

  saveManifest(manifest);

  if (generatedSongs.length > 0) {
    await sendDiscordNotification(generatedSongs, true);
    console.log(`   Notif Discord: ${generatedSongs.length} lagu baru`);
  } else {
    console.log('   Notif Discord dilewati — tidak ada lagu baru.');
  }

  // Async sitemap write (no need to block before process.exit)
  await fsWrite('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"\n        xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">\n${urls.join('\n')}\n</urlset>`, 'utf8');
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n✅ Selesai! ${generatedSongCount} lagu di-upload, ${skippedSongCount} dilewati (sudah mutakhir) — ${elapsed}s`);
  if (fullMode) {
    console.log(`   Mode FULL: ${songs.length} lagu diproses, ${songErrors.length} gagal`);
  }
  console.log(`   Total katalog: ${songs.length} lagu · ${Object.keys(byArtist).length} artis · sitemap.xml`);
  process.exit(0);
}

main().catch(async e => {
  console.error(e);
  await sendDiscordNotification([], false);
  process.exit(1);
});
