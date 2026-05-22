/**
 * Rumus / pola susun bunpou — di-infer dari teks pola JP.
 * Dipakai katalog HTML + ym-grammar-browser (JLPT).
 */

/** Ambil bacaan dari （よみ） jika ada */
function extractReading(pattern) {
  const m = String(pattern).match(/（([^）]+)）/);
  return m ? m[1].trim() : '';
}

/** Permukaan tanpa furigana */
function surfaceOnly(pattern) {
  return String(pattern)
    .replace(/（[^）]+）/g, '')
    .replace(/〜/g, '～')
    .trim();
}

/**
 * Infer rumus susunan dari pola bunpou.
 * @param {string} pattern — teks JP (mis. 〜ている, ほうがいい)
 * @param {string} [meaning] — arti ID (opsional, untuk hint)
 */
function inferRumus(pattern, meaning) {
  const raw = String(pattern).trim();
  const read = extractReading(raw);
  const s = surfaceOnly(raw);
  if (!s) return '';

  const R = [];

  /** --- Partikel tunggal --- */
  const particles = {
    は: 'Topik + は + predikat',
    が: 'Subjek / penanda + が + …',
    を: 'Objek + を + verba',
    に: 'Tujuan/waktu/tempat + に + …',
    で: 'Tempat/alat/cara + で + …',
    と: 'Bersama/daftar + と + …',
    の: 'Milik/penghubung + の + kata benda',
    へ: 'Arah + へ + …',
    も: 'Juga/sampai + も + …',
    か: '… + か (tanya)',
    よ: '… + よ (penegas)',
    ね: '… + ね (konfirmasi)',
    や: 'A dan B + や + … (dll)',
    から: '… + から (dari/karena)',
    まで: '… + まで (sampai)',
    より: 'A + より + B (lebih … dari …)',
    だけ: '… + だけ (hanya)',
    しか: '… + しか + neg (hanya … tidak …)',
    など: '… + など (dll)',
    って: '… + って (topik kasual)',
    こそ: '… + こそ (justru)',
    さえ: '… + さえ (bahkan)',
    でも: '… + でも (tapi / pun)',
  };
  if (particles[s]) return particles[s];

  /** --- Pola dengan ～ (slot) --- */
  if (/～/.test(s) || /\[A\]/.test(raw)) {
    const slot = '___';
    let formula = s.replace(/\[A\]/g, slot).replace(/～/g, ' ' + slot + ' ');
    formula = formula.replace(/\s+/g, ' ').trim();

    /** Verba + akhiran umum */
    if (/てある$/.test(s)) return `V(て形) + ある → ${formula}`;
    if (/ている|ってる|てる$/.test(s)) return `V(て形) + いる → ${formula}`;
    if (/ていない|てない$/.test(s)) return `V(て形) + ない → ${formula}`;
    if (/てください/.test(s)) return `V(て形) + ください → ${formula}`;
    if (/てはいけない|てはだめ/.test(s)) return `V(て形) + はいけない → ${formula}`;
    if (/てもいい/.test(s)) return `V(て形) + もいい → ${formula}`;
    if (/てから/.test(s)) return `V1(て形) + から + V2 → ${formula}`;
    if (/てみる/.test(s)) return `V(て形) + みる (coba) → ${formula}`;
    if (/ておく/.test(s)) return `V(て形) + おく (persiapan) → ${formula}`;
    if (/てしまう|ちゃう/.test(s)) return `V(て形) + しまう → ${formula}`;
    if (/てくれる|てあげる|てもらう/.test(s))
      return `V(て形) + くれる/あげる/もらう → ${formula}`;
    if (/てほしい/.test(s)) return `V(て形) + ほしい → ${formula}`;
    if (/てくる|ていく/.test(s)) return `V(て形) + くる/いく → ${formula}`;
    if (/てみせる/.test(s)) return `V(て形) + みせる → ${formula}`;
    if (/ないで$/.test(s)) return `V(ない形) + で (tanpa …) → ${formula}`;
    if (/ないでください/.test(s)) return `V(ない形) + でください → ${formula}`;
    if (/ないといけない|なくちゃ|なければ|ねばならない/.test(s))
      return `V(ない形) + … (harus) → ${formula}`;
    if (/なくてもいい/.test(s)) return `V(ない形) + くてもいい → ${formula}`;
    if (/たい$/.test(s)) return `V(ます語干) + たい → ${formula}`;
    if (/たがる/.test(s)) return `V(ます語干) + がる → ${formula}`;
    if (/たことがある/.test(s)) return `V(た形) + ことがある → ${formula}`;
    if (/たり.*たり/.test(s)) return `V(た形) + り … たり → ${formula}`;
    if (/ながら/.test(s)) return `V(ます語干) + ながら + V → ${formula}`;
    if (/ながらも/.test(s)) return `… + ながらも → ${formula}`;
    if (/ように|ような/.test(s)) return `V(辞書/ない形) + ように/ような → ${formula}`;
    if (/ようになる/.test(s)) return `V(辞書形) + ようになる → ${formula}`;
    if (/ようにする/.test(s)) return `V(辞書形) + ようにする → ${formula}`;
    if (/ようと思う/.test(s)) return `V(よう形) + と思う → ${formula}`;
    if (/すぎる/.test(s)) return `V(ます語干) + すぎる → ${formula}`;
    if (/やすい|にくい|づらい|がたい/.test(s)) return `V(ます語干) + やすい/にくい… → ${formula}`;
    if (/させる|せる/.test(s)) return `V(させ形) → ${formula}`;
    if (/られる|れる/.test(s)) return `V(られる形) → ${formula}`;
    if (/ことができる/.test(s)) return `V(辞書形) + ことができる → ${formula}`;
    if (/ことがある/.test(s)) return `V(辞書/た形) + ことがある → ${formula}`;
    if (/ばかり/.test(s)) return `… + ばかり → ${formula}`;
    if (/ば.*ほど/.test(s)) return `V(ば形) … ほど (makin…makin) → ${formula}`;
    if (/ば.*のに/.test(s)) return `V(ば形) … のに → ${formula}`;
    if (/たら|なら|ば/.test(s)) return `V(仮定: たら/なら/ば) + … → ${formula}`;
    if (/かもしれない/.test(s)) return `… + かもしれない → ${formula}`;
    if (/でしょう|だろう/.test(s)) return `… + でしょう/だろう → ${formula}`;
    if (/はずだ|はずがない/.test(s)) return `… + はずだ → ${formula}`;
    if (/べき/.test(s)) return `V(辞書形) + べき → ${formula}`;
    if (/ほうがいい/.test(s)) return `V(た形) + ほうがいい → ${formula}`;
    if (/より.*ほうが|ほうが.*より/.test(s)) return `A + より + B + ほうが → ${formula}`;
    if (/のに/.test(s)) return `… + のに (walaupun) → ${formula}`;
    if (/ので/.test(s)) return `… + ので (karena) → ${formula}`;
    if (/ために/.test(s)) return `… + ために (demi/karena) → ${formula}`;
    if (/について|に関して|によると|によって/.test(s))
      return `N + について/によると/によって → ${formula}`;
    if (/にする|くする/.test(s)) return `… + にする/くする (menjadi) → ${formula}`;
    if (/に行く/.test(s)) return `V(ます語干) + に行く → ${formula}`;
    if (/がほしい|が欲しい/.test(s)) return `N + が + ほしい → ${formula}`;
    if (/があります|がいます/.test(s)) return `N + が + あります/います → ${formula}`;
    if (/なければ|ないと/.test(s)) return `V(ない形) + … → ${formula}`;
    if (/かどうか/.test(s)) return `… + かどうか → ${formula}`;
    if (/という|といって|と言/.test(s)) return `… + という/と言う → ${formula}`;
    if (/と思う|と思った/.test(s)) return `… + と思う → ${formula}`;
    if (/て$|で$/.test(s) && s.length <= 6) return `V1(て形) + V2 → ${formula}`;
    if (/する$/.test(s)) return `N/語干 + する → ${formula}`;
    if (/になる|くなる/.test(s)) return `… + になる/くなる → ${formula}`;

    return formula;
  }

  /** --- Pola utuh tanpa ～ --- */
  if (/ている|っている|ってる|てる$/.test(s)) return 'V(て形) + いる · contoh: 食べる→食べている';
  if (/てある/.test(s)) return 'V(て形) + ある (hasil masih ada)';
  if (/てください/.test(s)) return 'V(て形) + ください';
  if (/てはいけない|てはだめ/.test(s)) return 'V(て形) + はいけない';
  if (/てもいい/.test(s)) return 'V(て形) + もいいです';
  if (/ないでください/.test(s)) return 'V(ない形) + でください';
  if (/ないといけない|なくちゃ|なければ|ねばならない/.test(s))
    return 'V(ない形) + いけない/なければ (harus)';
  if (/なくてもいい/.test(s)) return 'V(ない形) + くてもいい (boleh tidak …)';
  if (/ほうがいい/.test(s)) return 'V(た形) + ほうがいい · 食べる→食べたほうがいい';
  if (/より.*ほうが/.test(s)) return 'A + より + B + ほうがいい';
  if (/たい$/.test(s)) return 'V(ます語干) + たい · 行く→行きたい';
  if (/たことがある/.test(s)) return 'V(た形) + ことがある';
  if (/ことができる/.test(s)) return 'V(辞書形) + ことができる';
  if (/ながら/.test(s)) return 'V(ます語干) + ながら + V';
  if (/ように|ような/.test(s)) return 'V(辞書/ない) + ように/ような';
  if (/ようになる/.test(s)) return 'V(辞書形) + ようになる';
  if (/ようにする/.test(s)) return 'V(辞書形) + ようにする';
  if (/かもしれない/.test(s)) return '… + かもしれない';
  if (/でしょう|だろう/.test(s)) return '… + でしょう / だろう';
  if (/はずだ/.test(s)) return '… + はずだ (pasti/harusnya)';
  if (/はずがない/.test(s)) return '… + はずがない (mustahil)';
  if (/べきだ/.test(s)) return 'V(辞書形) + べきだ (seharusnya)';
  if (/すぎる/.test(s)) return 'V(ます語干) + すぎる';
  if (/やすい/.test(s)) return 'V(ます語干) + やすい';
  if (/にくい|づらい|がたい/.test(s)) return 'V(ます語干) + にくい/づらい';
  if (/させる|せる/.test(s)) return 'V(させる) · 食べる→食べさせる';
  if (/られる/.test(s)) return 'V(られる) · 食べる→食べられる';
  if (/ちゃいけない|じゃいけない|てはいけない/.test(s))
    return 'V(て形) + ちゃ/じゃいけない (gak boleh)';
  if (/じゃない|ではない/.test(s)) return '… + じゃない / ではない';
  if (/だ$|です$/.test(s) && s.length <= 4) return 'N/na-adj + だ/です';
  if (/について/.test(s)) return 'N + について';
  if (/によると|によれば/.test(s)) return '… + によると/によれば';
  if (/によって/.test(s)) return '… + によって';
  if (/ために/.test(s)) return '… + ために';
  if (/ので/.test(s)) return '… + ので';
  if (/のに/.test(s)) return '… + のに';
  if (/のです|んです/.test(s)) return '… + のです/んです (penjelasan)';
  if (/がほしい/.test(s)) return 'N + が + ほしい';
  if (/があります/.test(s)) return 'N(物) + があります';
  if (/がいます/.test(s)) return 'N(生) + がいます';
  if (/において|における/.test(s)) return 'N + において/における';
  if (/にとって/.test(s)) return 'N + にとって';
  if (/に対して/.test(s)) return 'A + に対して + B';
  if (/かけて|から.*に/.test(s)) return 'A + から + B + にかけて';
  if (/っぽい|げ$|びる|ぶる/.test(s)) return '語干 + っぽい/げ/びる (nuansa)';
  if (/かけて/.test(s)) return '… + かける (setengah jalan)';
  if (/出す$/.test(s)) return 'V(ます語干) + 出す (mulai tiba-tiba)';
  if (/続ける|通す|切る|直す|合う|込む/.test(s))
    return `V(語干) + ${s.match(/[一-龯ぁ-ん]+$/)[0] || '…'} (aspek verba)`;
  if (/い-adjectives|な-adjectives/.test(s))
    return s.includes('い-adj') ? 'い形容詞 + い' : 'な形容詞 + な + N';

  /** --- Pola berpasangan ～…～ --- */
  if (/～|〜/.test(s)) {
    const paired = s.replace(/[〜～]/g, ' ___ ').replace(/\s+/g, ' ').trim();
    if (/か.*か/.test(s)) return `A + か + B + か (atau) → ${paired}`;
    if (/たり.*たり/.test(s)) return `V(た形) + り … たり → ${paired}`;
    if (/とか.*とか/.test(s)) return `A + とか + B + とか → ${paired}`;
    if (/やら.*やら|だの.*だの|なり.*なり/.test(s))
      return `A + … + B + … (macam-macam) → ${paired}`;
    if (/も.*も|ば.*も|ても.*ても|ようが.*ようが|ようと.*ようと/.test(s))
      return `… + も/ば/ても … (baik…maupun…) → ${paired}`;
    if (/ないか.*ないか|か～ないか/.test(s))
      return `V(辞書形) + か … ないか → ${paired}`;
    return `… ～ … → ${paired}`;
  }

  /** --- Konstruksi umum N5–N1 --- */
  if (/^方$|方（/.test(s)) return 'V(ます語干) + 方 · 読む→読み方';
  if (/つもり/.test(s)) return 'V(辞書形) + つもり (niat/rencana)';
  if (/とき/.test(s)) return 'V(辞書/た形) + とき (saat/ketika)';
  if (/前に/.test(s)) return 'V(辞書形) + 前に (sebelum)';
  if (/一緒に/.test(s)) return '… + と + 一緒に (bersama)';
  if (/いつも|よく|ときどき/.test(s)) return '… + ' + s + ' (frekuensi)';
  if (/一番/.test(s)) return '… + が + 一番 (paling)';
  if (/のが好き|のが上手|のが下手/.test(s))
    return 'V(辞書形) + の + が + 好き/上手/下手';
  if (/の中で/.test(s)) return '… + の中で + [A] + が + 一番';
  if (/ませんか|ましょうか/.test(s)) return 'V(ます形) + ませんか / ましょうか (ajakan)';
  if (/ましょう/.test(s)) return 'V(ます形) + ましょう (ayo)';
  if (/をください/.test(s)) return 'N + を + ください';
  if (/が必要|必要がある/.test(s)) return 'N + が + 必要 / V(辞書形) + 必要がある';
  if (/がする/.test(s)) return 'N + が + する (terasa/terdengar)';
  if (/がり|がる|がっている/.test(s)) return 'V(ます語干) + がる / がっている';
  if (/こと$|こと（|ということ/.test(s))
    return 'V(辞書形) + こと / … + ということ (nominalisasi)';
  if (/ことになる|ことにする|ことはない|ことだ/.test(s))
    return `… + こと + … → ${s}`;
  if (/みたいだ|みたいな|みたいに|みたい/.test(s))
    return 'N/na-adj + みたいだ/な/に · 夢みたいな話';
  if (/そうだ|そうに|そうな|そうも/.test(s))
    return '語干 + そうだ/そうな (kelihatan/katanya)';
  if (/らしい/.test(s)) return '… + らしい (katanya/rupa-rupanya)';
  if (/ばかり|だけ|しか|ばかりに|だけに|だけで|だけあって/.test(s))
    return `… + ${s.match(/ばかり|だけ|しか/)[0]} + … → ${s}`;
  if (/わけ/.test(s)) return `… + わけ + … → ${s}`;
  if (/もの|もん/.test(s)) return `… + もの/もん + … → ${s}`;
  if (/はず/.test(s)) return `… + はず + … → ${s}`;
  if (/べき|べから|べく/.test(s)) return `V(辞書形) + べき/べく + … → ${s}`;
  if (/において|における|に関して|に関する|に対して|にとって|に比べ|に慣れ|に違いない|に越した|に限|に伴|に沿|に基づ|に応|に際|に先立|に向か|に加え|に反して|にかけて|にかわり|には|による|によって/.test(s))
    return `N + ${s.replace(/（[^）]+）/g, '')} → …`;
  if (/を中心|をはじめ|を込めて|を通じ|を通して|を契機|をめぐって|をもとに|を除いて|を問わず|を限り|を兼ね|を皮切り|を機に|を禁じ|をものとも|をもって|をおいて|を踏まえ|を経て|を控え|を前提|を余儀|を押し|を境に/.test(s))
    return `N + を + … / … + を + … → ${s}`;
  if (/^お|^ご|お～|ご～/.test(s)) return 'お/ご + … (awalan sopan)';
  if (/受身形|使役|意向形|可能形|他動詞|自動詞/.test(s))
    return `Bentuk / jenis verba: ${s}`;
  if (/ます$|ません|でした|でござい|ござい|いたし|いらっしゃ|なさい|なさる|願う/.test(s))
    return `… + ${s.replace(/（[^）]+）/g, '')} (bentuk sopan/hormat)`;
  if (/ない|ぬ|ずに|ず$/.test(s)) return `V/i-adj + ない/ぬ/ず + … → ${s}`;
  if (/だらけ|ずくめ|っぱなし|きり|まみれ|放題|尽くす|通す|抜く|切る|直す|合う|込む|出す|続け|始め|終わ|上げ|下げ|得る|得ない|かねる|かねない/.test(s))
    return `V(語干) + ${s.replace(/（[^）]+）/g, '').slice(-4)} … → ${s}`;
  if (/にする|くする|になる|くなる|なる$/.test(s))
    return '… + にする/くする/になる (menjadi)';
  if (/と思う|と言|という|といって|と聞|と考え|とみえる|とすれば|としたら|とすると|と共に|と同時|とおり|として|とか|ところ|とても|とて|とは|とあれば|とあって|とばかり|といえ|といい|といって|という|とみる|とされる|とりわけ/.test(s))
    return `… + と + … / … + という + … → ${s}`;
  if (/から|まで|より|ほど|くらい|ぐらい|ばかり|さえ|こそ|でも|けど|けれど|しかし|または|つまり|なお|一方|反面|および|ちなみに|それでも|ところが|さて|それとも|むしろ|なぜなら|そのため|おかげ|せいで|せいぜい|ぜひ|きっと|どうして|どうやって|どんな|どうせ|どうやら|どころ|いわゆる|いよいよ|いきなり|一応|以外|以上|以下|際に|最中|さらに|すでに|すなわち|結局|結果|確かに|例えば|要するに|ゆえに|およそ|折に|手前|始末|そばから|やがて|とっくに|つい|ついに|ついで|ふと|わざと|わざわざ|あまり|まるで|まさか|さすが|なかなか|めったに|決して|全然|ろくに|少しも|全く|何も|必ず|恐らく|さぞ|案の定|敢えて|あくまで|あらかじめ/.test(s))
    return `… + ${s.replace(/（[^）]+）/g, '').slice(0, 12)} + … → ${s}`;
  if (/に[一-龯ぁ-ん]{2,}/.test(s))
    return `N + に + … → ${s.replace(/（[^）]+）/g, '')}`;
  if (/を[一-龯ぁ-ん]{2,}/.test(s))
    return `N + を + … → ${s.replace(/（[^）]+）/g, '')}`;
  if (/^だ$|^です$|ではない|じゃない/.test(s))
    return 'N / na-adj + だ・です / じゃない・ではない';
  if (/予定|つもりだった|つもりで/.test(s)) return `… + ${s} → rencana/niat`;
  if (/\[A\]/.test(raw)) return s.replace(/\[A\]/g, '___') + ' · [A] = slot kosakata';

  if (read) R.push('Bacaan: ' + read);
  R.push('Susunan: ' + s);
  return R.join(' · ');
}

/** Rumus dasar JLPT (referensi cepat) */
const RUMUS_DASAR = [
  {
    title: 'Bentuk て (te-form)',
    lines: [
      'Grup 1 (u): 食べる → 食べて · 書く → 書いて',
      'Grup 2 (ru): 見る → 見て · 起きる → 起きて',
      'Grup 3 (する/来る): する → して · 来る → 来て',
      'Grup 5 (u→tte): 立つ → 立って · 買う → 買って',
      'Irreg: 行く → 行って · する → して',
    ],
  },
  {
    title: 'Bentuk ない (nai-form)',
    lines: [
      'Grup 1: 食べる → 食べない',
      'Grup 2: 見る → 見ない',
      'Grup 3: する → しない · 来る → 来ない',
      'Grup 5: 立つ → 立たない',
    ],
  },
  {
    title: 'Bentuk た (ta-form)',
    lines: ['Sama seperti て-form, tapi akhiran た: 食べて→食べた · 見て→見た'],
  },
  {
    title: 'い adj / な adj',
    lines: [
      'い: 高い → 高くない / 高かった · 高く + V',
      'な: 静か → 静かな + N · 静かじゃない',
    ],
  },
  {
    title: 'Slot ～ di daftar kamu',
    lines: [
      '～ = tempat kosakata (verba/kata benda)',
      'Contoh: ～ている = [verba-te] + いる',
      'Contoh: ～ほうがいい = [verba-ta] + ほうがいい',
    ],
  },
];

/**
 * Contoh kalimat JP + terjemahan ID per pola bunpou.
 */


const V = {
  dict: '食べる',
  te: '食べて',
  ta: '食べた',
  nai: '食べない',
  stem: '食べ',
  masu: '食べます',
  tai: '食べたい',
  reru: '食べられる',
};

/** みたい (seperti) — jangan tertukar dengan たい (ingin) di dalam みたいな/に */
function isMitaiPola(s) {
  return /みたい/.test(s);
}

/** @returns {{ jp: string, id: string }} */
function inferContoh(pattern, meaning) {
  const raw = String(pattern).trim();
  const s = surfaceOnly(raw);
  if (!s) return { jp: '', id: '' };

  const exact = EXACT[s] || EXACT[raw];
  if (exact) return exact;

  if (isMitaiPola(s)) {
    if (/みたいに/.test(s)) return EXACT['みたいに'];
    if (/みたいな/.test(s)) return EXACT['みたいな'];
    if (/みたいだ/.test(s)) return EXACT['みたいだ'];
    return EXACT['みたいだ'];
  }

  if (/～|〜/.test(s) || /\[A\]/.test(raw)) {
    return contohSlot(s, raw, meaning);
  }

  for (const [re, fn] of RULES) {
    if (re.test(s)) return fn(s, meaning);
  }

  if (s.length === 1 && PARTICLE_EX[s]) return PARTICLE_EX[s];

  return {
    jp: `…${s.replace(/（[^）]+）/g, '')}…`,
    id: meaning ? `… (${meaning.split(';')[0].trim()}) …` : '…',
  };
}

const PARTICLE_EX = {
  は: { jp: '私は学生です。', id: 'Saya adalah pelajar.' },
  が: { jp: '雨が降っています。', id: 'Hujan sedang turun.' },
  を: { jp: '本を読みます。', id: 'Membaca buku.' },
  に: { jp: '学校に行きます。', id: 'Pergi ke sekolah.' },
  で: { jp: '電車で行きます。', id: 'Pergi naik kereta.' },
  と: { jp: '友達と話します。', id: 'Ngobrol dengan teman.' },
  の: { jp: 'これは私の本です。', id: 'Ini buku saya.' },
  へ: { jp: '日本へ行きます。', id: 'Pergi ke Jepang.' },
  も: { jp: '私も行きます。', id: 'Saya juga pergi.' },
  か: { jp: 'これは本ですか。', id: 'Apakah ini buku?' },
  よ: { jp: '行きますよ。', id: 'Pergi, loh.' },
  ね: { jp: 'いいですね。', id: 'Bagus ya?' },
  や: { jp: 'りんごやバナナを買う。', id: 'Beli apel dan pisang (dll).' },
  から: { jp: '九時から働きます。', id: 'Kerja dari jam sembilan.' },
  まで: { jp: '五時まで働きます。', id: 'Kerja sampai jam lima.' },
  より: { jp: '電車の方がバスより早いです。', id: 'Kereta lebih cepat daripada bus.' },
  だけ: { jp: '水だけ飲みます。', id: 'Minum air saja.' },
  しか: { jp: '水しか飲みません。', id: 'Hanya minum air (tidak yang lain).' },
  など: { jp: 'りんごやバナナなどを買う。', id: 'Beli apel, pisang, dan sejenisnya.' },
  って: { jp: '明日って、雨？', id: 'Besok katanya hujan?' },
  こそ: { jp: '今こそチャンスだ。', id: 'Justru sekarang kesempatannya.' },
  さえ: { jp: '名前さえ書けない。', id: 'Bahkan nama saja tidak bisa ditulis.' },
  でも: { jp: '雨でも行きます。', id: 'Meski hujan tetap pergi.' },
};

const EXACT = {
  'だ / です': { jp: '私は学生です。', id: 'Saya adalah pelajar.' },
  です: { jp: 'これは本です。', id: 'Ini buku.' },
  だ: { jp: '学生だ。', id: 'Dia pelajar.' },
  'じゃない・ではない': { jp: '学生じゃない。', id: 'Bukan pelajar.' },
  ちゃいけない: { jp: 'ここで食べちゃいけない。', id: 'Di sini tidak boleh makan.' },
  じゃいけない: { jp: 'ここで食べじゃいけない。', id: 'Di sini tidak boleh makan.' },
  だろう: { jp: '明日は雨だろう。', id: 'Besok mungkin hujan.' },
  でしょう: { jp: '明日は雨でしょう。', id: 'Besok mungkin hujan, ya?' },
  どんな: { jp: 'どんな音楽が好き？', id: 'Musik jenis apa yang kamu suka?' },
  どうして: { jp: 'どうして来なかったの？', id: 'Kenapa tidak datang?' },
  どうやって: { jp: 'どうやって行く？', id: 'Gimana caranya pergi?' },
  があります: { jp: '机の上に本があります。', id: 'Ada buku di atas meja.' },
  がいます: { jp: '部屋に猫がいます。', id: 'Ada kucing di kamar.' },
  がほしい: { jp: '新しい靴がほしい。', id: 'Pengen sepatu baru.' },
  ほうがいい: { jp: '早く寝たほうがいい。', id: 'Sebaiknya tidur cepat.' },
  'い-adjectives': { jp: 'このりんごは高い。', id: 'Apel ini mahal.' },
  'な-adjectives': { jp: '静かな部屋です。', id: 'Kamar yang tenang.' },
  一番: { jp: '富士山が一番高い。', id: 'Fuji-san yang paling tinggi.' },
  一緒に: { jp: '友達と一緒に行く。', id: 'Pergi bareng teman.' },
  いつも: { jp: 'いつも朝ごはんを食べる。', id: 'Selalu sarapan.' },
  'か～か': { jp: 'コーヒーか紅茶か、どっち？', id: 'Kopi atau teh, mana?' },
  方: { jp: 'この食べ方はおいしい。', id: 'Cara makan ini enak.' },
  けど: { jp: '雨だけど、行く。', id: 'Hujan tapi tetap pergi.' },
  けれども: { jp: '雨けれども、行く。', id: 'Meski hujan tetap pergi.' },
  まだ: { jp: 'まだ食べていない。', id: 'Belum makan.' },
  'まだ～ていません': { jp: 'まだ宿題をしていません。', id: 'Belum mengerjakan PR.' },
  まで: { jp: '五時まで待つ。', id: 'Menunggu sampai jam lima.' },
  前に: { jp: '食べる前に手を洗う。', id: 'Cuci tangan sebelum makan.' },
  ませんか: { jp: '一緒に行きませんか。', id: 'Mau pergi bareng?' },
  ましょう: { jp: '一緒に行きましょう。', id: 'Ayo pergi bareng.' },
  ましょうか: { jp: '手伝いましょうか。', id: 'Perlu bantuan?' },
  もう: { jp: 'もう食べた。', id: 'Sudah makan.' },
  ないで: { jp: '食べないでください。', id: 'Jangan makan.' },
  ないでください: { jp: '入らないでください。', id: 'Jangan masuk.' },
  ないといけない: { jp: '行かないといけない。', id: 'Harus pergi.' },
  なくてもいい: { jp: '行かなくてもいい。', id: 'Tidak harus pergi.' },
  なくちゃ: { jp: '行かなくちゃ。', id: 'Harus pergi.' },
  なる: { jp: '医者になりたい。', id: 'Pengen jadi dokter.' },
  んです: { jp: '頭が痛いんです。', id: 'Kepalanya sakit (penjelasan).' },
  に行く: { jp: '日本に行く。', id: 'Pergi ke Jepang.' },
  にする: { jp: 'コーヒーにする。', id: 'Memilih kopi.' },
  'に/へ': { jp: '学校へ行く。', id: 'Pergi ke sekolah.' },
  のです: { jp: '忙しいんです。', id: 'Sibuk (penjelasan).' },
  'のが下手': { jp: '歌うのが下手だ。', id: 'Tidak jago nyanyi.' },
  'のが上手': { jp: '料理するのが上手だ。', id: 'Jago masak.' },
  'のが好き': { jp: '音楽を聞くのが好きだ。', id: 'Suka dengar musik.' },
  ので: { jp: '雨なので行かない。', id: 'Karena hujan tidak pergi.' },
  をください: { jp: '水をください。', id: 'Tolong beri air.' },
  すぎる: { jp: '食べすぎた。', id: 'Makan kelewatan.' },
  たことがある: { jp: '富士山に行ったことがある。', id: 'Pernah ke Fuji-san.' },
  たい: { jp: '日本に行きたい。', id: 'Pengen ke Jepang.' },
  'たり～たり': { jp: '本を読んだり、音楽を聞いたりする。', id: 'Baca buku, dengar musik, dll.' },
  てある: { jp: '窓が開けてある。', id: 'Jendela sudah dibuka (masih begitu).' },
  ている: { jp: '今、ご飯を食べている。', id: 'Sekarang sedang makan.' },
  てから: { jp: '食べてから、行く。', id: 'Setelah makan, pergi.' },
  てください: { jp: '塩を取ってください。', id: 'Tolong ambilkan garam.' },
  てはいけない: { jp: 'ここで食べてはいけない。', id: 'Di sini tidak boleh makan.' },
  てもいいです: { jp: '入ってもいいです。', id: 'Boleh masuk.' },
  とき: { jp: '子供のとき、よく遊んだ。', id: 'Waktu kecil sering main.' },
  とても: { jp: 'とてもおいしい。', id: 'Sangat enak.' },
  つもり: { jp: '明日行くつもりだ。', id: 'Berniat pergi besok.' },
  'は〜より・・・です': { jp: '電車はバスより速いです。', id: 'Kereta lebih cepat daripada bus.' },
  はどうですか: { jp: 'コーヒーはどうですか。', id: 'Gimana kalau kopi?' },
  'より～ほうが': { jp: '歩くより走ったほうが早い。', id: 'Lari lebih cepat daripada jalan.' },
  ば: { jp: '雨が降れば、行かない。', id: 'Kalau hujan, tidak pergi.' },
  たら: { jp: '雨が降ったら、行かない。', id: 'Kalau turun hujan, tidak pergi.' },
  なら: { jp: '時間があるなら、行こう。', id: 'Kalau ada waktu, ayo pergi.' },
  かもしれない: { jp: '明日は雨かもしれない。', id: 'Besok mungkin hujan.' },
  ことができる: { jp: '日本語を話すことができる。', id: 'Bisa berbahasa Jepang.' },
  ことがある: { jp: '時々遅刻することがある。', id: 'Kadang terlambat.' },
  ながら: { jp: '音楽を聞きながら勉強する。', id: 'Belajar sambil dengar musik.' },
  ように: { jp: '忘れないように書く。', id: 'Menulis supaya tidak lupa.' },
  ような: { jp: '夢のような話。', id: 'Cerita seperti mimpi.' },
  ようになる: { jp: '日本語が話せるようになった。', id: 'Jadi bisa bahasa Jepang.' },
  ようにする: { jp: '毎日運動するようにしている。', id: 'Berusaha olahraga tiap hari.' },
  について: { jp: '日本文化について話す。', id: 'Bicara tentang budaya Jepang.' },
  によって: { jp: '人によって違う。', id: 'Beda tergantung orang.' },
  によると: { jp: '天気予報によると、雨だ。', id: 'Menurut prakiraan cuaca, hujan.' },
  ために: { jp: '健康のために運動する。', id: 'Olahraga demi kesehatan.' },
  わけだ: { jp: '忙しいわけだ。', id: 'Pantesan sibuk.' },
  わけではない: { jp: '嫌いなわけではない。', id: 'Bukan berarti tidak suka.' },
  べきだ: { jp: 'もっと勉強すべきだ。', id: 'Seharusnya belajar lebih.' },
  かどうか: { jp: '行くかどうか、まだ決めていない。', id: 'Belum putus mau pergi atau tidak.' },
  という: { jp: '田中さんという人。', id: 'Orang bernama Tanaka.' },
  と思う: { jp: 'いいと思う。', id: 'Kupikir bagus.' },
  らしい: { jp: '雨らしい。', id: 'Katanya hujan.' },
  みたいだ: { jp: '雨みたいだ。', id: 'Kayak hujan.' },
  みたいな: { jp: '夢みたいな話。', id: 'Cerita seperti mimpi.' },
  みたいに: { jp: '子供みたいに遊ぶ。', id: 'Bermain seperti anak-anak.' },
  そうだ: { jp: '雨が降りそうだ。', id: 'Kayaknya mau hujan.' },
  はずだ: { jp: 'もう着いたはずだ。', id: 'Harusnya sudah sampai.' },
  ばかり: { jp: '来たばかりだ。', id: 'Baru saja datang.' },
  すぎる: { jp: '食べすぎた。', id: 'Kelewatan makan.' },
  やすい: { jp: '読みやすい本。', id: 'Buku yang mudah dibaca.' },
  にくい: { jp: '食べにくい。', id: 'Susah dimakan.' },
  させる: { jp: '子供に野菜を食べさせる。', id: 'Menyuruh anak makan sayur.' },
  られる: { jp: '日本語が話せる。', id: 'Bisa berbahasa Jepang.' },
  てみる: { jp: '作ってみる。', id: 'Coba buat.' },
  ておく: { jp: '予約しておく。', id: 'Reservasi dulu (persiapan).' },
  てしまう: { jp: '食べてしまった。', id: 'Sudah termakan (habis).' },
  てくれる: { jp: '母が作ってくれた。', id: 'Ibu masakkan untuk saya.' },
  てもらう: { jp: '友達に教えてもらった。', id: 'Diajari teman.' },
  てあげる: { jp: '妹に教えてあげた。', id: 'Mengajari adik.' },
  てほしい: { jp: '早く来てほしい。', id: 'Pengen dia cepat datang.' },
  なくてはいけない: { jp: '行かなくてはいけない。', id: 'Harus pergi.' },
  なければならない: { jp: '行かなければならない。', id: 'Harus pergi.' },
  ざるを得ない: { jp: '行かざるを得ない。', id: 'Terpaksa harus pergi.' },
  ねばならない: { jp: '行かねばならない。', id: 'Harus pergi.' },
};

const RULES = [
  [/ている|ってる|てる$/, () => ({ jp: '今、ご飯を食べている。', id: 'Sekarang sedang makan.' })],
  [/てある/, () => ({ jp: '窓が開けてある。', id: 'Jendela sudah dibuka (masih begitu).' })],
  [/てください/, () => ({ jp: '塩を取ってください。', id: 'Tolong ambilkan garam.' })],
  [/てはいけない|ちゃいけない|じゃいけない/, () => ({ jp: 'ここで食べてはいけない。', id: 'Tidak boleh makan di sini.' })],
  [/てもいい/, () => ({ jp: '入ってもいいです。', id: 'Boleh masuk.' })],
  [/ないでください/, () => ({ jp: '入らないでください。', id: 'Jangan masuk.' })],
  [/ないといけない|なくちゃ|なければ|ねばならない/, () => ({ jp: '行かないといけない。', id: 'Harus pergi.' })],
  [/なくてもいい/, () => ({ jp: '行かなくてもいい。', id: 'Tidak harus pergi.' })],
  [/ほうがいい/, () => ({ jp: '早く寝たほうがいい。', id: 'Sebaiknya tidur cepat.' })],
  [/みたいに/, () => EXACT['みたいに'] ],
  [/みたいな/, () => EXACT['みたいな'] ],
  [/みたいだ|みたい/, () => EXACT['みたいだ'] ],
  [/たい$/, (st) => (isMitaiPola(st) ? EXACT['みたいだ'] : { jp: '日本に行きたい。', id: 'Pengen ke Jepang.' })],
  [/たことがある/, () => ({ jp: '富士山に行ったことがある。', id: 'Pernah ke Fuji-san.' })],
  [/ことができる/, () => ({ jp: '日本語を話すことができる。', id: 'Bisa berbahasa Jepang.' })],
  [/かもしれない/, () => ({ jp: '明日は雨かもしれない。', id: 'Besok mungkin hujan.' })],
  [/でしょう|だろう/, () => ({ jp: '明日は雨でしょう。', id: 'Besok mungkin hujan.' })],
  [/はず/, () => ({ jp: 'もう着いたはずだ。', id: 'Harusnya sudah sampai.' })],
  [/べき/, () => ({ jp: 'もっと勉強すべきだ。', id: 'Seharusnya belajar lebih.' })],
  [/すぎる/, () => ({ jp: '食べすぎた。', id: 'Makan kelewatan.' })],
  [/やすい/, () => ({ jp: '読みやすい。', id: 'Mudah dibaca.' })],
  [/にくい|づらい|がたい/, () => ({ jp: '食べにくい。', id: 'Susah dimakan.' })],
  [/させる|せる/, () => ({ jp: '子供に野菜を食べさせる。', id: 'Menyuruh anak makan sayur.' })],
  [/られる|れる/, () => ({ jp: '日本語が話せる。', id: 'Bisa berbahasa Jepang.' })],
  [/ながら/, () => ({ jp: '音楽を聞きながら勉強する。', id: 'Belajar sambil dengar musik.' })],
  [/ように|ような/, () => ({ jp: '忘れないように書く。', id: 'Menulis supaya tidak lupa.' })],
  [/ようになる/, () => ({ jp: '話せるようになった。', id: 'Jadi bisa (berbicara).' })],
  [/ようにする/, () => ({ jp: '毎日運動するようにしている。', id: 'Berusaha olahraga tiap hari.' })],
  [/のに/, () => ({ jp: '雨なのに行く。', id: 'Walaupun hujan tetap pergi.' })],
  [/ので/, () => ({ jp: '雨なので行かない。', id: 'Karena hujan tidak pergi.' })],
  [/ために/, () => ({ jp: '健康のために運動する。', id: 'Olahraga demi kesehatan.' })],
  [/について/, () => ({ jp: '日本文化について話す。', id: 'Bicara tentang budaya Jepang.' })],
  [/によって|によると/, () => ({ jp: '人によって違う。', id: 'Beda tergantung orang.' })],
  [/わけ/, () => ({ jp: '忙しいわけだ。', id: 'Pantesan sibuk.' })],
  [/もの|もん/, () => ({ jp: '食べるものは何？', id: 'Mau makan apa?' })],
  [/こと/, () => ({ jp: '読むことが好きだ。', id: 'Suka membaca.' })],
  [/という/, () => ({ jp: '田中さんという人。', id: 'Orang bernama Tanaka.' })],
  [/と思う/, () => ({ jp: 'いいと思う。', id: 'Kupikir bagus.' })],
  [/において|における/, () => ({ jp: '日本において有名だ。', id: 'Terkenal di Jepang.' })],
  [/にとって/, () => ({ jp: '私にとって大切だ。', id: 'Penting bagi saya.' })],
  [/に対して/, () => ({ jp: '先生に対して失礼だ。', id: 'Kasar terhadap guru.' })],
  [/限り|かぎり/, () => ({ jp: '生きている限り、夢を追う。', id: 'Selama hidup mengejar mimpi.' })],
  [/次第|しだい/, () => ({ jp: '到着次第、連絡します。', id: 'Begitu sampai akan hubungi.' })],
  [/につれて/, () => ({ jp: '年を取るにつれて、忘れやすい。', id: 'Seiring bertambahnya usia, mudah lupa.' })],
  [/に伴って|にともなって/, () => ({ jp: '経済成長に伴って、生活が豊かになった。', id: 'Seiring pertumbuhan ekonomi, hidup makmur.' })],
  [/にもかかわらず|にも関わらず/, () => ({ jp: '雨にもかかわらず、行った。', id: 'Walaupun hujan tetap pergi.' })],
  [/からこそ/, () => ({ jp: '友達がいるからこそ、頑張れる。', id: 'Justru karena ada teman bisa semangat.' })],
  [/どころか/, () => ({ jp: '休むどころか、忙しい。', id: 'Jangankan istirahat, malah sibuk.' })],
  [/いわゆる/, () => ({ jp: 'いわゆる天才だ。', id: 'Yang disebut jenius.' })],
  [/せいで/, () => ({ jp: '雨のせいで中止だ。', id: 'Gara-gara hujan dibatalkan.' })],
  [/おかげで/, () => ({ jp: '先生のおかげで合格した。', id: 'Berkat guru, lulus.' })],
  [/っぽい/, () => ({ jp: '子供っぽい。', id: 'Keliatan kekanak-kanakan.' })],
  [/だらけ|ずくめ|まみれ/, () => ({ jp: '泥だらけだ。', id: 'Penuh lumpur.' })],
  [/かけて/, () => ({ jp: '書きかけの手紙。', id: 'Surat yang setengah ditulis.' })],
  [/出す$/, () => ({ jp: '突然泣き出した。', id: 'Tiba-tiba menangis.' })],
  [/続ける|通す|切る|直す|合う|込む/, (s) => {
    const suf = (s.match(/[一-龯ぁ-ん]+$/) || [''])[0];
    return { jp: `…${V.te}${suf}…`, id: `Contoh pola verba + ${suf}` };
  }],
];

function contohSlot(s, raw, meaning) {
  let jp = s;
  const rep = [
    [/～ている|〜ている/, '食べている'],
    [/～てください/, '食べてください'],
    [/～てはいけない/, '食べてはいけない'],
    [/～てもいい/, '食べてもいい'],
    [/～ないで/, '食べないで'],
    [/～ないといけない|～なくちゃ|～なければ/, '行かないといけない'],
    [/～なくてもいい/, '行かなくてもいい'],
    [/～たい/, '行きたい'],
    [/～たことがある/, '行ったことがある'],
    [/～ことができる/, '話すことができる'],
    [/～ほうがいい/, '早く寝たほうがいい'],
    [/～ように/, '忘れないように'],
    [/～ような/, '夢のような'],
    [/～かもしれない/, '雨かもしれない'],
    [/～でしょう|～だろう/, '雨でしょう'],
    [/～ば/, '雨が降れば'],
    [/～たら/, '雨が降ったら'],
    [/～なら/, '時間があるなら'],
    [/～のに/, '雨なのに'],
    [/～ので/, '雨なので'],
    [/～ために/, '健康のために'],
    [/～について/, '文化について'],
    [/～によって/, '人によって'],
    [/～より.*ほうが|～ほうが.*より/, '歩くより走ったほうが早い'],
    [/～ても/, '雨が降っても'],
    [/～ない/, '行かない'],
    [/～たり.*～たり|～たり～たり/, '本を読んだり音楽を聞いたり'],
    [/～か～か/, 'コーヒーか紅茶か'],
    [/\[A\]/, '富士山'],
    [/～/, '食べる'],
  ];
  for (const [re, w] of rep) {
    if (re.test(jp) || re.test(raw)) {
      jp = jp.replace(/[〜～]+/g, w).replace(/\[A\]/g, w);
      break;
    }
  }
  jp = jp.replace(/（[^）]+）/g, '').replace(/\s+/g, '');
  if (!/[。！？]$/.test(jp)) jp += '。';
  const id = meaning
    ? meaning.split(';')[0].trim().replace(/^./, (c) => c.toUpperCase()) + '.'
    : 'Contoh kalimat.';
  return { jp, id: `Contoh: ${id}` };
}

window.inferRumus = inferRumus;
window.RUMUS_DASAR = RUMUS_DASAR;
window.inferContoh = inferContoh;
