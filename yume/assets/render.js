import { ICONS } from './icons.js';

function escapeHtml(str = '') {
  return str.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function initials(name = '') {
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('') || '?';
}

/** Applies background settings (color / gradient / image) to the fixed bg layers already in the page. */
export function applyBackground(bg, bgLayerEl, overlayEl) {
  const type = bg?.type || 'color';
  const value = bg?.value || '#101018';
  bgLayerEl.classList.remove('bg-image');
  if (type === 'image' && value) {
    bgLayerEl.classList.add('bg-image');
    bgLayerEl.style.backgroundImage = `url("${value}")`;
    bgLayerEl.style.background = '';
  } else if (type === 'gradient' && value) {
    bgLayerEl.style.backgroundImage = '';
    bgLayerEl.style.background = value;
  } else {
    bgLayerEl.style.backgroundImage = '';
    bgLayerEl.style.background = value || '#101018';
  }
  const dim = typeof bg?.overlay === 'number' ? bg.overlay : 40;
  overlayEl.style.setProperty('--overlay-value', dim);
  document.documentElement.style.setProperty('--overlay', String(dim / 100));
}

/** Renders the full profile card into `container` (an element that will hold the .card). */
export function renderProfile(container, data) {
  const name = escapeHtml(data?.name || 'Nama Kamu');
  const bio = escapeHtml(data?.bio || '');
  const avatar = data?.avatar || '';
  const links = Array.isArray(data?.links) ? data.links : [];
  const socials = Array.isArray(data?.socials) ? data.socials : [];

  const avatarHtml = avatar
    ? `<img class="avatar" src="${escapeHtml(avatar)}" alt="${name}" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'avatar-fallback',textContent:'${initials(data?.name)}'}))">`
    : `<div class="avatar-fallback">${initials(data?.name)}</div>`;

  const linksHtml = links.map(link => {
    const iconKey = link.icon && ICONS[link.icon] ? link.icon : 'website';
    let iconInner;
    if (iconKey === 'custom' && link.iconUrl) {
      iconInner = `<img src="${escapeHtml(link.iconUrl)}" alt="">`;
    } else {
      iconInner = ICONS[iconKey]?.svg || ICONS.website.svg;
    }
    return `<li>
      <a class="link-btn" href="${escapeHtml(link.url || '#')}" target="_blank" rel="noopener noreferrer">
        <span class="link-icon">${iconInner}</span>
        <span class="link-label">${escapeHtml(link.label || 'Link')}</span>
      </a>
    </li>`;
  }).join('');

  const socialsHtml = socials.map(s => {
    const iconKey = ICONS[s.icon] ? s.icon : 'website';
    return `<a class="social-btn" href="${escapeHtml(s.url || '#')}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(ICONS[iconKey].label)}">${ICONS[iconKey].svg}</a>`;
  }).join('');

  container.innerHTML = `
    <div class="card">
      <div class="avatar-wrap">
        <div class="aura"></div>
        ${avatarHtml}
      </div>
      <h1 class="name">${name}</h1>
      ${bio ? `<p class="bio">${bio}</p>` : ''}
      <ul class="links">${linksHtml || ''}</ul>
      ${socialsHtml ? `<div class="socials">${socialsHtml}</div>` : ''}
      <p class="footer-mark">yumesubs</p>
    </div>
  `;
}
