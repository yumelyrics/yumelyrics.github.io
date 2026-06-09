// send-discord.js — kirim pesan manual ke Discord (GitHub Actions)
// Set DISCORD_TARGET_WEBHOOK_URL per workflow (rules / announcements / dll.)
const webhook = process.env.DISCORD_TARGET_WEBHOOK_URL || '';
if (!webhook) {
  console.error('DISCORD_TARGET_WEBHOOK_URL tidak diset di GitHub Secrets');
  process.exit(1);
}

const message = process.env.DC_MESSAGE || '';
const embedTitle = (process.env.DC_EMBED_TITLE || '').trim();
const pingMember = String(process.env.DC_PING_MEMBER || 'true').toLowerCase() !== 'false';

if (!message.trim()) {
  console.error('Pesan kosong');
  process.exit(1);
}

const DC_MEMBER_ROLE = '1513469865451716771';
const pingText = pingMember ? `<@&${DC_MEMBER_ROLE}>` : '';
const payload = {};

if (embedTitle) {
  if (pingText) payload.content = pingText;
  payload.embeds = [{
    title: embedTitle.slice(0, 256),
    description: message.slice(0, 4096),
    color: 0xC9A96E,
    footer: { text: 'yumelyrics.my.id' },
    timestamp: new Date().toISOString(),
  }];
} else {
  const lines = [];
  if (pingText) lines.push(pingText);
  lines.push(message);
  payload.content = lines.join('\n\n').slice(0, 2000);
}

const res = await fetch(webhook, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});

if (!res.ok) {
  console.error('Discord webhook error:', res.status, await res.text());
  process.exit(1);
}

console.log('✓ Pesan Discord terkirim');
