/**
 * Cloudflare Worker — Isekai Discord Notifier
 * Terima POST dari 404.html → kirim ke Discord webhook.
 * DISCORD_WEBHOOK_URL disimpan sebagai Worker Secret (tidak pernah sampai ke browser).
 */

const ALLOWED_ORIGIN = "*"; // atau ganti dengan "https://yumelyrics.github.io"

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// Helper: sanitize string — buang karakter kontrol & potong panjang
function s(v, max = 200) {
  if (v == null) return "tidak diketahui";
  return String(v).replace(/[\x00-\x1F\x7F]/g, " ").slice(0, max);
}

export default {
  async fetch(request, env) {
    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405, headers: CORS_HEADERS });
    }

    // Validasi Content-Type
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
      // Secret belum di-set, return 200 agar 404.html tidak error
      return new Response("OK (no webhook configured)", { status: 200, headers: CORS_HEADERS });
    }

    // Format waktu
    let waktu = "tidak diketahui";
    try {
      waktu = new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }) + " WIB";
    } catch (_) {}

    const lines = [
      "🌸 **Pengunjung tersesat baru terdeteksi!**",
      `⏰ Waktu: ${waktu}`,
      `🌐 IP: \`${s(data.ip, 45)}\``,
      `🏢 ISP/Guild: ${s(data.isp)}`,
      `📍 Lokasi: ${s(data.lokasi)}`,
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
