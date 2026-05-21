/** Analisis tata bahasa Jepang — fokus JLPT N5 (halaman lagu YumeSubs). */
(function (global) {
  /** Pola N5+ — urut panjang dulu agar match yang spesifik menang. */
  const PHRASES_RAW = [
    ['ませんでした', 'Masen deshita', 'N5 · Lampau negatif sopan.', 'masen-deshita'],
    ['ませんでした', 'Masen deshita', 'N5 · Tidak (lampau, sopan).', 'masen-deshita'],
    ['てはいけない', 'Te wa ikenai', 'N5 · Dilarang / tidak boleh.', 'te-wa-ikenai'],
    ['てはいけません', 'Te wa ikemasen', 'N5 · Dilarang (sopan).', 'te-wa-ikemasen'],
    ['なくてはいけない', 'Nakute wa ikenai', 'N5 · Harus / wajib.', 'nakute-wa-ikenai'],
    ['なければならない', 'Nakereba naranai', 'N5 · Harus melakukan.', 'nakereba-naranai'],
    ['てしまう', 'Te-shimau', 'N5 · Selesai / tanpa sengaja / penyesalan ringan.', 'te-shimau'],
    ['てしまった', 'Te-shimatta', 'N5 · Sudah terjadi (nuansa penyesalan).', 'te-shimatta'],
    ['ている', 'Te-iru', 'N5 · Sedang / keadaan berlangsung.', 'te-iru'],
    ['ていた', 'Te-ita', 'N5 · Sedang (masa lalu).', 'te-ita'],
    ['てくる', 'Te-kuru', 'N5 · Datang / berkembang ke sini.', 'te-kuru'],
    ['てくれた', 'Te-kureta', 'N5 · Orang lain melakukan untukku.', 'te-kuru'],
    ['てあげる', 'Te-ageru', 'N5 · Melakukan untuk orang lain.', 'te-ageru'],
    ['てもらう', 'Te-morau', 'N5 · Menerima bantuan.', 'te-morau'],
    ['ていく', 'Te-iku', 'N5 · Pergi / berlanjut ke depan.', 'te-iku'],
    ['てください', 'Te kudasai', 'N5 · Tolong lakukan (sopan).', 'te-kudasai'],
    ['てくれない', 'Te kurenai', 'N5 · Tidak mau melakukan untukku.', 'te-kurenai'],
    ['たことがある', 'Ta koto ga aru', 'N5 · Pernah melakukan.', 'ta-koto-ga-aru'],
    ['たことがない', 'Ta koto ga nai', 'N5 · Belum pernah.', 'ta-koto-ga-nai'],
    ['つもり', 'Tsumori', 'N5 · Berencana / niat.', 'tsumori'],
    ['つもりです', 'Tsumori desu', 'N5 · Berencana (sopan).', 'tsumori'],
    ['たいです', 'Tai desu', 'N5 · Ingin (sopan).', 'tai'],
    ['たくない', 'Takunai', 'N5 · Tidak ingin.', 'tai'],
    ['たくないです', 'Takunai desu', 'N5 · Tidak ingin (sopan).', 'tai'],
    ['たい', 'Tai', 'N5 · Ingin melakukan.', 'tai'],
    ['たり', 'Tari', 'N5 · Melakukan A dan B (contoh).', 'tari'],
    ['なければ', 'Nakereba', 'N5 · Jika tidak… / harus.', 'nakereba'],
    ['なくちゃ', 'Nakucha', 'N5 · Harus (kasual).', 'nakucha'],
    ['なきゃ', 'Nakya', 'N5 · Harus (sangat kasual).', 'nakucha'],
    ['なくて', 'Nakute', 'N5 · Karena tidak… (penghubung).', 'nai'],
    ['ないで', 'Naide', 'N5 · Tanpa melakukan.', 'naide'],
    ['ないでください', 'Naide kudasai', 'N5 · Tolong jangan…', 'naide-kudasai'],
    ['ません', 'Masen', 'N5 · Negatif sopan.', 'masen'],
    ['ませんでした', 'Masen deshita', 'N5 · Tidak (lampau, sopan).', 'masen-deshita'],
    ['ました', 'Mashita', 'N5 · Lampau sopan.', 'mashita'],
    ['ましょう', 'Mashou', 'N5 · Mari kita… / ajakan sopan.', 'mashou'],
    ['ませんか', 'Masen ka', 'N5 · Ajakan sopan (“mau…?”).', 'masen-ka'],
    ['ですか', 'Desu ka', 'N5 · Pertanyaan sopan.', 'desu'],
    ['でした', 'Deshita', 'N5 · Lampau sopan (です lalu).', 'deshita'],
    ['ではありません', 'Dewa arimasen', 'N5 · Bukan (formal).', 'dewa-nai'],
    ['じゃありません', 'Ja arimasen', 'N5 · Bukan (sopan-kasual).', 'ja-nai'],
    ['ではない', 'Dewa nai', 'N5 · Bukan (formal-kasual).', 'dewa-nai'],
    ['じゃない', 'Ja nai', 'N5 · Bukan (kasual).', 'ja-nai'],
    ['だと思う', 'Da to omou', 'N5 · Saya pikir…', 'to-omou'],
    ['と思う', 'To omou', 'N5 · Saya pikir / merasa.', 'to-omou'],
    ['と思います', 'To omoimasu', 'N5 · Saya pikir (sopan).', 'to-omou'],
    ['という', 'To iu', 'N5 · Yang disebut… / bernama.', 'to-iu'],
    ['というの', 'To iu no', 'N5 · Hal yang disebut…', 'to-iu'],
    ['ように', 'You ni', 'N5 · Agar / supaya / seperti.', 'you-ni'],
    ['ような', 'You na', 'N5 · Seperti (kata benda).', 'you-na'],
    ['ために', 'Tame ni', 'N5 · Untuk kepentingan / tujuan.', 'tame-ni'],
    ['について', 'Ni tsuite', 'N5 · Tentang…', 'ni-tsuite'],
    ['によって', 'Ni yotte', 'N5 · Oleh / tergantung.', 'ni-yotte'],
    ['として', 'To shite', 'N5 · Sebagai…', 'to-shite'],
    ['から', 'Kara', 'N5 · Dari / karena.', 'kara'],
    ['まで', 'Made', 'N5 · Sampai.', 'made'],
    ['より', 'Yori', 'N5 · Dari pada / lebih…daripada.', 'yori'],
    ['ほど', 'Hodo', 'N5 · Sekitar / sampai tingkat.', 'hodo'],
    ['くらい', 'Kurai', 'N5 · Sekitar (jumlah).', 'kurai'],
    ['ぐらい', 'Gurai', 'N5 · Sekitar (jumlah).', 'kurai'],
    ['だけ', 'Dake', 'N5 · Hanya / sebanyak.', 'dake'],
    ['しか', 'Shika', 'N5 · Hanya (biasanya + negatif).', 'shika'],
    ['ばかり', 'Bakari', 'N5 · Hanya / baru saja.', 'bakari'],
    ['など', 'Nado', 'N5 · Dan lain-lain / misalnya.', 'nado'],
    ['なんか', 'Nanka', 'N5 · Semacam / dll (kasual).', 'nanka'],
    ['でも', 'Demo', 'N5 · Tapi / bahkan / di (tempat).', 'demo'],
    ['けど', 'Kedo', 'N5 · Tapi (kasual).', 'kedo'],
    ['けれど', 'Keredo', 'N5 · Tetapi (sopan-kasual).', 'kedo'],
    ['のに', 'Noni', 'N5 · Padahal / meskipun.', 'noni'],
    ['ので', 'Node', 'N5 · Karena (alasannya).', 'node'],
    ['のに', 'Noni', 'N5 · Padahal.', 'noni'],
    ['ながら', 'Nagara', 'N5 · Sambil melakukan.', 'nagara'],
    ['たら', 'Tara', 'N5 · Jika / ketika (kondisi).', 'tara'],
    ['れば', 'Reba', 'N5 · Jika (kondisi).', 'reba'],
    ['なら', 'Nara', 'N5 · Jika (konteks/topik).', 'nara'],
    ['だろう', 'Darou', 'N5 · Mungkin / kan?', 'darou'],
    ['でしょう', 'Deshou', 'N5 · Mungkin (sopan).', 'deshou'],
    ['かな', 'Kana', 'N5 · Apa ya… (ragu).', 'kana'],
    ['かもしれない', 'Kamo shirenai', 'N5 · Mungkin.', 'kamo'],
    ['かもしれません', 'Kamo shiremasen', 'N5 · Mungkin (sopan).', 'kamo'],
    ['に行く', 'Ni iku', 'N5 · Pergi untuk melakukan.', 'ni-iku'],
    ['に来る', 'Ni kuru', 'N5 · Datang untuk melakukan.', 'ni-kuru'],
    ['にする', 'Ni suru', 'N5 · Memutuskan / menjadikan.', 'ni-suru'],
    ['になる', 'Ni naru', 'N5 · Menjadi.', 'ni-naru'],
    ['がある', 'Ga aru', 'N5 · Ada (benda).', 'ga-aru'],
    ['がいる', 'Ga iru', 'N5 · Ada (orang/hidup).', 'ga-iru'],
    ['はあります', 'Wa arimasu', 'N5 · Ada (sopan).', 'arimasu'],
    ['がいます', 'Ga imasu', 'N5 · Ada orang (sopan).', 'imasu'],
    ['ありません', 'Arimasen', 'N5 · Tidak ada (sopan).', 'arimasen'],
    ['いません', 'Imasen', 'N5 · Tidak ada orang (sopan).', 'imasen'],
    ['ありました', 'Arimashita', 'N5 · Ada (lampau, sopan).', 'arimashita'],
    ['いました', 'Imashita', 'N5 · Ada orang (lampau, sopan).', 'imashita'],
    ['のだ', 'No da', 'N5 · Penjelasan / tekanan (のだ).', 'no-da'],
    ['んだ', 'N da', 'N5 · Penjelasan (kasual).', 'no-da'],
    ['です', 'Desu', 'N5 · Kopula sopan (adalah).', 'desu'],
    ['でした', 'Deshita', 'N5 · Adalah (lampau, sopan).', 'deshita'],
    ['ます', 'Masu', 'N5 · Bentuk sopan sekarang.', 'masu'],
    ['ました', 'Mashita', 'N5 · Bentuk sopan lampau.', 'mashita'],
    ['ましょう', 'Mashou', 'N5 · Ajakan sopan.', 'mashou'],
    ['だ', 'Da', 'N5 · Kopula kasual.', 'da'],
    ['だった', 'Datta', 'N5 · Adalah (lampau, kasual).', 'datta'],
    ['じゃない', 'Ja nai', 'N5 · Bukan.', 'ja-nai'],
    ['ない', 'Nai', 'N5 · Negatif dasar.', 'nai'],
    ['なかった', 'Nakatta', 'N5 · Tidak (lampau).', 'nai'],
    ['た', 'Ta', 'N5 · Lampau (bentuk -ta).', 'ta'],
    ['て', 'Te', 'N5 · Penghubung て-form.', 'te'],
    ['で', 'De', 'N5 · Di tempat / alat / penghubung.', 'de'],
    ['と', 'To', 'N5 · Dan / dengan / kutipan.', 'to'],
    ['に', 'Ni', 'N5 · Ke / di / waktu.', 'ni'],
    ['を', 'Wo', 'N5 · Objek langsung.', 'wo'],
    ['は', 'Wa', 'N5 · Topik kalimat.', 'wa'],
    ['が', 'Ga', 'N5 · Subjek penanda.', 'ga'],
    ['の', 'No', 'N5 · Milik / penghubung.', 'no'],
    ['も', 'Mo', 'N5 · Juga.', 'mo'],
    ['か', 'Ka', 'N5 · Pertanyaan.', 'ka'],
    ['よ', 'Yo', 'N5 · Penegas informasi.', 'yo'],
    ['ね', 'Ne', 'N5 · Konfirmasi / softener.', 'ne'],
    ['へ', 'E', 'N5 · Menuju (arah).', 'e'],
    ['や', 'Ya', 'N5 · Dan (daftar tidak lengkap).', 'ya'],
    ['ねえ', 'Nee', 'N5 · Hei / kan?', 'ne'],
    ['まだ', 'Mada', 'N5 · Belum / masih.', 'mada'],
    ['もう', 'Mou', 'N5 · Sudah / sudah tidak.', 'mou'],
    ['あまり', 'Amari', 'N5 · Tidak terlalu ( + negatif).', 'amari'],
    ['全然', 'Zenzen', 'N5 · Sama sekali tidak ( + negatif).', 'zenzen'],
    ['ちょっと', 'Chotto', 'N5 · Sedikit / agak.', 'chotto'],
    ['とても', 'Totemo', 'N5 · Sangat.', 'totemo'],
    ['いつも', 'Itsumo', 'N5 · Selalu.', 'itsumo'],
    ['ときどき', 'Tokidoki', 'N5 · Kadang-kadang.', 'tokidoki'],
    ['よく', 'Yoku', 'N5 · Sering / baik.', 'yoku'],
    ['あとで', 'Atode', 'N5 · Nanti.', 'atode'],
    ['すぐ', 'Sugu', 'N5 · Segera.', 'sugu'],
  ];

  const PHRASES = [...PHRASES_RAW].sort((a, b) => b[0].length - a[0].length);

  const PARTICLES = {
    'は': ['Partikel topik (は)', 'N5 · Menandai topik; bukan selalu "adalah".', 'wa'],
    'が': ['Partikel subjek (が)', 'N5 · Subjek / kontras / pertama kali disebut.', 'ga'],
    'を': ['Partikel objek (を)', 'N5 · Objek langsung verba.', 'wo'],
    'に': ['Partikel に', 'N5 · Arah, waktu, tujuan.', 'ni'],
    'で': ['Partikel で', 'N5 · Tempat, alat, cara.', 'de'],
    'と': ['Partikel と', 'N5 · Dan, bersama, kutipan.', 'to'],
    'の': ['Partikel の', 'N5 · Kepemilikan / penghubung.', 'no'],
    'へ': ['Partikel へ', 'N5 · Menuju (arah).', 'e'],
    'も': ['Partikel も', 'N5 · Juga, bahkan.', 'mo'],
    'か': ['Partikel か', 'N5 · Pertanyaan ya/tidak.', 'ka'],
    'よ': ['Partikel よ', 'N5 · Memberi info baru.', 'yo'],
    'ね': ['Partikel ね', 'N5 · Mencari persetujuan.', 'ne'],
    'や': ['Partikel や', 'N5 · Dan (daftar contoh).', 'ya'],
  };

  const SKIP_PARTICLE_IN = /^(あり|い|な|の|ん|す|せ|ま|て|で|く|け|め|れ|り|る|ら|わ|を|お|こ|そ|と|ほ|も|よ|や|ゆ|よ|あ|い|う|え|か|き|さ|し|み|び|ぴ|ギ|ク|グ|ス|ズ|タ|ダ|ナ|ハ|バ|パ|マ|ラ|ワ)$/;

  function isParticleContext(text, i, ch) {
    const prev = text[i - 1] || '';
    const next = text[i + 1] || '';
    if (ch === 'は' && /[わハは]$/.test(text.slice(Math.max(0, i - 4), i))) return false;
    if (ch === 'が' && SKIP_PARTICLE_IN.test(prev)) return false;
    if (ch === 'の' && /[0-9０-９]/.test(next)) return false;
    if (/[\u3040-\u30FF\u4E00-\u9FFF]/.test(prev) || /[\u3040-\u30FF\u4E00-\u9FFF]/.test(next)) return true;
    return ch === 'は' || ch === 'を' || ch === 'に' || ch === 'で' || ch === 'と' || ch === 'の' || ch === 'が';
  }

  function analyzeJapaneseGrammar(jp) {
    if (!jp || !String(jp).trim()) {
      return { summary: 'Baris kosong — pilih baris lirik.', particles: [], phrases: [], level: 'N5' };
    }
    const text = String(jp).trim();
    const phrases = [];
    const usedSpan = new Set();

    for (const [ph, label, desc, gloss] of PHRASES) {
      let start = 0;
      while (start < text.length) {
        const ix = text.indexOf(ph, start);
        if (ix < 0) break;
        const key = ix + ':' + ph;
        if (!usedSpan.has(key)) {
          usedSpan.add(key);
          for (let k = ix; k < ix + ph.length; k++) usedSpan.add('c' + k);
          phrases.push({ text: ph, label, desc, glossSlug: gloss || null });
        }
        start = ix + ph.length;
      }
    }

    const particles = [];
    const chars = [...text];
    for (let i = 0; i < chars.length; i++) {
      if (usedSpan.has('c' + i)) continue;
      const ch = chars[i];
      if (!PARTICLES[ch] || !isParticleContext(text, i, ch)) continue;
      const prev = chars[i - 1] || '';
      const next = chars[i + 1] || '';
      particles.push({
        char: ch,
        label: PARTICLES[ch][0],
        desc: PARTICLES[ch][1],
        glossSlug: PARTICLES[ch][2],
        context: (prev + ch + next).slice(-5),
      });
    }

    const total = phrases.length + particles.length;
    let summary = 'N5 · Ketuk baris lirik untuk melihat pola di bawah.';
    if (total >= 5) summary = 'N5 · Banyak pola — bagus untuk latihan membaca lirik.';
    else if (phrases.length && particles.length) summary = 'N5 · ' + phrases.length + ' pola + ' + particles.length + ' partikel.';
    else if (phrases.length) summary = 'N5 · ' + phrases.length + ' pola tata bahasa ditemukan.';
    else if (particles.length) summary = 'N5 · ' + particles.length + ' partikel ditemukan.';
    else summary = 'N5 · Pola umum tidak terdeteksi — mungkin slang, nama, atau bentuk khusus lagu.';

    return { summary, particles, phrases, level: 'N5' };
  }

  global.YumeGrammar = { analyzeJapaneseGrammar };
})(typeof window !== 'undefined' ? window : globalThis);
