/**
 * Contoh kalimat JP + terjemahan ID per pola bunpou.
 */
import { surfaceOnly } from './bunpou-rumus.js';

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
export function inferContoh(pattern, meaning) {
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
