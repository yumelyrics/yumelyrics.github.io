// generate-resources.js
// Jalankan via GitHub Actions — ambil data Firebase, generate HTML per resource + update sitemap.xml

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

const BASE_URL = 'https://yumelyrics.github.io';
const CAT_EMOJI = { Aplikasi: '📱', Video: '🎬', Tools: '🛠️' };

function toSlug(title, docId) {
  if (title) {
    return title.toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .substring(0, 60);
  }
  return docId;
}

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Simple markdown → HTML (paragraf, bold, italic, link, img, blockquote)
function renderDesc(raw) {
  if (!raw) return '';
  return raw.split(/\n\n+/).map(para => {
    const t = para.trim();
    if (!t) return '';
    let line = t;
    if (line.startsWith('> ')) return `<blockquote>${escHtml(line.slice(2))}</blockquote>`;
    line = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    line = line.replace(/\*(.+?)\*/g, '<em>$1</em>');
    line = line.replace(/!\[([^\]]*)\]\((https?:\/\/[^)]+)\)/g,
      '<img src="$2" alt="$1" style="max-width:100%;border:1px solid var(--border);margin:.5rem 0;display:block">');
    line = line.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener">$1</a>');
    return `<p>${line}</p>`;
  }).join('');
}

function generateHTML(res, slug, related) {
  const title    = res.title    || '';
  const category = res.category || '';
  const desc     = res.desc     || '';
  const link     = res.link     || '#';
  const thumb    = res.thumb    || '';
  const resId    = res.id;
  const emoji    = CAT_EMOJI[category] || '🔗';

  const metaDesc = `${title} — ${desc.replace(/\n/g,' ').substring(0, 120) || category + ' rekomendasi dari YumeSubs'}`.substring(0, 155);

  const schema = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "WebPage",
    "name": title,
    "description": metaDesc,
    "url": `${BASE_URL}/resources-pages/${slug}.html`,
    "isPartOf": { "@type": "WebSite", "url": BASE_URL }
  });

  const relatedHTML = related.length ? `
      <div class="rel-sec">
        <div class="rel-lbl">Rekomendasi Lainnya</div>
        <div class="rel-grid">
          ${related.map(r => {
            const rEmoji = CAT_EMOJI[r.category] || '🔗';
            return `<a class="rel-card" href="${escHtml(r._slug)}.html">
              ${r.thumb
                ? `<img class="rel-thumb" src="${escHtml(r.thumb)}" alt="${escHtml(r.title)}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><div class="rel-thumb-ph" style="display:none">${rEmoji}</div>`
                : `<div class="rel-thumb-ph">${rEmoji}</div>`}
              <div class="rel-body">
                <div class="rel-cat">${escHtml(r.category)}</div>
                <div class="rel-title">${escHtml(r.title)}</div>
                <div class="rel-desc">${escHtml((r.desc||'').substring(0,80))}${(r.desc||'').length>80?'…':''}</div>
              </div>
            </a>`;
          }).join('')}
        </div>
      </div>` : '';

  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>${escHtml(title)} — ${escHtml(category)} | YumeSubs</title>
<meta name="description" content="${escHtml(metaDesc)}">
<meta name="keywords" content="${escHtml(title)}, ${escHtml(category)}, rekomendasi, YumeSubs, budaya jepang, belajar bahasa jepang">
<meta property="og:title" content="${escHtml(title)} | YumeSubs">
<meta property="og:description" content="${escHtml(metaDesc)}">
<meta property="og:url" content="${BASE_URL}/resources-pages/${slug}.html">
<meta property="og:type" content="article">
${thumb ? `<meta property="og:image" content="${escHtml(thumb)}">` : ''}
<link rel="canonical" href="${BASE_URL}/resources-pages/${slug}.html">
<link rel="icon" type="image/jpeg" href="../anime_icon.png">
<script type="application/ld+json">${schema}</script>
<link href="https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@400;600;800&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;1,9..40,300&display=swap" rel="stylesheet">
<style>
:root{--bg:#050d1a;--border:rgba(255,255,255,0.07);--accent:#c9a96e;--accent2:#4f7ec4;--text:#dde6f5;--muted:#5a6a82;--jp:'Shippori Mincho',serif;--en:'DM Sans',sans-serif;--red:#c96e6e}
*{margin:0;padding:0;box-sizing:border-box}
html,body{margin:0;padding:0}html{scroll-behavior:smooth;background:#050d1a}
body{color:var(--text);font-family:var(--en);min-height:100dvh;overflow-x:hidden;position:relative}
.wrap{position:relative;z-index:2}
nav{position:sticky;top:0;z-index:100;display:flex;align-items:center;justify-content:space-between;padding:0 2.5rem;height:60px;background:rgba(5,13,26,.9);backdrop-filter:blur(24px);border-bottom:1px solid var(--border);min-width:0}
.nav-logo{display:flex;align-items:center;gap:.5rem;text-decoration:none;flex-shrink:0}
.nljp{font-family:var(--jp);font-size:1.2rem;font-weight:800;color:var(--accent);white-space:nowrap;line-height:1}
.nlen{font-size:.6rem;color:var(--muted);letter-spacing:.2em;text-transform:uppercase;white-space:nowrap;line-height:1}
.nav-links{display:flex;gap:.25rem;align-items:center;flex-shrink:0}
.nb{background:none;border:none;font-family:var(--en);font-size:.7rem;color:var(--muted);letter-spacing:.12em;text-transform:uppercase;padding:.45rem .9rem;cursor:pointer;border-radius:2rem;transition:all .2s;text-decoration:none;display:inline-flex;align-items:center;white-space:nowrap}
.nb:hover{color:var(--text);background:rgba(255,255,255,.06)}
#resView{padding:0 2.5rem 5rem}
.rvback{display:flex;align-items:center;gap:1rem;padding:1.5rem 0 2rem;border-bottom:1px solid var(--border);margin-bottom:2rem}
.gbtn{background:none;border:1px solid var(--border);font-family:var(--en);font-size:.68rem;letter-spacing:.15em;text-transform:uppercase;color:var(--muted);padding:.45rem 1rem;cursor:pointer;transition:all .2s;text-decoration:none}
.gbtn:hover{border-color:var(--accent);color:var(--accent)}
.rv-cat{font-size:.6rem;color:var(--accent);letter-spacing:.25em;text-transform:uppercase;margin-bottom:.3rem}
.rv-title{font-family:var(--jp);font-size:1.3rem;font-weight:600;color:var(--text);line-height:1.3}
.rvgrid{display:grid;grid-template-columns:320px 1fr;gap:3rem;align-items:start}
.rv-thumb-wrap{overflow:hidden;border:1px solid var(--border)}
.rv-thumb{width:100%;aspect-ratio:16/9;object-fit:cover;filter:saturate(.8);display:block;transition:filter .3s}
.rv-thumb:hover{filter:saturate(1)}
.rv-thumb-ph{width:100%;aspect-ratio:16/9;background:linear-gradient(135deg,#0d1629,#152035);display:flex;align-items:center;justify-content:center;font-size:3rem}
.rv-open{display:flex;align-items:center;justify-content:center;gap:.6rem;margin-top:1rem;background:var(--accent2);border:none;font-family:var(--en);font-size:.75rem;letter-spacing:.14em;text-transform:uppercase;color:#fff;padding:.85rem 1.6rem;cursor:pointer;text-decoration:none;transition:opacity .2s;font-weight:500;width:100%}
.rv-open:hover{opacity:.85}
.rv-open svg{width:14px;height:14px;flex-shrink:0}
.rv-meta-box{margin-top:1rem;border:1px solid var(--border);padding:.85rem 1rem;background:rgba(255,255,255,.02)}
.rv-meta-row{display:flex;justify-content:space-between;align-items:center;padding:.35rem 0;border-bottom:1px solid var(--border);font-size:.75rem}
.rv-meta-row:last-child{border-bottom:none}
.rv-meta-lbl{color:var(--muted)}
.rv-meta-val{color:var(--text)}
.rv-desc-lbl{font-size:.6rem;color:var(--muted);letter-spacing:.22em;text-transform:uppercase;margin-bottom:.8rem}
.rv-desc{font-size:.92rem;color:var(--text);line-height:1.9;font-weight:300}
.rv-desc p{margin-bottom:1rem}.rv-desc p:last-child{margin-bottom:0}
.rv-desc a{color:var(--accent2);text-decoration:underline}
.rv-desc strong{color:var(--accent);font-weight:500}
.rv-desc em{font-style:italic;color:var(--muted)}
.rv-desc blockquote{border-left:3px solid var(--accent);padding:.4rem 0 .4rem 1rem;color:var(--muted);font-style:italic;margin:.8rem 0}
.rel-sec{margin-top:2.5rem;padding-top:2rem;border-top:1px solid var(--border)}
.rel-lbl{font-size:.6rem;color:var(--muted);letter-spacing:.22em;text-transform:uppercase;margin-bottom:1.2rem}
.rel-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:.8rem}
.rel-card{background:rgba(255,255,255,.02);border:1px solid var(--border);text-decoration:none;display:block;overflow:hidden;transition:border-color .2s,transform .2s}
.rel-card:hover{border-color:rgba(255,255,255,.14);transform:translateY(-2px)}
.rel-thumb{width:100%;aspect-ratio:16/9;object-fit:cover;display:block;filter:saturate(.75)}
.rel-thumb-ph{width:100%;aspect-ratio:16/9;background:linear-gradient(135deg,#0d1629,#152035);display:flex;align-items:center;justify-content:center;font-size:1.5rem}
.rel-body{padding:.75rem .9rem .9rem}
.rel-cat{font-size:.52rem;color:var(--accent);letter-spacing:.18em;text-transform:uppercase;margin-bottom:.25rem}
.rel-title{font-size:.82rem;color:var(--text);font-weight:500;line-height:1.35;margin-bottom:.25rem}
.rel-desc{font-size:.7rem;color:var(--muted);line-height:1.55;font-weight:300;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.cmsec{margin-top:2.5rem;padding-top:2rem;border-top:1px solid var(--border);max-width:620px}
.cmtit{font-size:.62rem;color:var(--muted);letter-spacing:.22em;text-transform:uppercase;margin-bottom:1.5rem}
.cmform{display:flex;flex-direction:column;gap:.6rem;margin-bottom:2rem}
.cmi{background:rgba(255,255,255,.03);border:1px solid var(--border);color:var(--text);font-family:var(--en);font-size:.82rem;padding:.7rem 1rem;outline:none;resize:none;transition:border-color .2s}
.cmi::placeholder{color:var(--muted)}.cmi:focus{border-color:rgba(201,169,110,.4)}
.cmrow{display:flex;gap:.6rem}.cmrow .cmi{flex:1}
.sbtn{background:var(--accent2);border:none;font-family:var(--en);font-size:.68rem;letter-spacing:.12em;text-transform:uppercase;color:#fff;padding:0 1.2rem;cursor:pointer;transition:opacity .2s}
.sbtn:hover{opacity:.8}.sbtn:disabled{opacity:.4;cursor:not-allowed}
.cmlist{display:flex;flex-direction:column;gap:1rem}
.citem{background:rgba(255,255,255,.02);border:1px solid var(--border);padding:1rem 1.2rem}
.citem.is-admin{background:rgba(201,169,110,.05);border-color:rgba(201,169,110,.2)}
.chdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:.4rem;gap:.5rem;flex-wrap:wrap}
.chdr-left{display:flex;align-items:center;gap:.5rem;flex-wrap:wrap}
.cname{font-size:.72rem;color:var(--accent);font-weight:500}
.cdate{font-size:.6rem;color:var(--muted)}
.ctxt{font-size:.82rem;color:var(--text);line-height:1.65;font-weight:300}
.nocm{font-size:.78rem;color:var(--muted);font-style:italic}
.admin-badge{font-size:.55rem;letter-spacing:.12em;text-transform:uppercase;color:#07060f;background:var(--accent);padding:.15rem .45rem;font-weight:600}
.reply-btn{background:none;border:none;font-family:var(--en);font-size:.6rem;color:var(--muted);letter-spacing:.12em;text-transform:uppercase;cursor:pointer;padding:.2rem .5rem;transition:color .2s}
.reply-btn:hover{color:var(--accent2)}
.replies{margin-top:.8rem;padding-top:.8rem;border-top:1px solid var(--border);display:flex;flex-direction:column;gap:.7rem}
.ritem{padding:.7rem 1rem;border-left:2px solid var(--border)}
.ritem.is-admin{border-left-color:var(--accent);background:rgba(201,169,110,.04)}
.admin-reply-block{display:flex;align-items:flex-start;gap:.6rem;border:1px solid rgba(201,169,110,.2);padding:.6rem .85rem;border-radius:2px;position:relative;overflow:hidden;isolation:isolate}
.admin-reply-block::before{content:'';position:absolute;inset:0;background:url('https://media1.giphy.com/media/v1.Y2lkPTc5MGI3NjExZHVmOGEyb2EydmhzNWxhcTA4NmlxN3JsZjIxeXV2a3MwZDZuNXFjayZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/yarJ7WfdKiAkE/giphy.gif') center/cover no-repeat;opacity:.18;z-index:-1;pointer-events:none}
.admin-reply-block::after{content:'';position:absolute;inset:0;background:rgba(7,6,15,.55);z-index:-1;pointer-events:none}
.admin-badge-wrap{display:flex;flex-direction:column;align-items:center;gap:.3rem;flex-shrink:0}
.admin-badge-wrap .admin-badge{font-size:.54rem;color:#07060f;background:var(--accent);padding:.15rem .5rem;border-radius:2rem;letter-spacing:.1em;text-transform:uppercase;font-weight:700;white-space:nowrap}
.admin-name{font-size:.6rem;color:var(--accent);white-space:nowrap}
.admin-reply-text{font-size:.78rem;color:var(--text);line-height:1.65;flex:1}
.reply-form{margin-top:.8rem;padding-top:.8rem;border-top:1px solid var(--border);display:none;flex-direction:column;gap:.5rem}
.reply-form.open{display:flex}
.reply-row{display:flex;gap:.5rem}.reply-row .cmi{flex:1}
.rbtn-cancel{background:none;border:1px solid var(--border);font-family:var(--en);font-size:.62rem;color:var(--muted);padding:.4rem .8rem;cursor:pointer;letter-spacing:.1em;text-transform:uppercase;transition:all .2s}
.rbtn-cancel:hover{border-color:var(--red);color:var(--red)}
.toast{position:fixed;bottom:2rem;right:2rem;background:var(--accent);color:#07060f;font-size:.72rem;letter-spacing:.12em;text-transform:uppercase;padding:.7rem 1.4rem;z-index:999;opacity:0;transform:translateY(8px);transition:all .3s;pointer-events:none}
.toast.on{opacity:1;transform:translateY(0)}
::-webkit-scrollbar{width:3px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:var(--border)}
@media(max-width:860px){.rvgrid{grid-template-columns:1fr}.rel-grid{grid-template-columns:repeat(auto-fill,minmax(160px,1fr))}}
@media(max-width:600px){nav{padding:0 1rem}.nb{padding:.4rem .6rem;font-size:.62rem}#resView{padding-left:1.2rem;padding-right:1.2rem}}
@media(max-width:380px){.nlen{display:none}}
</style>
</head>
<body>
<div id="bgwrap"></div>
<style>
#bgwrap{position:fixed;top:0;left:0;width:100%;height:100%;z-index:0;pointer-events:none;background:#07101f}
@media(min-width:768px){#bgwrap{background:url('https://images7.alphacoders.com/131/thumb-1920-1316304.jpeg') center/cover no-repeat;filter:brightness(.32) saturate(.75)}}
</style>
<div class="wrap">
<nav>
  <a class="nav-logo" href="../index.html">
    <div class="nljp">夢字幕</div>
    <div class="nlen">YumeSubs</div>
  </a>
  <div class="nav-links">
    <a class="nb" href="../index.html">Katalog</a>
    <a class="nb" href="../resources.html">Resources</a>
    <a class="nb" href="../stories.html">Cerita</a>
    <a class="nb" href="../contact.html">Hubungi</a>
  </div>
</nav>
<div id="resView">
  <div class="rvback">
    <a class="gbtn" href="../resources.html">← Resources</a>
    <div>
      <div class="rv-cat">${emoji} ${escHtml(category)}</div>
      <div class="rv-title">${escHtml(title)}</div>
    </div>
  </div>
  <div class="rvgrid">
    <div>
      <div class="rv-thumb-wrap">
        ${thumb
          ? `<img class="rv-thumb" src="${escHtml(thumb)}" alt="${escHtml(title)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><div class="rv-thumb-ph" style="display:none">${emoji}</div>`
          : `<div class="rv-thumb-ph">${emoji}</div>`}
      </div>
      <a class="rv-open" href="${escHtml(link)}" target="_blank" rel="noopener">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
        Buka ${escHtml(category)}
      </a>
      <div class="rv-meta-box">
        <div class="rv-meta-row">
          <span class="rv-meta-lbl">Kategori</span>
          <span class="rv-meta-val">${emoji} ${escHtml(category)}</span>
        </div>
        <div class="rv-meta-row">
          <span class="rv-meta-lbl">Link</span>
          <span class="rv-meta-val" style="font-size:.68rem;color:var(--accent2);word-break:break-all">${escHtml(link.replace(/^https?:\/\//, '').substring(0, 35))}${link.length > 38 ? '…' : ''}</span>
        </div>
      </div>
    </div>
    <div>
      ${desc ? `<div class="rv-desc-lbl">Tentang</div><div class="rv-desc">${renderDesc(desc)}</div>` : ''}
      ${relatedHTML}
      <div class="cmsec">
        <div class="cmtit">Komentar</div>
        <div class="cmform">
          <div class="cmrow">
            <input class="cmi" id="cm-n" placeholder="Nama lo (opsional)">
            <button class="sbtn" id="cm-btn" onclick="postCm()">Kirim</button>
          </div>
          <textarea class="cmi" id="cm-t" rows="3" placeholder="Pernah pakai ini? Share pengalaman lo..."></textarea>
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
import { getFirestore, collection, addDoc, query, where, getDocs }
  from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
const db = getFirestore(initializeApp({
  apiKey:"AIzaSyA3dKYhDxX3DE5CAI_yQbjvUUdsBR0QeS8",
  authDomain:"yumesubs7.firebaseapp.com",projectId:"yumesubs7",
  storageBucket:"yumesubs7.firebasestorage.app",
  messagingSenderId:"1076202015626",
  appId:"1:1076202015626:web:ce89fb668eb6b2bd021673"
}));
const RES_ID = "${escHtml(resId)}";
function toast(m){const t=document.getElementById('toast');t.textContent=m;t.classList.add('on');setTimeout(()=>t.classList.remove('on'),2800);}
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function renderComment(id,c,replies){
  const isAdm=c.isAdmin;
  let repHtml='';
  if(replies&&replies.length){
    repHtml='<div class="replies">'+replies.map(r=>{
      if(r.isAdmin)return \`<div class="ritem is-admin"><div class="admin-reply-block"><div class="admin-badge-wrap"><span class="admin-badge">Admin</span><span class="admin-name">YumeSubs</span></div><div class="admin-reply-text">\${esc(r.text)}</div></div></div>\`;
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
    const allSnap=await getDocs(query(collection(db,'comments_resources'),where('resId','==',RES_ID)));
    const allDocs=allSnap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.ts||0)-(a.ts||0));
    if(!allDocs.length){el.innerHTML='<div class="nocm">Belum ada komentar. Jadi yang pertama!</div>';return;}
    const parents=allDocs.filter(c=>!c.parentId);
    const replyMap={};
    allDocs.filter(c=>!!c.parentId).forEach(r=>{if(!replyMap[r.parentId])replyMap[r.parentId]=[];replyMap[r.parentId].push(r);});
    if(!parents.length){el.innerHTML='<div class="nocm">Belum ada komentar. Jadi yang pertama!</div>';return;}
    el.innerHTML=parents.map(c=>renderComment(c.id,c,replyMap[c.id]||[])).join('');
  }catch(e){el.innerHTML='<div class="nocm">Gagal memuat komentar.</div>';}
}
window.toggleReplyForm=id=>{const rf=document.getElementById('rf-'+id);rf.classList.toggle('open');if(rf.classList.contains('open'))document.getElementById('rt-'+id).focus();};
window.postReply=async parentId=>{
  const t=document.getElementById('rt-'+parentId).value.trim();if(!t)return;
  const n=document.getElementById('rn-'+parentId).value.trim();
  try{await addDoc(collection(db,'comments_resources'),{resId:RES_ID,parentId,name:n||'Anonim',text:t,date:new Date().toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'}),ts:Date.now(),isAdmin:false});toast('Balasan terkirim!');rcm();}catch(e){toast('Gagal kirim.');}
};
window.postCm=async()=>{
  const n=document.getElementById('cm-n').value.trim();
  const t=document.getElementById('cm-t').value.trim();
  const btn=document.getElementById('cm-btn');
  if(!t)return;btn.disabled=true;
  try{await addDoc(collection(db,'comments_resources'),{resId:RES_ID,parentId:null,name:n||'Anonim',text:t,date:new Date().toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'}),ts:Date.now(),isAdmin:false});document.getElementById('cm-t').value='';rcm();toast('Komentar terkirim!');}catch(e){toast('Gagal kirim komentar.');}
  btn.disabled=false;
};
rcm();
</script>
<script>
document.addEventListener('copy',function(e){const s=window.getSelection().toString();if(s.length>10){e.clipboardData.setData('text/plain',s+'\n\n\u00a9 YumeSubs \u2014 yumelyrics.github.io');e.preventDefault();}});
</script>
</body>
</html>`;
}

async function main() {
  console.log('🔥 Menghubungkan ke Firebase...');
  const app = initializeApp(firebaseConfig);
  const db  = getFirestore(app);

  const resSnap = await getDocs(query(collection(db, 'resources'), orderBy('order', 'asc')));
  const resources = resSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  console.log(`📦 ${resources.length} resource ditemukan`);

  if (!fs.existsSync('resources-pages')) fs.mkdirSync('resources-pages');

  const slugMap = {};

  // Pass 1: build slug untuk semua resource (dipakai di related links)
  for (const res of resources) {
    const base = toSlug(res.title, res.id);
    let slug = base, i = 2;
    while (slugMap[slug] && slugMap[slug] !== res.id) slug = `${base}-${i++}`;
    slugMap[slug] = res.id;
    res._slug = slug;
  }

  const urls = [];

  // Pass 2: generate HTML
  for (const res of resources) {
    const related = resources
      .filter(r => r.id !== res.id && r.category === res.category)
      .slice(0, 4);

    const html = generateHTML(res, res._slug, related);
    fs.writeFileSync(path.join('resources-pages', `${res._slug}.html`), html, 'utf8');
    console.log(`  ✓ resources-pages/${res._slug}.html`);
    urls.push(`  <url><loc>${BASE_URL}/resources-pages/${res._slug}.html</loc><priority>0.7</priority></url>`);
  }

  // Update sitemap — replace bagian resources-pages, pertahankan sisanya
  if (fs.existsSync('sitemap.xml')) {
    let sitemap = fs.readFileSync('sitemap.xml', 'utf8');
    // Hapus semua entry resources-pages yang lama
    sitemap = sitemap.replace(/\s*<url><loc>[^<]*resources-pages[^<]*<\/loc>[^<]*<\/url>/g, '');
    sitemap = sitemap.replace('</urlset>', urls.join('\n') + '\n</urlset>');
    fs.writeFileSync('sitemap.xml', sitemap, 'utf8');
  } else {
    fs.writeFileSync('sitemap.xml',
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${BASE_URL}/</loc><priority>1.0</priority></url>\n${urls.join('\n')}\n</urlset>`,
      'utf8'
    );
  }

  console.log(`\n✅ Selesai! ${resources.length} halaman resource dibuat/diupdate`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
