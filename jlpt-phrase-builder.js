/** Build PHRASES_JLPT array from Documents/JLPT no BUNPOU.txt */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const LEVEL_MARK = { N5: /JLPT\s*N5/i, N4: /JLPT\s*N4/i, N3: /JLPT\s*N3/i, N2: /JLPT\s*N2/i, N1: /JLPT\s*N1/i };
const LINE_RE = /^\s*(\d+)\.\s*(.+?)\s*=\s*(.+?)\s*$/;

export function escJs(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

export function slugify(s) {
  return (
    String(s)
      .toLowerCase()
      .replace(/[（）()・～〜/\\、。！？\s]+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'pola'
  ).slice(0, 48) + '-jlpt';
}

export function stripLabel(p) {
  const m = p.match(/（([^）]+)）/);
  return m ? m[1].trim() : p.replace(/（[^）]+）/g, '').trim();
}

export function splitPatterns(raw) {
  const parts = raw.split(/\s*・\s*|\s*\/\s*/);
  const out = [];
  for (let p of parts) {
    p = p.trim();
    if (!p) continue;
    const m = p.match(/^(.+?)（([^）]+)）(.*)$/);
    if (m) {
      const surface = m[1].trim();
      const reading = m[2].trim();
      const rest = m[3].trim();
      const cand = (reading + rest).trim();
      if (cand) out.push(cand);
      if (surface && surface !== reading) out.push((surface + rest).trim());
    } else {
      const p2 = p.replace(/（[^）]+）/g, '').trim();
      if (p2) out.push(p2);
    }
  }
  return out;
}

export function inferJlptKind(match) {
  if (/です|ます|でした|ません|ましょう|でしょう|ござい|いたし|いらっしゃ|であります|でございます/.test(match)) return 'sopan';
  if (match.length === 1 && 'はがをにでのともかよねやへ'.includes(match)) return 'partikel';
  if (/すぎる|たい|ない|られる|れる|ている|てある|させる|られる|くなる|になり/.test(match)) return 'bentuk';
  if (/^(でも|けど|しかし|または|つまり|ところで|それで|それなら|だって|なお|一方|反面|および|ちなみに|それでも|ところが|さて|それとも)$/.test(match)) return 'penghubung';
  return 'pola';
}

export function parseJlptBunpouText(text) {
  let level = 'N5';
  const rows = [];
  const seen = new Set();

  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    if (t.includes('JLPT')) {
      for (const [lv, re] of Object.entries(LEVEL_MARK)) {
        if (re.test(t)) level = lv;
      }
      continue;
    }
    const m = t.match(LINE_RE);
    if (!m) continue;
    const rawPat = m[2].trim();
    const desc = m[3].trim();
    const label = stripLabel(rawPat) || rawPat;
    for (const match of splitPatterns(rawPat)) {
      const mt = match.replace(/〜/g, '～').trim();
      if (!mt || mt.length > 48 || /\[A\]/.test(mt) || seen.has(mt)) continue;
      seen.add(mt);
      rows.push([mt, label.slice(0, 80), desc, slugify(label || mt), level, inferJlptKind(mt)]);
    }
  }
  return rows;
}

export function rowsToJsArray(rows) {
  const lines = rows.map(
    (r) => `    ['${escJs(r[0])}', '${escJs(r[1])}', '${escJs(r[2])}', '${escJs(r[3])}', '${r[4]}', '${r[5]}']`
  );
  return `[\n${lines.join(',\n')}\n  ]`;
}

export function findJlptSourceFile() {
  const candidates = [
    path.join(__dirname, '..', 'Documents', 'JLPT no BUNPOU.txt'),
    path.join(__dirname, 'JLPT no BUNPOU.txt'),
    path.join(process.env.USERPROFILE || '', 'Documents', 'JLPT no BUNPOU.txt'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

export function buildJlptPhrasesInject() {
  const src = findJlptSourceFile();
  if (!src) return '[]';
  const text = fs.readFileSync(src, 'utf8');
  const rows = parseJlptBunpouText(text);
  return rowsToJsArray(rows);
}

export function buildJlptSourceInject() {
  const src = findJlptSourceFile();
  if (!src) return "''";
  return JSON.stringify(fs.readFileSync(src, 'utf8'));
}

/** node jlpt-phrase-builder.js — sisipkan PHRASES_JLPT ke ym-grammar-browser.js */
function bakeIntoGrammar() {
  const src = buildJlptSourceInject();
  if (src === "''") {
    console.error('JLPT no BUNPOU.txt tidak ditemukan.');
    process.exit(1);
  }
  const gPath = path.join(__dirname, 'ym-grammar-browser.js');
  let g = fs.readFileSync(gPath, 'utf8');
  if (!g.includes('/*JLPT_BUNPOU_SOURCE*/')) {
    console.error('Marker /*JLPT_BUNPOU_SOURCE*/ tidak ada di ym-grammar-browser.js');
    process.exit(1);
  }
  g = g.replace(/\/\*JLPT_BUNPOU_SOURCE\*\/''/, src);
  fs.writeFileSync(gPath, g, 'utf8');
  const n = (inj.match(/^\s*\[/gm) || []).length;
  console.log('OK —', (inj.match(/\n/g) || []).length + 1, 'baris inject →', gPath);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) bakeIntoGrammar();
