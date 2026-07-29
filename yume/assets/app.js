import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js';
import { getFirestore, doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';
import { firebaseConfig, PROFILE_PATH } from './firebase-config.js';
import { renderProfile, applyBackground } from './render.js';

const root = document.getElementById('root');
const bgLayer = document.getElementById('bgLayer');
const bgOverlay = document.getElementById('bgOverlay');

async function main() {
  try {
    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);
    const ref = doc(db, PROFILE_PATH.collection, PROFILE_PATH.doc);
    const snap = await getDoc(ref);

    if (!snap.exists()) {
      root.innerHTML = '<p class="state-msg">Profil belum diatur. Buka <a href="admin.html" style="color:inherit">admin.html</a> untuk membuatnya.</p>';
      return;
    }

    const data = snap.data();
    document.title = data.name ? `${data.name} — Link` : 'Profil';
    applyBackground(data.background, bgLayer, bgOverlay);
    renderProfile(root, data);
  } catch (err) {
    console.error(err);
    root.innerHTML = '<p class="state-msg">Gagal memuat profil. Cek koneksi atau konfigurasi Firebase di assets/firebase-config.js.</p>';
  }
}

main();
