import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js';
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut,
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js';
import {
  getFirestore, doc, getDoc, setDoc,
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';
import {
  getStorage, ref as storageRef, uploadBytes, getDownloadURL,
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-storage.js';
import { firebaseConfig, PROFILE_PATH } from './firebase-config.js';
import { ICONS } from './icons.js';
import { renderProfile, applyBackground } from './render.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const profileRef = doc(db, PROFILE_PATH.collection, PROFILE_PATH.doc);

// ---------- image upload (Firebase Storage) ----------
function safeExt(file) {
  const rawExt = (file.name && file.name.includes('.')) ? file.name.split('.').pop().toLowerCase() : '';
  if (/^[a-z0-9]{2,5}$/.test(rawExt)) return rawExt === 'jpeg' ? 'jpg' : rawExt;
  const typeExt = (file.type && file.type.includes('/')) ? file.type.split('/')[1].toLowerCase() : '';
  return /^[a-z0-9]{2,5}$/.test(typeExt) ? (typeExt === 'jpeg' ? 'jpg' : typeExt) : 'jpg';
}
async function uploadImageToFirebase(file, folder = 'uploads') {
  if (!auth.currentUser) throw new Error('Kamu harus login dulu sebelum upload gambar.');
  if (!file) throw new Error('Tidak ada file yang dipilih.');
  if (!file.type.startsWith('image/')) throw new Error('File harus berupa gambar.');
  if (file.size > 5 * 1024 * 1024) throw new Error('Ukuran gambar maksimal 5MB.');
  const rand = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  const path = `${folder}/${Date.now()}_${rand}.${safeExt(file)}`;
  const fileRef = storageRef(storage, path);
  const snapshot = await uploadBytes(fileRef, file, { contentType: file.type });
  const url = await getDownloadURL(snapshot.ref);
  if (!url) throw new Error('Gagal mengambil URL gambar.');
  return url;
}
/** Wires a file input to upload into `targetInput`'s value and fire the given callback. */
function wireUploadButton({ fileInput, statusEl, targetInput, folder, onDone }) {
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    statusEl.textContent = 'Mengunggah…';
    statusEl.className = 'status-msg';
    try {
      const url = await uploadImageToFirebase(file, folder);
      targetInput.value = url;
      statusEl.textContent = 'Berhasil diunggah ✓';
      statusEl.className = 'status-msg ok';
      onDone?.(url);
    } catch (err) {
      statusEl.textContent = err.message || 'Upload gagal.';
      statusEl.className = 'status-msg err';
    } finally {
      fileInput.value = '';
    }
  });
}

// ---------- state ----------
const state = {
  name: '', bio: '', avatar: '',
  background: { type: 'color', value: '#101018', overlay: 40 },
  links: [],
  socials: [],
};

// ---------- element refs ----------
const el = (id) => document.getElementById(id);
const loginView = el('loginView');
const editorView = el('editorView');
const loginForm = el('loginForm');
const loginStatus = el('loginStatus');
const logoutBtn = el('logoutBtn');

const fName = el('fName'), fBio = el('fBio'), fAvatar = el('fAvatar');
const fAvatarFile = el('fAvatarFile'), avatarUploadStatus = el('avatarUploadStatus');
const fBgType = el('fBgType');
const bgColorField = el('bgColorField'), bgGradientField = el('bgGradientField'), bgImageField = el('bgImageField');
const fBgColor = el('fBgColor'), fBgColorHex = el('fBgColorHex');
const fGradA = el('fGradA'), fGradB = el('fGradB'), fGradAngle = el('fGradAngle');
const fBgImage = el('fBgImage'); const fOverlay = el('fOverlay');
const fBgImageFile = el('fBgImageFile'), bgImageUploadStatus = el('bgImageUploadStatus');
const linksList = el('linksList'), addLinkBtn = el('addLinkBtn');
const socialsList = el('socialsList'), addSocialBtn = el('addSocialBtn');
const saveBtn = el('saveBtn'), saveStatus = el('saveStatus');
const linkRowTpl = el('linkRowTpl'), socialRowTpl = el('socialRowTpl');
const pvRoot = el('pvRoot'), pvBgLayer = el('pvBgLayer'), pvBgOverlay = el('pvBgOverlay');

function iconOptionsHtml(selected) {
  return Object.entries(ICONS).map(([key, v]) =>
    `<option value="${key}" ${key === selected ? 'selected' : ''}>${v.label}</option>`).join('');
}

// ---------- auth ----------
onAuthStateChanged(auth, async (user) => {
  if (user) {
    loginView.hidden = true;
    editorView.hidden = false;
    await loadProfile();
  } else {
    loginView.hidden = false;
    editorView.hidden = true;
  }
});

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginStatus.textContent = 'Memproses…';
  loginStatus.className = 'status-msg';
  try {
    await signInWithEmailAndPassword(auth, el('email').value, el('password').value);
    loginStatus.textContent = '';
  } catch (err) {
    loginStatus.textContent = 'Login gagal: email atau password salah.';
    loginStatus.className = 'status-msg err';
  }
});

logoutBtn.addEventListener('click', () => signOut(auth));

// ---------- load existing profile ----------
async function loadProfile() {
  try {
    const snap = await getDoc(profileRef);
    if (snap.exists()) {
      Object.assign(state, snap.data());
      state.background = { type: 'color', value: '#101018', overlay: 40, ...(snap.data().background || {}) };
    }
  } catch (err) {
    console.error(err);
  }
  hydrateForm();
  renderLinkRows();
  renderSocialRows();
  updatePreview();
}

// ---------- hydrate static fields ----------
function hydrateForm() {
  fName.value = state.name || '';
  fBio.value = state.bio || '';
  fAvatar.value = state.avatar || '';
  fBgType.value = state.background.type;
  fOverlay.value = state.background.overlay ?? 40;

  if (state.background.type === 'color') {
    fBgColor.value = state.background.value || '#101018';
    fBgColorHex.value = state.background.value || '#101018';
  } else if (state.background.type === 'image') {
    fBgImage.value = state.background.value || '';
  } else if (state.background.type === 'gradient') {
    const m = /linear-gradient\((\d+)deg,\s*(#[0-9a-fA-F]{3,6}),\s*(#[0-9a-fA-F]{3,6})\)/.exec(state.background.value || '');
    if (m) { fGradAngle.value = m[1]; fGradA.value = m[2]; fGradB.value = m[3]; }
  }
  updateBgFieldVisibility();
}

function updateBgFieldVisibility() {
  bgColorField.hidden = fBgType.value !== 'color';
  bgGradientField.hidden = fBgType.value !== 'gradient';
  bgImageField.hidden = fBgType.value !== 'image';
}

// ---------- links repeater ----------
function renderLinkRows() {
  linksList.innerHTML = '';
  state.links.forEach((link, i) => linksList.appendChild(buildLinkRow(link, i)));
}
function buildLinkRow(link, index) {
  const node = linkRowTpl.content.firstElementChild.cloneNode(true);
  node.dataset.index = index;
  const labelI = node.querySelector('[data-field="label"]');
  const urlI = node.querySelector('[data-field="url"]');
  const iconS = node.querySelector('[data-field="icon"]');
  const iconUrlI = node.querySelector('[data-field="iconUrl"]');
  const iconFileI = node.querySelector('[data-field="iconFile"]');
  const iconUploadWrap = node.querySelector('[data-role="icon-upload-wrap"]');
  const iconStatusEl = node.querySelector('[data-role="icon-status"]');
  labelI.value = link.label || '';
  urlI.value = link.url || '';
  iconS.innerHTML = iconOptionsHtml(link.icon || 'website');
  iconUrlI.value = link.iconUrl || '';
  const isCustom = (link.icon || 'website') === 'custom';
  iconUrlI.hidden = !isCustom;
  iconUploadWrap.hidden = !isCustom;

  labelI.addEventListener('input', () => { state.links[index].label = labelI.value; updatePreview(); });
  urlI.addEventListener('input', () => { state.links[index].url = urlI.value; updatePreview(); });
  iconS.addEventListener('change', () => {
    state.links[index].icon = iconS.value;
    const custom = iconS.value === 'custom';
    iconUrlI.hidden = !custom;
    iconUploadWrap.hidden = !custom;
    updatePreview();
  });
  iconUrlI.addEventListener('input', () => { state.links[index].iconUrl = iconUrlI.value; updatePreview(); });
  iconFileI.addEventListener('change', async () => {
    const file = iconFileI.files[0];
    if (!file) return;
    iconStatusEl.textContent = 'Mengunggah…';
    iconStatusEl.className = 'status-msg';
    try {
      const url = await uploadImageToFirebase(file, 'link-icons');
      iconUrlI.value = url;
      state.links[index].iconUrl = url;
      iconStatusEl.textContent = 'Berhasil ✓';
      iconStatusEl.className = 'status-msg ok';
      updatePreview();
    } catch (err) {
      iconStatusEl.textContent = err.message || 'Upload gagal.';
      iconStatusEl.className = 'status-msg err';
    } finally {
      iconFileI.value = '';
    }
  });

  node.querySelector('[data-action="up"]').addEventListener('click', () => moveItem(state.links, index, -1, renderLinkRows));
  node.querySelector('[data-action="down"]').addEventListener('click', () => moveItem(state.links, index, 1, renderLinkRows));
  node.querySelector('[data-action="del"]').addEventListener('click', () => {
    state.links.splice(index, 1); renderLinkRows(); updatePreview();
  });
  return node;
}
addLinkBtn.addEventListener('click', () => {
  state.links.push({ label: '', url: '', icon: 'website', iconUrl: '' });
  renderLinkRows(); updatePreview();
});

// ---------- socials repeater ----------
function renderSocialRows() {
  socialsList.innerHTML = '';
  state.socials.forEach((s, i) => socialsList.appendChild(buildSocialRow(s, i)));
}
function buildSocialRow(social, index) {
  const node = socialRowTpl.content.firstElementChild.cloneNode(true);
  const iconS = node.querySelector('[data-field="icon"]');
  const urlI = node.querySelector('[data-field="url"]');
  iconS.innerHTML = iconOptionsHtml(social.icon || 'website');
  urlI.value = social.url || '';

  iconS.addEventListener('change', () => { state.socials[index].icon = iconS.value; updatePreview(); });
  urlI.addEventListener('input', () => { state.socials[index].url = urlI.value; updatePreview(); });

  node.querySelector('[data-action="up"]').addEventListener('click', () => moveItem(state.socials, index, -1, renderSocialRows));
  node.querySelector('[data-action="down"]').addEventListener('click', () => moveItem(state.socials, index, 1, renderSocialRows));
  node.querySelector('[data-action="del"]').addEventListener('click', () => {
    state.socials.splice(index, 1); renderSocialRows(); updatePreview();
  });
  return node;
}
addSocialBtn.addEventListener('click', () => {
  state.socials.push({ icon: 'website', url: '' });
  renderSocialRows(); updatePreview();
});

function moveItem(arr, index, dir, rerender) {
  const target = index + dir;
  if (target < 0 || target >= arr.length) return;
  [arr[index], arr[target]] = [arr[target], arr[index]];
  rerender(); updatePreview();
}

// ---------- simple fields -> state ----------
[fName, fBio, fAvatar].forEach((input) => {
  input.addEventListener('input', () => {
    state.name = fName.value; state.bio = fBio.value; state.avatar = fAvatar.value;
    updatePreview();
  });
});

wireUploadButton({
  fileInput: fAvatarFile,
  statusEl: avatarUploadStatus,
  targetInput: fAvatar,
  folder: 'avatars',
  onDone: (url) => { state.avatar = url; updatePreview(); },
});
wireUploadButton({
  fileInput: fBgImageFile,
  statusEl: bgImageUploadStatus,
  targetInput: fBgImage,
  folder: 'backgrounds',
  onDone: () => syncBackgroundFromForm(),
});

fBgType.addEventListener('change', () => { updateBgFieldVisibility(); syncBackgroundFromForm(); });
fBgColor.addEventListener('input', () => { fBgColorHex.value = fBgColor.value; syncBackgroundFromForm(); });
fBgColorHex.addEventListener('input', syncBackgroundFromForm);
[fGradA, fGradB, fGradAngle].forEach(i => i.addEventListener('input', syncBackgroundFromForm));
fBgImage.addEventListener('input', syncBackgroundFromForm);
fOverlay.addEventListener('input', syncBackgroundFromForm);

function syncBackgroundFromForm() {
  const type = fBgType.value;
  let value = '';
  if (type === 'color') value = fBgColorHex.value || '#101018';
  else if (type === 'gradient') value = `linear-gradient(${fGradAngle.value || 135}deg, ${fGradA.value}, ${fGradB.value})`;
  else if (type === 'image') value = fBgImage.value;
  state.background = { type, value, overlay: Number(fOverlay.value) };
  updatePreview();
}

// ---------- preview ----------
function updatePreview() {
  applyBackground(state.background, pvBgLayer, pvBgOverlay);
  renderProfile(pvRoot, state);
}

// ---------- save ----------
saveBtn.addEventListener('click', async () => {
  saveStatus.textContent = 'Menyimpan…';
  saveStatus.className = 'status-msg';
  try {
    await setDoc(profileRef, state);
    saveStatus.textContent = 'Tersimpan ✓';
    saveStatus.className = 'status-msg ok';
  } catch (err) {
    console.error(err);
    saveStatus.textContent = 'Gagal menyimpan. Cek aturan Firestore & koneksi.';
    saveStatus.className = 'status-msg err';
  }
});
