import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js';
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut,
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js';
import {
  getFirestore, doc, getDoc, setDoc,
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';
import { firebaseConfig, PROFILE_PATH } from './firebase-config.js';
import { ICONS } from './icons.js';
import { renderProfile, applyBackground } from './render.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const profileRef = doc(db, PROFILE_PATH.collection, PROFILE_PATH.doc);

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
const fBgType = el('fBgType');
const bgColorField = el('bgColorField'), bgGradientField = el('bgGradientField'), bgImageField = el('bgImageField');
const fBgColor = el('fBgColor'), fBgColorHex = el('fBgColorHex');
const fGradA = el('fGradA'), fGradB = el('fGradB'), fGradAngle = el('fGradAngle');
const fBgImage = el('fBgImage'); const fOverlay = el('fOverlay');
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
  labelI.value = link.label || '';
  urlI.value = link.url || '';
  iconS.innerHTML = iconOptionsHtml(link.icon || 'website');
  iconUrlI.value = link.iconUrl || '';
  iconUrlI.hidden = (link.icon || 'website') !== 'custom';

  labelI.addEventListener('input', () => { state.links[index].label = labelI.value; updatePreview(); });
  urlI.addEventListener('input', () => { state.links[index].url = urlI.value; updatePreview(); });
  iconS.addEventListener('change', () => {
    state.links[index].icon = iconS.value;
    iconUrlI.hidden = iconS.value !== 'custom';
    updatePreview();
  });
  iconUrlI.addEventListener('input', () => { state.links[index].iconUrl = iconUrlI.value; updatePreview(); });

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
