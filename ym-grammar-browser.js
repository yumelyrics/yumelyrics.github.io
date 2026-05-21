/** Analisis tata bahasa Jepang per baris — dipakai di halaman lagu (generate-songs). */
(function (global) {
  const PHRASES = [
    ['てしまう', 'Te-shimau', 'Aksi selesai (sering penyesalan / hasil tak terduga).'],
    ['てしまった', 'Te-shimatta', 'Sudah selesai terjadi (nuansa penyesalan).'],
    ['ている', 'Te-iru', 'Keadaan berlangsung / hasil bertahan.'],
    ['ていた', 'Te-ita', 'Sedang dalam keadaan (masa lalu).'],
    ['てくる', 'Te-kuru', 'Aksi mendekati penutup / berkembang ke sini.'],
    ['てくれた', 'Te-kureta', 'Seseorang melakukan untukku (beruntung).'],
    ['てあげる', 'Te-ageru', 'Melakukan untuk orang lain.'],
    ['てもらう', 'Te-morau', 'Menerima bantuan dari orang lain.'],
    ['ではない', 'Dewa nai', 'Penyangkalan formal.'],
    ['じゃない', 'Ja nai', 'Penyangkalan kasual.'],
    ['ません', 'Masen', 'Negatif sopan.'],
    ['ました', 'Mashita', 'Lampau sopan.'],
    ['たい', 'Tai', 'Ingin melakukan.'],
    ['たくない', 'Takunai', 'Tidak ingin melakukan.'],
    ['ない', 'Nai', 'Negatif dasar.'],
    ['なくて', 'Nakute', 'Karena tidak… (penghubung).'],
    ['のに', 'Noni', 'Meskipun / padahal.'],
    ['ので', 'Node', 'Karena (alasannya).'],
    ['から', 'Kara', 'Karena / dari.'],
    ['まで', 'Made', 'Sampai.'],
    ['より', 'Yori', 'Dari pada / daripada.'],
    ['には', 'Niwa', 'Untuk / dalam hal (topik).'],
    ['では', 'Dewa', 'Di (tempat) / sebagai topik.'],
    ['について', 'Ni tsuite', 'Tentang…'],
    ['として', 'To shite', 'Sebagai…'],
  ];

  const PARTICLES = {
    'は': ['Partikel topik (は)', 'Menandai topik kalimat; bukan selalu "adalah".'],
    'が': ['Partikel subjek (が)', 'Menonjolkan subjek; sering kontras atau pertama kali disebut.'],
    'を': ['Partikel objek (を)', 'Menandai objek langsung dari verba.'],
    'に': ['Partikel arah/waktu (に)', 'Ke arah, waktu tertentu, atau tujuan.'],
    'で': ['Partikel tempat/alat (で)', 'Di tempat, dengan alat, atau cara melakukan.'],
    'と': ['Partikel dan/bareng (と)', 'Dan; bersama; kutipan langsung.'],
    'の': ['Partikel kepemilikan (の)', 'Milik; menghubungkan kata benda.'],
    'へ': ['Partikel arah (へ)', 'Menuju (arah, lebih sastra).'],
    'も': ['Partikel juga (も)', 'Juga; bahkan.'],
    'か': ['Partikel tanya (か)', 'Pertanyaan ya/tidak.'],
    'よ': ['Partikel penegas (よ)', 'Memberi info ke lawan bicara.'],
    'ね': ['Partikel konfirmasi (ね)', 'Mencari setuju / softener.'],
    'て': ['Penghubung て-form', 'Menghubungkan kalimat; seri aksi.'],
  };

  function analyzeJapaneseGrammar(jp) {
    if (!jp || !String(jp).trim()) {
      return { summary: 'Baris kosong.', particles: [], phrases: [] };
    }
    const text = String(jp).trim();
    const phrases = [];
    const used = new Set();
    for (const [ph, label, desc] of PHRASES) {
      if (text.includes(ph) && !used.has(ph)) {
        used.add(ph);
        phrases.push({ text: ph, label, desc });
      }
    }
    const particles = [];
    const chars = [...text];
    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i];
      if (PARTICLES[ch]) {
        const prev = chars[i - 1] || '';
        const next = chars[i + 1] || '';
        if (/[\u3040-\u30FF\u4E00-\u9FFF]/.test(prev) || /[\u3040-\u30FF\u4E00-\u9FFF]/.test(next) || ch === 'は' || ch === 'を') {
          particles.push({
            char: ch,
            label: PARTICLES[ch][0],
            desc: PARTICLES[ch][1],
            context: (prev + ch + next).slice(-4),
          });
        }
      }
    }
    let summary = 'Kalimat lagu — ketuk partikel di bawah untuk penjelasan.';
    if (phrases.length && particles.length) summary = 'Ada pola tata bahasa + partikel penting.';
    else if (phrases.length) summary = 'Pola frasa khas terdeteksi.';
    else if (particles.length) summary = particles.length + ' partikel ditemukan.';
    else summary = 'Tidak ada partikel umum terdeteksi — mungkin kata serapan atau struktur khusus.';
    return { summary, particles, phrases };
  }

  global.YumeGrammar = { analyzeJapaneseGrammar };
})(typeof window !== 'undefined' ? window : globalThis);
