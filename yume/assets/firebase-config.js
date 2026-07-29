// ============================================================
// GANTI SEMUA NILAI DI BAWAH INI dengan config project Firebase kamu.
// Cara ambil: Firebase Console > Project settings > General >
// scroll ke "Your apps" > pilih app web (</>) > "SDK setup and configuration"
// ============================================================
export const firebaseConfig = {
  apiKey: "AIzaSyAbHLSbiJwkf0soRi0PbahSVFVaa75PZ_Q",
  authDomain: "yumesubs-946d8.firebaseapp.com",
  projectId: "yumesubs-946d8",
  storageBucket: "yumesubs-946d8.firebasestorage.app",
  messagingSenderId: "266303754897",
  appId: "1:266303754897:web:c131a59e3c9df7e3022530",
};

// Nama dokumen Firestore tempat profil disimpan.
// Tidak perlu diubah kecuali kamu mau bikin lebih dari satu profil.
export const PROFILE_PATH = { collection: "profiles", doc: "main" };
