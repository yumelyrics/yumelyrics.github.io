import { inferRumus, RUMUS_DASAR } from './bunpou-rumus.js';
import { inferContoh } from './bunpou-contoh.js';

window.inferRumus = inferRumus;
window.RUMUS_DASAR = RUMUS_DASAR;
window.inferContoh = inferContoh;
window.dispatchEvent(new Event('rumus-ready'));
