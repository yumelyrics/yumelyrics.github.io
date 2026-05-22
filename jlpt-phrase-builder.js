/** Build PHRASES_JLPT — repo root: bunpou-jlpt/daftar-bunpou-jlpt.txt → ym-grammar-browser.js */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { inferRumus } from './bunpou-jlpt/bunpou-rumus.js';
import { inferContoh } from './bunpou-jlpt/bunpou-contoh.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BUNPOU_DIR = path.join(__dirname, 'bunpou-jlpt');
const GRAMMAR_PATH = path.join(__dirname, 'ym-grammar-browser.js');
const MASTER_TXT = path.join(BUNPOU_DIR, 'daftar-bunpou-jlpt.txt');

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

export function parseCatalogSections(text) {
  let level = 'N5';
  const sections = [];
  let cur = { level, title: 'JLPT N5', tag: '// JLPT N5', items: [] };

  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    const hdr = t.replace(/\\+/g, '').match(/JLPT\s*N([1-5])/i);
    if (hdr) {
      if (cur.items.length) sections.push(cur);
      level = 'N' + hdr[1];
      cur = { level, title: 'JLPT ' + level, tag: t, items: [] };
      continue;
    }
    const m = t.match(LINE_RE);
    if (!m) continue;
    const pattern = m[2].trim();
    const meaning = m[3].trim();
    cur.items.push({
      n: Number(m[1]),
      pattern,
      meaning,
      rumus: inferRumus(pattern, meaning),
      contoh: inferContoh(pattern, meaning),
      level,
    });
  }
  if (cur.items.length) sections.push(cur);
  return sections;
}

export function buildCatalogDataFile() {
  if (!fs.existsSync(MASTER_TXT) && !syncMasterTxt()) {
    console.error('daftar-bunpou-jlpt.txt tidak ada — tidak bisa buat bunpou-jlpt-data.js');
    return false;
  }
  const text = fs.readFileSync(MASTER_TXT, 'utf8');
  const sections = parseCatalogSections(text);
  const total = sections.reduce((s, x) => s + x.items.length, 0);
  const out = path.join(BUNPOU_DIR, 'bunpou-jlpt-data.js');
  fs.writeFileSync(
    out,
    '/** Otomatis dari daftar-bunpou-jlpt.txt — jangan edit manual */\nwindow.JLPT_CATALOG = ' +
      JSON.stringify(sections) +
      ';\n',
    'utf8'
  );
  const rumusSrc = path.join(BUNPOU_DIR, 'bunpou-rumus.js');
  if (fs.existsSync(rumusSrc)) {
    let browser = fs
      .readFileSync(rumusSrc, 'utf8')
      .replace(/export function /g, 'function ')
      .replace(/export const /g, 'const ');
    const contohSrc = path.join(BUNPOU_DIR, 'bunpou-contoh.js');
    if (fs.existsSync(contohSrc)) {
      let cjs = fs.readFileSync(contohSrc, 'utf8').replace(/^import\s.+$/m, '');
      cjs = cjs.replace(/export function /g, 'function ');
      browser += '\n' + cjs;
      browser += '\nwindow.inferContoh = inferContoh;\n';
    }
    fs.writeFileSync(
      path.join(BUNPOU_DIR, 'bunpou-rumus-browser.js'),
      browser + '\nwindow.inferRumus = inferRumus;\nwindow.RUMUS_DASAR = RUMUS_DASAR;\n',
      'utf8'
    );
  }
  console.log('OK — bunpou-jlpt-data.js:', total, 'entri,', sections.length, 'level');
  return true;
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
      if (mt.length === 1 && /^[\u3040-\u309F]$/.test(mt)) continue;
      seen.add(mt);
      const rumus = inferRumus(rawPat, desc);
      const contoh = inferContoh(rawPat, desc);
      const cj = contoh && contoh.jp ? escJs(contoh.jp) : '';
      const ci = contoh && contoh.id ? escJs(contoh.id) : '';
      rows.push([mt, label.slice(0, 80), desc, slugify(label || mt), level, inferJlptKind(mt), rumus, cj, ci]);
    }
  }
  return rows;
}

export function rowsToJsArray(rows) {
  const lines = rows.map((r) => {
    const rumus = r[6] ? `, '${escJs(r[6])}'` : '';
    const cj = r[7] ? `, '${r[7]}'` : '';
    const ci = r[8] ? `, '${r[8]}'` : '';
    return `    ['${escJs(r[0])}', '${escJs(r[1])}', '${escJs(r[2])}', '${escJs(r[3])}', '${r[4]}', '${r[5]}'${rumus}${cj}${ci}]`;
  });
  return `[\n${lines.join(',\n')}\n  ]`;
}

export function findJlptSourceFile() {
  const candidates = [
    MASTER_TXT,
    path.join(BUNPOU_DIR, 'JLPT no BUNPOU.txt'),
    path.join(__dirname, 'JLPT no BUNPOU.txt'),
    path.join(__dirname, '..', 'JLPT no BUNPOU.txt'),
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
  return rowsToJsArray(parseJlptBunpouText(text));
}

export function buildJlptSourceInject() {
  const src = findJlptSourceFile();
  if (!src) return "''";
  return JSON.stringify(fs.readFileSync(src, 'utf8'));
}

export function buildInferRumusBlock() {
  const rumusPath = path.join(BUNPOU_DIR, 'bunpou-rumus.js');
  if (!fs.existsSync(rumusPath)) return '';
  return fs
    .readFileSync(rumusPath, 'utf8')
    .replace(/export function /g, 'function ')
    .replace(/export const RUMUS_DASAR[\s\S]*$/m, '')
    .trim();
}

export function injectRumusIntoGrammar(grammar) {
  const block = buildInferRumusBlock();
  if (!block) return grammar;
  const wrapped = `/** INFER_RUMUS_BLOCK */\n${block}\n/** END_INFER_RUMUS */`;
  if (grammar.includes('/** INFER_RUMUS_BLOCK */')) {
    return grammar.replace(
      /\/\*\* INFER_RUMUS_BLOCK \*\/[\s\S]*?\/\*\* END_INFER_RUMUS \*\//,
      wrapped
    );
  }
  return grammar.replace(/(\s*\/\*\* Parser JLPT N5)/, `\n${wrapped}\n$1`);
}

export function patchParseJlptRumus(grammar) {
  if (/inferRumus\(rawPat/.test(grammar)) return grammar;
  return grammar.replace(
    /rows\.push\(\[mt, label\.slice\(0, 80\), desc, slugify\(label \|\| mt\), level, jlptKind\(mt\)\]\);/,
    'rows.push([mt, label.slice(0, 80), desc, slugify(label || mt), level, jlptKind(mt), inferRumus(rawPat, desc)]);'
  );
}

export function applyJlptSourceToGrammar(grammar, jlptSrc) {
  if (!jlptSrc || jlptSrc === "''") return grammar;
  if (grammar.includes('/*JLPT_BUNPOU_SOURCE*/\'\'')) {
    return grammar.replace('/*JLPT_BUNPOU_SOURCE*/\'\'', jlptSrc);
  }
  if (/const\s+JLPT_BUNPOU_SOURCE\s*=/.test(grammar)) {
    return grammar.replace(
      /const\s+JLPT_BUNPOU_SOURCE\s*=[\s\S]*?;\s*\n\s*const\s+PHRASES_JLPT/,
      `const JLPT_BUNPOU_SOURCE = ${jlptSrc};\n  const PHRASES_JLPT`
    );
  }
  return grammar;
}

export function syncMasterTxt() {
  const src = findJlptSourceFile();
  if (!src) return false;
  if (path.resolve(src) === path.resolve(MASTER_TXT)) return true;
  fs.mkdirSync(BUNPOU_DIR, { recursive: true });
  fs.copyFileSync(src, MASTER_TXT);
  return true;
}

export function bakeJlptIntoGrammar() {
  if (!syncMasterTxt() && !fs.existsSync(MASTER_TXT)) {
    console.error('daftar-bunpou-jlpt.txt tidak ada.');
    console.error('Letakkan di bunpou-jlpt/daftar-bunpou-jlpt.txt atau JLPT no BUNPOU.txt di root repo.');
    process.exit(1);
  }
  const txtPath = fs.existsSync(MASTER_TXT) ? MASTER_TXT : findJlptSourceFile();
  const src = buildJlptSourceInject();
  if (!fs.existsSync(GRAMMAR_PATH)) {
    console.error('ym-grammar-browser.js tidak ada di root repo.');
    process.exit(1);
  }
  let g = fs.readFileSync(GRAMMAR_PATH, 'utf8');
  if (!/const\s+JLPT_BUNPOU_SOURCE\s*=/.test(g)) {
    console.error('Tidak menemukan JLPT_BUNPOU_SOURCE di ym-grammar-browser.js');
    process.exit(1);
  }
  let next = applyJlptSourceToGrammar(g, src);
  next = injectRumusIntoGrammar(next);
  next = patchParseJlptRumus(next);
  if (next === g) {
    console.log('OK — sudah sinkron (daftar + rumus sama dengan ym-grammar-browser.js).');
  } else {
    fs.writeFileSync(GRAMMAR_PATH, next, 'utf8');
    console.log('OK — ym-grammar-browser.js diperbarui (JLPT + rumus bunpou).');
  }
  const text = fs.readFileSync(txtPath, 'utf8');
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).length;
  const patterns = parseJlptBunpouText(text).length;
  console.log('OK —', lines, 'baris,', patterns, 'pola deteksi');
  console.log('     daftar:', txtPath);
  console.log('     grammar:', GRAMMAR_PATH);
  buildCatalogDataFile();
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) bakeJlptIntoGrammar();
