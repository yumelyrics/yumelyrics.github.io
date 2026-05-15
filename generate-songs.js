// generate-songs.js
// Jalankan via GitHub Actions — ambil data Firebase, generate HTML per lagu + sitemap.xml

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, orderBy } from 'firebase/firestore';
import fs from 'fs';
import path from 'path';

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: "yumesubs7.firebaseapp.com",
  projectId: "yumesubs7",
  storageBucket: "yumesubs7.firebasestorage.app",
  messagingSenderId: "1076202015626",
  appId: "1:1076202015626:web:ce89fb668eb6b2bd021673"
};

const BASE_URL = 'https://yumelyrics.my.id';

function toSlug(titleRo, titleJp, docId) {
  if (titleRo) {
    return titleRo.toLowerCase().replace(/[^a-z0-9\s-]/g,'').trim().replace(/\s+/g,'-').replace(/-+/g,'-').substring(0,60);
  }
  return docId;
}

function escHtml(str) {
  return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

const NOISE_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
function randNoise() {
  return NOISE_CHARS[Math.floor(Math.random() * NOISE_CHARS.length)];
}
function obfuscateLine(str) {
  if (!str) return '';
  const chars = [...str];
  const indices = chars.map((_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices.map(origIdx => {
    const ch = chars[origIdx];
    const isSpace = ch === ' ';
    const noiseCount = Math.floor(Math.random() * 2) + 1;
    const noiseSpans = isSpace ? '' : Array.from({length: noiseCount}, () =>
      '<span aria-hidden="true" style="position:absolute;opacity:0;pointer-events:none;user-select:none;-webkit-user-select:none">' + randNoise() + '</span>'
    ).join('');
    const spaceAttr = isSpace ? ' data-sp="1"' : '';
    return '<span data-c="' + origIdx + '"' + spaceAttr + '>' + (isSpace ? ' ' : escHtml(ch)) + '</span>' + noiseSpans;
  }).join('');
}

function generateHTML(song, slug) {
  const titleDisplay = song.titleJp || '';
  const titleRo      = song.titleRo || '';
  const titleId      = song.titleId || '';
  const artist       = song.artist  || '';
  const anime        = song.anime   || '';
  const animeEn      = song.animeEn || '';
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
    const animeCtx   = anime ? ` dari anime ${anime}` : '';
    const typeCtx    = songType ? ` (${songType})` : '';
    const titleIdCtx = titleId ? ` Artinya: "${titleId}".` : '';
    metaDesc = `Lirik ${titleMain}${animeCtx}${typeCtx} - ${artist} lengkap: teks Jepang, romaji, dan terjemahan bahasa Indonesia.${titleIdCtx} ${firstLines ? firstLines + '.' : ''} Baca arti dan makna lagu di YumeSubs.`.substring(0, 160);
  }


  const lyricsHTML = lyrics.map(l =>
    '<div class="ll-item">' +
    '<div class="ljp" data-obf="1">' + obfuscateLine(l.jp||'') + '</div>' +
    (l.ro ? '<div class="lro" data-obf="1">' + obfuscateLine(l.ro) + '</div>' : '') +
    (l.id ? '<div class="lid" data-obf="1">' + obfuscateLine(l.id) + '</div>' : '') +
    '</div><div class="lsep"></div>'
  ).join('');



  const schema = JSON.stringify([
    {
      "@context":"https://schema.org","@type":"MusicComposition",
      "name": titleMain,
      "alternateName": [titleDisplay, titleRo, titleId, anime, animeEn].filter(Boolean),
      "composer":{"@type":"MusicGroup","name":artist},
      "inLanguage":"ja",
      "description":metaDesc,
      "url":`${BASE_URL}/lagu/${slug}`,
      ...(songType ? {"musicCompositionForm": songType} : {}),
      ...(anime ? {"isPartOf": {"@type":"TVSeries","name":anime}} : {}),
      ...(song.img ? {"image": song.img} : {}),
      ...(song.sp ? {"sameAs": song.sp} : {})
    },
    {
      "@context":"https://schema.org","@type":"WebPage",
      "name":`Lirik ${titleMain} - ${artist} + Terjemahan Indonesia`,
      "description":metaDesc,
      "url":`${BASE_URL}/lagu/${slug}`,
      "inLanguage":"id",
      "isPartOf":{"@type":"WebSite","name":"YumeSubs","url":BASE_URL},
      "breadcrumb":{
        "@type":"BreadcrumbList",
        "itemListElement":[
          {"@type":"ListItem","position":1,"name":"Katalog","item":`${BASE_URL}/index.html`},
          {"@type":"ListItem","position":2,"name":`${titleMain} - ${artist}`,"item":`${BASE_URL}/lagu/${slug}`}
        ]
      }
    }
  ]);

  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1">
<meta name="googlebot" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1">
<meta name="apple-itunes-app" content="app-id=0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="author" content="YumeSubs">
<meta name="publisher" content="YumeSubs">
<meta name="theme-color" content="#06030f">
<meta name="msapplication-TileColor" content="#06030f">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="readable" content="false">
<meta name="accessibility" content="false">
<meta name="application-name" content="YumeSubs">
<meta http-equiv="Pragma" content="no-cache">
<style>/* reader-mode-poison */article.rm-poison p{font-size:1rem;line-height:1.6}</style>
<meta name="language" content="Indonesian">
<meta name="revisit-after" content="7 days">
<meta name="rating" content="general">
<meta name="category" content="music, lyrics, japanese song, anime">
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
  // ── JUDUL LAGU – semua variasi ──
  `lirik ${escHtml(titleMain)}`,
  titleDisplay !== titleMain ? `lirik ${escHtml(titleDisplay)}` : '',
  `lirik lagu ${escHtml(titleMain)}`,
  `lirik lengkap ${escHtml(titleMain)}`,
  `lirik ${escHtml(titleMain)} lengkap`,
  `lirik ${escHtml(titleMain)} full`,
  `lirik ${escHtml(titleMain)} lengkap beserta artinya`,
  `lrik ${escHtml(titleMain)}`,
  `lyric ${escHtml(titleMain)}`,
  `lyrics ${escHtml(titleMain)}`,
  `${escHtml(titleMain)} lirik`,
  `${escHtml(titleMain)} lyrics`,
  `${escHtml(titleMain)} full lirik`,
  `${escHtml(titleMain)} full lyrics`,
  titleDisplay ? `${escHtml(titleDisplay)}` : '',
  titleDisplay ? `${escHtml(titleDisplay)} lirik` : '',
  titleDisplay ? `${escHtml(titleDisplay)} lyrics` : '',

  // ── TERJEMAHAN & ARTI ──
  `terjemahan ${escHtml(titleMain)}`,
  `terjemahan lagu ${escHtml(titleMain)}`,
  `terjemahan ${escHtml(titleMain)} bahasa indonesia`,
  `terjemahan ${escHtml(titleMain)} indo`,
  `terjemah ${escHtml(titleMain)}`,
  titleDisplay ? `terjemahan ${escHtml(titleDisplay)}` : '',
  `arti ${escHtml(titleMain)}`,
  `arti lagu ${escHtml(titleMain)}`,
  `arti lirik ${escHtml(titleMain)}`,
  `arti kata ${escHtml(titleMain)}`,
  `apa arti lagu ${escHtml(titleMain)}`,
  `makna lagu ${escHtml(titleMain)}`,
  `makna lirik ${escHtml(titleMain)}`,
  `makna ${escHtml(titleMain)}`,
  `maksud lagu ${escHtml(titleMain)}`,
  titleId ? `${escHtml(titleId)}` : '',
  titleId ? `arti ${escHtml(titleId)}` : '',
  titleId ? `lirik ${escHtml(titleId)}` : '',
  titleId ? `terjemahan ${escHtml(titleId)}` : '',

  // ── ROMAJI ──
  `${escHtml(titleMain)} romaji`,
  `${escHtml(titleMain)} romaji dan terjemahan`,
  `${escHtml(titleMain)} romaji indonesia`,
  `lirik ${escHtml(titleMain)} romaji`,
  `lirik ${escHtml(titleMain)} romaji dan artinya`,
  titleDisplay ? `${escHtml(titleDisplay)} romaji` : '',

  // ── BAHASA & REGION ──
  `${escHtml(titleMain)} bahasa indonesia`,
  `${escHtml(titleMain)} indonesia`,
  `${escHtml(titleMain)} sub indo`,
  `${escHtml(titleMain)} indo sub`,
  `${escHtml(titleMain)} indo`,
  `${escHtml(titleMain)} terjemahan indonesia`,
  `${escHtml(titleMain)} terjemahan`,
  `lirik ${escHtml(titleMain)} bahasa indonesia`,
  `${escHtml(titleMain)} translation`,
  `${escHtml(titleMain)} indonesian translation`,
  `${escHtml(titleMain)} english translation`,
  `${escHtml(titleMain)} translate`,

  // ── ARTIS – semua variasi ──
  `${escHtml(artist)}`,
  `${escHtml(artist)} lirik`,
  `${escHtml(artist)} lyrics`,
  `${escHtml(artist)} terjemahan`,
  `${escHtml(artist)} lagu`,
  `${escHtml(artist)} lagu terjemahan`,
  `${escHtml(artist)} lyrics indonesia`,
  `${escHtml(artist)} lyrics translation`,
  `${escHtml(artist)} lyrics romaji`,
  `${escHtml(artist)} romaji`,
  `${escHtml(artist)} bahasa indonesia`,
  `${escHtml(artist)} sub indo`,
  `${escHtml(artist)} indo sub`,
  `${escHtml(artist)} terjemahan indonesia`,
  `lagu ${escHtml(artist)}`,
  `lagu ${escHtml(artist)} terjemahan indonesia`,
  `lagu ${escHtml(artist)} lirik`,
  `${escHtml(artist)} ${escHtml(titleMain)}`,
  titleDisplay ? `${escHtml(artist)} ${escHtml(titleDisplay)}` : '',
  `lirik ${escHtml(artist)}`,
  `lirik lagu ${escHtml(artist)}`,
  `${escHtml(artist)} discography`,
  `${escHtml(artist)} lagu lagu`,

  // ── ANIME / SERIES (kalau ada) ──
  anime ? `${escHtml(anime)}` : '',
  anime ? `lirik ${escHtml(anime)}` : '',
  anime ? `ost ${escHtml(anime)}` : '',
  anime ? `lagu ${escHtml(anime)}` : '',
  anime ? `opening ${escHtml(anime)}` : '',
  anime ? `ending ${escHtml(anime)}` : '',
  anime ? `insert song ${escHtml(anime)}` : '',
  anime ? `lagu opening ${escHtml(anime)}` : '',
  anime ? `lagu ending ${escHtml(anime)}` : '',
  anime ? `ost ${escHtml(anime)} lirik` : '',
  anime ? `lirik ost ${escHtml(anime)}` : '',
  anime ? `terjemahan lagu ${escHtml(anime)}` : '',
  anime ? `lirik ${escHtml(anime)} terjemahan indonesia` : '',
  anime ? `${escHtml(anime)} opening lirik` : '',
  anime ? `${escHtml(anime)} ending lirik` : '',
  anime ? `${escHtml(anime)} song` : '',
  anime ? `${escHtml(anime)} soundtrack` : '',
  anime ? `lagu anime ${escHtml(anime)}` : '',
  anime && titleMain ? `${escHtml(anime)} ${escHtml(titleMain)}` : '',
  anime && artist ? `${escHtml(anime)} ${escHtml(artist)}` : '',
  animeEn ? `${escHtml(animeEn)} opening` : '',
  animeEn ? `${escHtml(animeEn)} ost` : '',
  animeEn ? `${escHtml(animeEn)} lyrics` : '',
  animeEn ? `lirik ost ${escHtml(animeEn)}` : '',
  songType && anime ? `${songType} ${escHtml(anime)}` : '',
  songType && anime ? `${escHtml(anime)} ${songType} lirik` : '',
  songType && anime ? `lirik ${songType} ${escHtml(anime)}` : '',
  songType && anime ? `terjemahan ${songType} ${escHtml(anime)}` : '',

  // ── KATEGORI UMUM – lagu jepang ──
  'lirik lagu jepang',
  'lirik lagu jepang terjemahan indonesia',
  'lirik lagu jepang lengkap',
  'lirik lagu jepang dan artinya',
  'lirik lagu jepang romaji',
  'lagu jepang terjemahan',
  'lagu jepang sub indo',
  'lagu jepang bahasa indonesia',
  'lagu jepang romaji',
  'terjemahan lagu jepang',
  'terjemahan lagu jepang ke indonesia',
  'arti lagu jepang',
  'makna lagu jepang',
  'lagu jepang terjemahan indonesia lengkap',

  // ── KATEGORI UMUM – anime ──
  'anime song lyrics',
  'anime song translation',
  'anime lyrics indonesia',
  'anime ost lirik',
  'anime ost terjemahan',
  'ost anime indonesia',
  'lirik anime terjemahan',
  'lagu anime bahasa indonesia',
  'lirik opening anime',
  'lirik ending anime',
  'lirik insert song anime',
  'opening anime lirik terjemahan',
  'ending anime lirik terjemahan',
  'lirik lagu anime terjemahan indonesia',
  'lagu anime terjemahan indonesia',
  'anime opening lyrics romaji',
  'anime ending lyrics romaji',
  'lirik ost anime terjemahan',

  // ── KATEGORI UMUM – english/international ──
  'japanese song lyrics',
  'japanese song translation',
  'japanese lyrics indonesian',
  'japanese lyrics romaji',
  'japanese anime song lyrics',
  'japanese music lyrics translation',
  'japanese lyrics with translation',
  'japanese song meaning',
  'japanese lyrics romaji indonesian',

  // ── GENRE ──
  'j-pop lirik indonesia',
  'j-pop terjemahan',
  'j-pop terjemahan indonesia',
  'j-rock lirik indonesia',
  'j-rock terjemahan',
  'j-pop lyrics romaji',
  'j-rock lyrics translation',
  'vocaloid lirik indonesia',
  'vocaloid terjemahan',
  'vocaloid terjemahan indonesia',
  'lagu vocaloid terjemahan',

  // ── BRAND ──
  'YumeSubs',
  'yumelyrics',
  'yumesubs lirik',
  'yume subs',
  'yume lyrics',
  'yumelyrics github',
  'yumesubs terjemahan',

  // ── DARI DESKRIPSI KUSTOM (descId & descJp) ──
  ...(() => {
    const stopwords = new Set(['yang','dari','dan','atau','ini','itu','di','ke','adalah','sebagai','dalam','untuk','dengan','pada','telah','juga','oleh','akan','sudah','bisa','ada','tidak','lebih','satu','lagu','lirik','terjemahan','bahasa','indonesia','jepang','romaji','no','of','the','a','an','in','is','to','and','or','for','this','that','it','wa','ga','wo','ni','de','mo','ha','ya','ka','na','o','e','ne','yo','sa','su','shi','ta','te','to','ku','ru','ri','re','ra','mu','mi','me','ma']);
    const extract = str => {
      if(!str) return [];
      return str.toLowerCase()
        .replace(/[.,!?;:「」『』【】（）()"'""'']/g,' ')
        .split(/\s+/)
        .filter(w => w.length >= 3 && !stopwords.has(w));
    };
    const idWords = extract(descId);
    const jpWords = extract(descJp);
    const unique = [...new Set([...idWords, ...jpWords])];

    // konteks untuk kombinasi
    const ctx = [titleMain, artist, anime, animeEn, titleId].filter(Boolean);

    const combined = [];
    unique.forEach(w => {
      ctx.forEach(c => {
        const cl = c.toLowerCase();
        // kombinasi: kata_desc + judul/artis/anime dan sebaliknya
        combined.push(`${w} ${cl}`);
        combined.push(`${cl} ${w}`);
        combined.push(`lirik ${w} ${cl}`);
        combined.push(`${w} lagu ${cl}`);
      });
    });

    return [...unique, ...combined.slice(0, 80)]; // kata mentah semua + maks 80 kombinasi
  })(),
].filter(Boolean).join(', ')}">
<meta property="og:title" content="Lirik ${escHtml(titleMain)} - ${escHtml(artist)} | YumeSubs">
<meta property="og:description" content="${escHtml(metaDesc)}">
<meta property="og:url" content="${BASE_URL}/lagu/${slug}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="YumeSubs">
<meta property="og:locale" content="id_ID">
${song.img?`<meta property="og:image" content="${escHtml(song.img)}">
<meta property="og:image:alt" content="Cover ${escHtml(titleMain)} - ${escHtml(artist)}">
<meta property="og:image:width" content="600">
<meta property="og:image:height" content="600">` : `<meta property="og:image" content="${BASE_URL}/anime_icon.png">
<meta property="og:image:width" content="512">
<meta property="og:image:height" content="512">`}
<meta property="article:author" content="YumeSubs">
<meta property="article:publisher" content="${BASE_URL}">
<meta property="article:section" content="Lirik Lagu Jepang">
<meta property="article:tag" content="${escHtml(artist)}">
<meta property="article:tag" content="${escHtml(titleMain)}">
${anime ? `<meta property="article:tag" content="${escHtml(anime)}">` : ''}
${animeEn ? `<meta property="article:tag" content="${escHtml(animeEn)}">` : ''}
${songType ? `<meta property="article:tag" content="${escHtml(songType)}">` : ''}
<meta property="article:tag" content="lirik jepang">
<meta property="article:tag" content="terjemahan indonesia">
<meta property="article:tag" content="romaji">
<meta property="article:tag" content="anime">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:site" content="@YumeSubs">
<meta name="twitter:creator" content="@YumeSubs">
<meta name="twitter:title" content="Lirik ${escHtml(titleMain)} - ${escHtml(artist)} | YumeSubs">
<meta name="twitter:description" content="${escHtml(metaDesc)}">
<meta name="twitter:label1" content="Artis">
<meta name="twitter:data1" content="${escHtml(artist)}">
<meta name="twitter:label2" content="Bahasa">
<meta name="twitter:data2" content="Jepang + Terjemahan Indonesia">
${song.img?`<meta name="twitter:image" content="${escHtml(song.img)}">` : `<meta name="twitter:image" content="${BASE_URL}/anime_icon.png">`}
<link rel="canonical" href="${BASE_URL}/lagu/${slug}">
<link rel="alternate" hreflang="id" href="${BASE_URL}/lagu/${slug}">
<link rel="alternate" hreflang="x-default" href="${BASE_URL}/lagu/${slug}">
<link rel="icon" type="image/jpeg" href="../anime_icon.png">
<script type="application/ld+json">${schema}</script>
<link href="https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@400;600;800&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;1,9..40,300&display=swap" rel="stylesheet">
<style>
:root{--bg:#06030f;--border:rgba(255,255,255,0.08);--accent:#ff6eb4;--accent2:#00e5ff;--accent3:#bf5fff;--text:#f0eaff;--muted:#7a6a9a;--jp:'Shippori Mincho',serif;--en:'DM Sans',sans-serif;--red:#ff4d6d;--glow-pink:rgba(255,110,180,.18);--glow-cyan:rgba(0,229,255,.15)}
/* ── Anti Reader Mode ── */
/* rm-poison: JANGAN display:none — biarkan Readability.js menemukannya.
   Sembunyikan dari view normal via JS setelah load. */
.rm-poison{font-size:1px;line-height:1px;color:transparent;background:transparent;border:none;padding:0;margin:0;max-height:1px;overflow:hidden}
/* Fake article container to confuse reader mode parser */
.rm-decoy{font-size:1px;color:transparent;overflow:hidden;max-height:1px}
*{margin:0;padding:0;box-sizing:border-box;-webkit-user-select:none;-moz-user-select:none;-ms-user-select:none;user-select:none}
html,body{margin:0;padding:0}html{scroll-behavior:smooth;background:#06030f}
body{color:var(--text);font-family:var(--en);min-height:100dvh;overflow-x:hidden;position:relative;-webkit-touch-callout:none}
input,textarea,*[contenteditable]{-webkit-user-select:text;-moz-user-select:text;user-select:text}
.wrap{position:relative;z-index:2}
nav{position:sticky;top:0;z-index:100;display:flex;align-items:center;justify-content:space-between;padding:0 2.5rem;height:60px;background:rgba(6,3,15,.85);backdrop-filter:blur(24px);border-bottom:1px solid rgba(255,110,180,.12);min-width:0;box-shadow:0 1px 24px rgba(255,110,180,.06)}
.nav-logo{display:flex;align-items:center;gap:.5rem;cursor:pointer;flex-shrink:0;min-width:0;text-decoration:none}
.nljp{font-family:var(--jp);font-size:1.2rem;font-weight:800;color:var(--accent);white-space:nowrap;line-height:1;text-shadow:0 0 12px rgba(255,110,180,.5)}
.nlen{font-size:.6rem;color:var(--muted);letter-spacing:.2em;text-transform:uppercase;white-space:nowrap;line-height:1}
.nav-links{display:flex;gap:.25rem;align-items:center;flex-shrink:0}
.nb{background:none;border:none;font-family:var(--en);font-size:.7rem;color:var(--muted);letter-spacing:.12em;text-transform:uppercase;padding:.45rem .9rem;cursor:pointer;border-radius:2rem;transition:all .2s;text-decoration:none;display:inline-flex;align-items:center;white-space:nowrap}
.nb:hover{color:var(--text);background:rgba(255,110,180,.08);text-shadow:0 0 8px rgba(255,110,180,.4)}
#lyrView{padding:0 2.5rem 5rem}
.lvback{display:flex;align-items:center;gap:1rem;padding:1.5rem 0 2rem;border-bottom:1px solid var(--border);margin-bottom:2rem}
.gbtn{background:none;border:1px solid rgba(255,110,180,.25);font-family:var(--en);font-size:.68rem;letter-spacing:.15em;text-transform:uppercase;color:var(--muted);padding:.45rem 1rem;cursor:pointer;transition:all .2s;text-decoration:none;border-radius:2rem}
.gbtn:hover{border-color:var(--accent);color:var(--accent);box-shadow:0 0 10px rgba(255,110,180,.15)}
.lvt{font-family:var(--jp);font-size:1.25rem;font-weight:600;color:var(--text)}
.lva{font-size:.65rem;color:var(--accent);letter-spacing:.15em;text-transform:uppercase;margin-top:.2rem}
.lvgrid{display:grid;grid-template-columns:260px 1fr;gap:3rem;align-items:start}
.lvcov{width:100%;aspect-ratio:1;object-fit:cover;border:1px solid rgba(255,110,180,.2);filter:saturate(.75);margin-bottom:1.2rem;display:block;box-shadow:0 4px 24px rgba(255,110,180,.1);border-radius:2px}
.lvmeta{font-size:.75rem;color:var(--muted);line-height:1.9}
.lvmeta b{color:var(--text);font-weight:400}
.ytlb{font-size:.6rem;color:var(--muted);letter-spacing:.2em;text-transform:uppercase;margin-bottom:.7rem}
.ytwrap{margin-top:1.2rem}
.ytframe{width:100%;aspect-ratio:16/9;border:1px solid rgba(255,110,180,.15);background:#000;display:block;border-radius:2px}
.lctrl{display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:2rem}
.tpill{background:none;border:1px solid var(--border);font-family:var(--en);font-size:.65rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);padding:.4rem .85rem;cursor:pointer;border-radius:2rem;transition:all .2s}
.tpill.on{background:rgba(0,229,255,.12);border-color:rgba(0,229,255,.4);color:var(--accent2);box-shadow:0 0 10px rgba(0,229,255,.1)}
.llines{display:flex;flex-direction:column;gap:2rem;margin-bottom:3rem;position:relative}
#ll{position:relative}
#ll::after{content:'';position:absolute;inset:0;z-index:10;pointer-events:all;-webkit-user-select:none;user-select:none;background:transparent}
#lyrView{position:relative}
#lyrView::before{content:'';position:fixed;inset:0;z-index:0;pointer-events:none}
.ll-item{}
.ljp{font-family:var(--jp);font-size:1.2rem;font-weight:600;color:var(--text);line-height:1.55;margin-bottom:.25rem;overflow:hidden}
.lro{font-size:.82rem;color:var(--muted);font-style:italic;font-weight:300;line-height:1.6;transition:opacity .25s,max-height .3s;overflow:hidden;max-height:5rem}
.lid{font-size:.88rem;color:var(--accent);font-weight:300;line-height:1.6;transition:opacity .25s,max-height .3s;overflow:hidden;max-height:5rem}
/* Obfuscated line containers - karakter tampil urut via CSS order di flex container */
[data-obf="1"]{display:inline-flex!important;flex-wrap:wrap!important;gap:0!important;width:100%}
[data-obf="1"] span[data-c]{white-space:pre}
.lro.h,.lid.h{opacity:0;max-height:0}
.lsep{height:1px;background:linear-gradient(90deg,rgba(255,110,180,.2),transparent);opacity:.6;margin:.5rem 0}
.cmsec{margin-top:2rem;padding-top:2rem;border-top:1px solid var(--border);max-width:600px}
.cmtit{font-size:.62rem;color:var(--muted);letter-spacing:.22em;text-transform:uppercase;margin-bottom:1.5rem}
.cmform{display:flex;flex-direction:column;gap:.6rem;margin-bottom:2rem}
.cmi{background:rgba(255,255,255,.03);border:1px solid rgba(255,110,180,.15);color:var(--text);font-family:var(--en);font-size:.82rem;padding:.7rem 1rem;outline:none;resize:none;transition:border-color .2s;border-radius:2px}
.cmi::placeholder{color:var(--muted)}
.cmi:focus{border-color:rgba(255,110,180,.4);box-shadow:0 0 12px rgba(255,110,180,.08)}
.cmrow{display:flex;gap:.6rem}
.cmrow .cmi{flex:1}
.sbtn{background:linear-gradient(135deg,rgba(255,110,180,.8),rgba(191,95,255,.8));border:none;font-family:var(--en);font-size:.68rem;letter-spacing:.12em;text-transform:uppercase;color:#fff;padding:0 1.2rem;cursor:pointer;transition:opacity .2s;border-radius:2px}
.sbtn:hover{opacity:.85}
.sbtn:disabled{opacity:.4;cursor:not-allowed}
.cmlist{display:flex;flex-direction:column;gap:1rem}
.citem{background:rgba(255,255,255,.02);border:1px solid rgba(255,110,180,.08);padding:1rem 1.2rem;border-radius:2px}
.citem.is-admin{background:rgba(255,110,180,.04);border-color:rgba(255,110,180,.2)}
.chdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:.4rem;gap:.5rem;flex-wrap:wrap}
.chdr-left{display:flex;align-items:center;gap:.5rem;flex-wrap:wrap}
.cname{font-size:.72rem;color:var(--accent);font-weight:500}
.cdate{font-size:.6rem;color:var(--muted)}
.ctxt{font-size:.82rem;color:var(--text);line-height:1.65;font-weight:300}
.nocm{font-size:.78rem;color:var(--muted);font-style:italic}
.admin-badge{font-size:.55rem;letter-spacing:.12em;text-transform:uppercase;color:#fff;background:linear-gradient(135deg,var(--accent),var(--accent3));padding:.15rem .45rem;font-weight:600;border-radius:2rem}
.reply-btn{background:none;border:none;font-family:var(--en);font-size:.6rem;color:var(--muted);letter-spacing:.12em;text-transform:uppercase;cursor:pointer;padding:.2rem .5rem;transition:color .2s}
.reply-btn:hover{color:var(--accent2)}
.replies{margin-top:.8rem;padding-top:.8rem;border-top:1px solid var(--border);display:flex;flex-direction:column;gap:.7rem}
.ritem{padding:.7rem 1rem;border-left:2px solid var(--border)}
.ritem.is-admin{border-left-color:var(--accent);background:rgba(255,110,180,.03)}
.admin-reply-block{display:flex;align-items:flex-start;gap:.6rem;border:1px solid rgba(255,110,180,.2);padding:.6rem .85rem;margin-top:.4rem;border-radius:2px;position:relative;overflow:hidden;isolation:isolate}
.admin-reply-block::before{content:'';position:absolute;inset:0;background:url('https://media1.giphy.com/media/v1.Y2lkPTc5MGI3NjExZHVmOGEyb2EydmhzNWxhcTA4NmlxN3JsZjIxeXV2a3MwZDZuNXFjayZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/yarJ7WfdKiAkE/giphy.gif') center/cover no-repeat;opacity:.18;z-index:-1;pointer-events:none}
.admin-reply-block::after{content:'';position:absolute;inset:0;background:rgba(6,3,15,.55);z-index:-1;pointer-events:none}
.admin-badge-wrap{display:flex;flex-direction:column;align-items:center;gap:.3rem;flex-shrink:0}
.admin-badge-wrap .admin-badge{font-size:.54rem;color:#fff;background:linear-gradient(135deg,var(--accent),var(--accent3));padding:.15rem .5rem;border-radius:2rem;letter-spacing:.1em;text-transform:uppercase;font-weight:700;white-space:nowrap}
.admin-name{font-size:.6rem;color:var(--accent);white-space:nowrap}
.admin-reply-text{font-size:.78rem;color:var(--text);line-height:1.65;flex:1}
.reply-form{margin-top:.8rem;padding-top:.8rem;border-top:1px solid var(--border);display:none;flex-direction:column;gap:.5rem}
.reply-form.open{display:flex}
.reply-form .cmi{font-size:.78rem}
.reply-row{display:flex;gap:.5rem}
.reply-row .cmi{flex:1}
.rbtn-cancel{background:none;border:1px solid var(--border);font-family:var(--en);font-size:.62rem;color:var(--muted);padding:.4rem .8rem;cursor:pointer;letter-spacing:.1em;text-transform:uppercase;transition:all .2s;border-radius:2px}
.rbtn-cancel:hover{border-color:var(--red);color:var(--red)}
.spbtn{display:inline-flex;align-items:center;gap:.5rem;background:#1DB954;border:none;font-family:var(--en);font-size:.65rem;letter-spacing:.12em;text-transform:uppercase;color:#000;padding:.5rem 1.1rem;cursor:pointer;text-decoration:none;font-weight:600;transition:opacity .2s;margin-top:.8rem;border-radius:2rem}
.spbtn:hover{opacity:.85}
.spbtn svg{width:14px;height:14px;fill:#000;flex-shrink:0}
.nicobtn{display:inline-flex;align-items:center;gap:.5rem;background:#252525;border:1px solid rgba(255,255,255,.12);font-family:var(--en);font-size:.65rem;letter-spacing:.12em;text-transform:uppercase;color:#fff;padding:.5rem 1.1rem;cursor:pointer;text-decoration:none;font-weight:600;transition:all .2s;margin-top:.8rem;border-radius:2rem}
.nicobtn:hover{background:#333;border-color:rgba(255,255,255,.25)}
.nicothumb{width:100%;aspect-ratio:16/9;object-fit:cover;border:1px solid var(--border);display:block;margin-top:1.2rem;filter:saturate(.7) brightness(.8)}
.toast{position:fixed;bottom:2rem;right:2rem;background:linear-gradient(135deg,var(--accent),var(--accent3));color:#fff;font-size:.72rem;letter-spacing:.12em;text-transform:uppercase;padding:.7rem 1.4rem;z-index:999;opacity:0;transform:translateY(8px);transition:all .3s;pointer-events:none;border-radius:4px;box-shadow:0 4px 20px rgba(255,110,180,.3)}
.toast.on{opacity:1;transform:translateY(0)}
::-webkit-scrollbar{width:3px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:rgba(255,110,180,.2);border-radius:4px}
@media(max-width:760px){.lvgrid{grid-template-columns:1fr}}
@media(max-width:600px){nav{padding:0 1rem;gap:.5rem}.nljp{font-size:1.05rem}.nb{padding:.4rem .6rem;font-size:.62rem;letter-spacing:.08em}#lyrView{padding-left:1.2rem;padding-right:1.2rem}}
@media(max-width:380px){nav{padding:0 .75rem}.nlen{display:none}.nb{padding:.35rem .5rem;font-size:.58rem}}
</style>
</head>
<body>
<div id="bgwrap"></div>
<style>
#bgwrap{position:fixed;top:0;left:0;width:100%;height:100%;z-index:0;pointer-events:none;background:radial-gradient(ellipse at 20% 50%,rgba(191,95,255,.08) 0%,transparent 60%),radial-gradient(ellipse at 80% 20%,rgba(255,110,180,.07) 0%,transparent 55%),radial-gradient(ellipse at 60% 80%,rgba(0,229,255,.05) 0%,transparent 50%),#06030f}
@media(min-width:768px){
  #bgwrap{background:url('https://images7.alphacoders.com/131/thumb-1920-1316304.jpeg') center/cover no-repeat;filter:brightness(.15) saturate(.5) hue-rotate(200deg)}
}
</style>
<div class="wrap">
<nav>
  <a class="nav-logo" href="../index.html">
    <div class="nljp">夢字幕</div>
    <div class="nlen">YumeSubs</div>
  </a>
  <div class="nav-links">
    <a class="nb" href="../index.html">Katalog</a>
    <a class="nb" href="../stories.html">Cerita</a>
    <a class="nb" href="../contact.html">Hubungi</a>
  </div>
</nav>

<div id="lyrView">
  <div class="lvback">
    <a class="gbtn" href="../index.html">← Katalog</a>
    <div>
      <div class="lvt">${escHtml(titleDisplay)}</div>
      <div class="lva">${escHtml(artist)}</div>
    </div>
  </div>
  <div class="lvgrid">
    <div>
      ${song.img ? `<img class="lvcov" src="${escHtml(song.img)}" alt="Cover lagu ${escHtml(titleMain)} - ${escHtml(artist)} | Lirik dan terjemahan Indonesia di YumeSubs" loading="eager">` : ''}
      <div class="lvmeta">
        <b>${escHtml(titleDisplay)}</b>
        ${titleRo ? `<div>${escHtml(titleRo)}</div>` : ''}
        ${titleId ? `<div>${escHtml(titleId)}</div>` : ''}
        <div style="color:var(--accent);font-size:.7rem;letter-spacing:.1em;text-transform:uppercase;margin-top:.3rem">${escHtml(artist)}</div>
      </div>
      ${song.ytId ? `<div class="ytwrap"><div class="ytlb">Video</div><iframe class="ytframe" src="https://www.youtube.com/embed/${escHtml(song.ytId)}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>` : ''}
      ${song.nicoId ? `<div class="ytwrap"><div class="ytlb">Niconico<\/div><img class="nicothumb" src="https:\/\/nicovideo.cdn.nimg.jp\/thumbnails\/${escHtml(song.nicoId.replace("sm",""))}\/1" alt="thumbnail" loading="lazy" onerror="this.style.display='none'"><a class="nicobtn" href="https:\/\/www.nicovideo.jp\/watch\/${escHtml(song.nicoId)}" target="_blank" rel="noopener"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"\/><\/svg>Tonton di Niconico<\/a><\/div>` : ''}
      ${song.sp ? `<a class="spbtn" href="${escHtml(song.sp)}" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>Dengarkan di Spotify</a>` : ''}
    </div>
    <div>
      <div class="lctrl">
        <button class="tpill on" id="tp-ro" onclick="tl('ro')">Romaji</button>
        <button class="tpill on" id="tp-tr" onclick="tl('tr')">Terjemahan</button>
      </div>
      <div class="llines" id="ll">
        ${lyricsHTML}
      </div>
      <div class="cmsec" style="margin-bottom:2rem">
        <div class="cmtit" style="margin-bottom:.8rem">Tentang Lagu Ini</div>
        <p style="font-size:.82rem;color:var(--muted);line-height:1.8;font-weight:300">
          ${descId ? escHtml(descId) : `<strong style="color:var(--text)">${escHtml(titleMain)}</strong>${titleDisplay && titleRo ? ` (${escHtml(titleDisplay)})` : ''} adalah lagu dari <strong style="color:var(--text)">${escHtml(artist)}</strong>${anime ? ` yang digunakan sebagai ${songType||'lagu'} dalam anime <strong style="color:var(--accent)">${escHtml(anime)}</strong>${animeEn ? ` (${escHtml(animeEn)})` : ''}` : ''}.${titleId ? ` Dalam bahasa Indonesia, judul lagu ini berarti "<strong style="color:var(--accent)">${escHtml(titleId)}</strong>".` : ''} Di halaman ini kamu bisa membaca lirik lengkap ${escHtml(titleMain)} dengan teks Jepang asli, romaji, dan terjemahan bahasa Indonesia. YumeSubs menyediakan terjemahan lagu Jepang secara gratis untuk membantu kamu memahami arti dan makna dari lagu-lagu Jepang favorit.`}
        </p>
        ${descJp ? `<p style="font-size:.78rem;color:var(--muted);line-height:1.8;font-weight:300;margin-top:.8rem;font-family:var(--jp)">${escHtml(descJp)}</p>` : ''}
      </div>
      <div class="cmsec">
        <div class="cmtit">Komentar</div>
        <div class="cmform">
          <div class="cmrow">
            <input class="cmi" id="cm-n" placeholder="Nama lo (opsional)">
            <button class="sbtn" id="cm-btn" onclick="postCm()">Kirim</button>
          </div>
          <textarea class="cmi" id="cm-t" rows="3" placeholder="Tulis komentar tentang lagu ini..."></textarea>
        </div>
        <div class="cmlist" id="cmlist"><div class="nocm">Memuat komentar...</div></div>
      </div>
    </div>
  </div>
</div>
</div>
<div class="toast" id="toast"></div>
<script type="module">
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
import { getFirestore, collection, addDoc, query, where, getDocs, updateDoc, doc, increment }
  from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

const db = getFirestore(initializeApp({
  apiKey:"AIzaSyA3dKYhDxX3DE5CAI_yQbjvUUdsBR0QeS8",
  authDomain:"yumesubs7.firebaseapp.com",
  projectId:"yumesubs7",
  storageBucket:"yumesubs7.firebasestorage.app",
  messagingSenderId:"1076202015626",
  appId:"1:1076202015626:web:ce89fb668eb6b2bd021673"
}));

const SONG_ID = "${escHtml(songId)}";
try { updateDoc(doc(db,'songs',SONG_ID), { views: increment(1) }); } catch(e){}
let sro=true, str=true;

/* ── Restore urutan karakter lirik via CSS order (obfuscation tetap aktif di DOM) ── */
(()=>{
  // Pakai CSS flexbox + order property agar karakter tampil urut di layar
  // tapi di DOM tetap acak — reader mode parser baca DOM, bukan rendered order
  document.querySelectorAll('[data-obf="1"]').forEach(line => {
    const spans = Array.from(line.querySelectorAll('span[data-c]'));
    if (!spans.length) return;
    // Set display flex pada container
    line.style.cssText += ';display:inline-flex;flex-wrap:wrap;gap:0';
    spans.forEach(s => {
      s.style.order = s.dataset.c;
      // Noise spans sudah absolute/hidden, tidak perlu diubah
    });
  });
})();

function toast(m){const t=document.getElementById('toast');t.textContent=m;t.classList.add('on');setTimeout(()=>t.classList.remove('on'),2800);}

window.tl = type => {
  if(type==='ro'){sro=!sro;document.getElementById('tp-ro').classList.toggle('on',sro);document.querySelectorAll('.lro').forEach(e=>e.classList.toggle('h',!sro));}
  else{str=!str;document.getElementById('tp-tr').classList.toggle('on',str);document.querySelectorAll('.lid').forEach(e=>e.classList.toggle('h',!str));}
};

function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

function renderComment(id, c, replies){
  const isAdm=c.isAdmin;
  let repHtml='';
  if(replies&&replies.length){
    repHtml='<div class="replies">'+replies.map(r=>{
      if(r.isAdmin) return \`<div class="ritem is-admin"><div class="admin-reply-block"><div class="admin-badge-wrap"><span class="admin-badge">Admin</span><span class="admin-name">YumeSubs</span></div><div class="admin-reply-text">\${esc(r.text)}</div></div></div>\`;
      return \`<div class="ritem"><div class="chdr-left"><span class="cname">\${esc(r.name)}</span><span class="cdate">\${esc(r.date)}</span></div><div class="ctxt">\${esc(r.text)}</div></div>\`;
    }).join('')+'</div>';
  }
  return \`<div class="citem\${isAdm?' is-admin':''}">
    <div class="chdr"><div class="chdr-left"><div class="cname">\${esc(c.name)}</div>\${isAdm?'<span class="admin-badge">Admin</span>':''}<div class="cdate">\${esc(c.date)}</div></div>
    <button class="reply-btn" onclick="toggleReplyForm('\${id}')">↩ Balas</button></div>
    <div class="ctxt">\${esc(c.text)}</div>
    \${repHtml}
    <div class="reply-form" id="rf-\${id}">
      <div class="reply-row"><input class="cmi" id="rn-\${id}" placeholder="Nama (opsional)"><button class="rbtn-cancel" onclick="toggleReplyForm('\${id}')">✕</button></div>
      <textarea class="cmi" id="rt-\${id}" rows="2" placeholder="Balas komentar ini..."></textarea>
      <button class="sbtn" style="padding:.55rem 1rem;align-self:flex-start" onclick="postReply('\${id}')">Kirim Balasan</button>
    </div>
  </div>\`;
}

async function rcm(){
  const el=document.getElementById('cmlist');
  el.innerHTML='<div class="nocm">Memuat komentar...</div>';
  try{
    const allSnap=await getDocs(query(collection(db,'comments'),where('songId','==',SONG_ID)));
    const allDocs=allSnap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.ts||0)-(a.ts||0));
    if(!allDocs.length){el.innerHTML='<div class="nocm">Belum ada komentar. Jadi yang pertama!</div>';return;}
    const parents=allDocs.filter(c=>!c.parentId);
    const replyMap={};
    allDocs.filter(c=>!!c.parentId).forEach(r=>{if(!replyMap[r.parentId])replyMap[r.parentId]=[];replyMap[r.parentId].push(r);});
    if(!parents.length){el.innerHTML='<div class="nocm">Belum ada komentar. Jadi yang pertama!</div>';return;}
    el.innerHTML=parents.map(c=>renderComment(c.id,c,replyMap[c.id]||[])).join('');
  }catch(e){el.innerHTML='<div class="nocm">Gagal memuat komentar.</div>';}
}

window.toggleReplyForm = id => {
  const rf=document.getElementById('rf-'+id);rf.classList.toggle('open');
  if(rf.classList.contains('open'))document.getElementById('rt-'+id).focus();
};

window.postReply = async parentId => {
  const t=document.getElementById('rt-'+parentId).value.trim();if(!t)return;
  const n=document.getElementById('rn-'+parentId).value.trim();
  try{
    await addDoc(collection(db,'comments'),{songId:SONG_ID,parentId,name:n||'Anonim',text:t,date:new Date().toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'}),ts:Date.now(),isAdmin:false});
    toast('Balasan terkirim!');rcm();
  }catch(e){toast('Gagal kirim.');}
};

window.postCm = async () => {
  const n=document.getElementById('cm-n').value.trim();
  const t=document.getElementById('cm-t').value.trim();
  const btn=document.getElementById('cm-btn');
  if(!t)return;btn.disabled=true;
  try{
    await addDoc(collection(db,'comments'),{songId:SONG_ID,parentId:null,name:n||'Anonim',text:t,date:new Date().toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'}),ts:Date.now(),isAdmin:false});
    document.getElementById('cm-t').value='';rcm();toast('Komentar terkirim!');
  }catch(e){toast('Gagal kirim komentar.');}
  btn.disabled=false;
};

rcm();
</script>
<script>
function fixBg(){const h=window.visualViewport?window.visualViewport.height:window.innerHeight;const w=window.visualViewport?window.visualViewport.width:window.innerWidth;const bg=document.getElementById('bgwrap');if(bg){bg.style.height=h+'px';bg.style.width=w+'px';}document.body.style.minHeight=h+'px';}
fixBg();if(window.visualViewport){window.visualViewport.addEventListener('resize',fixBg);window.visualViewport.addEventListener('scroll',fixBg);}window.addEventListener('resize',fixBg);
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
/* ── YumeSubs Copy Protection ── */
(function(){
  const WATERMARK = '\n\n© YumeSubs — yumelyrics.my.id';
  const CHAR_LIMIT = 10;

  function isInput(el){ const t=el.tagName; return t==='INPUT'||t==='TEXTAREA'; }

  /* 1. Blokir klik kanan */
  document.addEventListener('contextmenu', function(e){ e.preventDefault(); });

  /* 2. Blokir keyboard shortcut */
  document.addEventListener('keydown', function(e){
    if((e.ctrlKey||e.metaKey) && ['a','c','u','s'].includes(e.key.toLowerCase())){
      e.preventDefault();
    }
  });

  /* 3. Intercept copy — potong di CHAR_LIMIT, tambah watermark */
  document.addEventListener('copy', function(e){
    const sel = window.getSelection().toString();
    if(sel.length > CHAR_LIMIT){
      const trimmed = sel.substring(0, CHAR_LIMIT);
      e.clipboardData.setData('text/plain', trimmed + WATERMARK);
      e.preventDefault();
    }
  });

  /* 4. Blokir selectstart (desktop) — hanya blokir di elemen lirik */
  document.addEventListener('selectstart', function(e){
    if(isInput(e.target)) return;
    var el = e.target;
    while(el && el !== document.body){
      if(el.id==='ll') { e.preventDefault(); return; }
      el = el.parentElement;
    }
  });

  /* 5. [MOBILE] Blokir long-press touch yang memicu seleksi */
  var touchTimer = null;
  document.addEventListener('touchstart', function(e){
    if(isInput(e.target)) return;
    touchTimer = setTimeout(function(){
      if(window.getSelection) window.getSelection().removeAllRanges();
    }, 300);
  }, { passive: true });
  document.addEventListener('touchend', function(){
    if(touchTimer){ clearTimeout(touchTimer); touchTimer=null; }
  }, { passive: true });
  document.addEventListener('touchcancel', function(){
    if(touchTimer){ clearTimeout(touchTimer); touchTimer=null; }
  }, { passive: true });

  /* 6. [MOBILE] Kalau seleksi teks berhasil terbentuk, langsung clear */
  document.addEventListener('selectionchange', function(){
    var sel = window.getSelection();
    if(!sel || sel.isCollapsed) return;
    var node = sel.anchorNode;
    if(!node) return;
    var el = node.nodeType===3 ? node.parentElement : node;
    if(isInput(el)) return;
    /* Biarkan max CHAR_LIMIT karakter, sisanya di-clear */
    var txt = sel.toString();
    if(txt.length > CHAR_LIMIT){
      sel.removeAllRanges();
    }
  });

})();
</script>
<!-- rm-decoy: articles dengan skor konten tinggi agar Readability.js pilih ini, bukan lirik -->
<div id="rm-decoy-wrap">
  <article class="rm-poison" id="rm-a1"><p>Halaman ini menggunakan teknologi interaktif yang tidak dapat ditampilkan dalam Reader Mode. Lirik yang kamu cari di halaman ini dilindungi dengan enkripsi DOM berbasis JavaScript dan hanya dapat ditampilkan secara penuh melalui browser tanpa Reader Mode aktif.</p><p>Reader Mode tidak didukung pada halaman ini karena konten lirik dilindungi hak cipta dan memerlukan render JavaScript penuh untuk ditampilkan dengan benar. Sistem pengacakan karakter yang kami gunakan membuat lirik hanya terbaca oleh engine render browser, bukan oleh parser teks seperti Reader Mode.</p><p>Silakan kunjungi yumelyrics.my.id secara langsung untuk pengalaman terbaik. Matikan Reader Mode di browser Anda dan muat ulang halaman untuk melihat lirik lengkap beserta terjemahan Indonesia.</p><p>YumeSubs adalah situs lirik lagu Jepang dengan terjemahan Indonesia terlengkap. Semua lirik diterjemahkan secara manual oleh tim kami untuk memastikan akurasi dan kualitas terjemahan. Dengan mengunjungi halaman asli, Anda juga bisa menikmati fitur toggle romaji, terjemahan, dan komentar komunitas.</p><p>© YumeSubs — yumelyrics.my.id — Semua lirik dilindungi hak cipta. Dilarang menyalin, mendistribusikan, atau mempublikasikan ulang tanpa izin tertulis dari YumeSubs. Pelanggaran hak cipta dapat dikenai sanksi hukum sesuai ketentuan yang berlaku.</p></article>
  <article class="rm-poison" id="rm-a2"><p>Konten pada halaman ini tidak kompatibel dengan Reader Mode. YumeSubs melindungi lirik terjemahan dengan enkripsi DOM dan rendering JavaScript. Teks yang tampil dalam Reader Mode bukan merupakan representasi akurat dari konten halaman ini.</p><p>Untuk melihat lirik anime bahasa Jepang beserta terjemahan Indonesia, matikan Reader Mode dan kunjungi halaman asli di browser Anda. Fitur Reader Mode pada browser seperti Firefox dan Safari menggunakan algoritma Readability.js yang tidak kompatibel dengan sistem proteksi konten yang kami gunakan.</p><p>YumeSubs menyediakan lirik lagu Jepang dari berbagai anime populer dengan terjemahan Indonesia yang akurat. Setiap lirik ditambahkan romaji untuk membantu pembaca yang ingin belajar bahasa Jepang. Kunjungi yumelyrics.my.id untuk katalog lengkap lagu-lagu anime.</p></article>
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
  console.log('🔥 Menghubungkan ke Firebase...');
  const app = initializeApp(firebaseConfig);
  const db  = getFirestore(app);

  const snap = await getDocs(query(collection(db,'songs'), orderBy('order','asc')));
  const songs = snap.docs.map(d=>({id:d.id,...d.data()}));
  console.log(`📦 ${songs.length} lagu ditemukan`);

  if(!fs.existsSync('lagu')) fs.mkdirSync('lagu');

  // Hapus semua file HTML lama dulu biar tidak ada duplikat
  const oldFiles = fs.readdirSync('lagu').filter(f => f.endsWith('.html'));
  for(const f of oldFiles) fs.unlinkSync(path.join('lagu', f));
  console.log(`🗑  ${oldFiles.length} file lama dihapus`);

  const urls = [`  <url><loc>${BASE_URL}/</loc><priority>1.0</priority><changefreq>weekly</changefreq></url>`];
  const today = new Date().toISOString().split('T')[0];
  const slugMap = {};

  for(const song of songs){
    const slug = toSlug(song.titleRo, song.titleJp, song.id);
    let finalSlug=slug, counter=2;
    while(slugMap[finalSlug]&&slugMap[finalSlug]!==song.id) finalSlug=`${slug}-${counter++}`;
    slugMap[finalSlug]=song.id;

    const html=generateHTML(song,finalSlug);
    fs.writeFileSync(path.join('lagu',`${finalSlug}.html`), html, 'utf8');
    console.log(`  ✓ lagu/${finalSlug}.html`);
    urls.push(`  <url><loc>${BASE_URL}/lagu/${finalSlug}.html</loc><lastmod>${today}</lastmod><priority>0.8</priority><changefreq>monthly</changefreq></url>`);
  }

  fs.writeFileSync('sitemap.xml',`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`,'utf8');
  console.log(`\n✅ Selesai! ${songs.length} halaman + sitemap.xml dibuat`);
  process.exit(0);
}

main().catch(e=>{console.error(e);process.exit(1);});
