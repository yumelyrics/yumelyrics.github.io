/**
 * YumeSubs Cloud Functions
 * Deploy: lihat FIREBASE-FUNCTIONS-DEPLOY.md
 *
 * Set hash gate (sama dengan ADMIN_GATE_HASH di HTML):
 *   firebase functions:secrets:set GATE_HASH
 * (paste hex SHA-256 kata kunci gate)
 */

const { onRequest } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { defineSecret } = require('firebase-functions/params');
const crypto = require('crypto');

initializeApp();

const gateHashSecret = defineSecret('GATE_HASH');

const MAX_ATTEMPTS = 3;
const LOCKOUT_MS = 30 * 60 * 1000;

function sha256(text) {
  return crypto.createHash('sha256').update(String(text), 'utf8').digest('hex');
}

function setCors(req, res) {
  const origin = req.get('Origin') || '';
  const allowed = [
    'https://yumelyrics.my.id',
    'http://localhost',
    'http://127.0.0.1',
  ];
  const ok =
    allowed.some((a) => origin.startsWith(a)) ||
    origin.endsWith('.pages.dev') ||
    origin.endsWith('.github.io');
  res.set('Access-Control-Allow-Origin', ok ? origin : 'https://yumelyrics.my.id');
  res.set('Vary', 'Origin');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
}

exports.verifyAdminGate = onRequest(
  {
    region: 'asia-southeast2',
    secrets: [gateHashSecret],
    maxInstances: 20,
  },
  async (req, res) => {
    setCors(req, res);
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    if (req.method !== 'POST') {
      res.status(405).json({ ok: false, error: 'method_not_allowed' });
      return;
    }

    const password = String(req.body?.password || '');
    const clientId = String(req.body?.clientId || 'unknown')
      .replace(/[^a-zA-Z0-9_-]/g, '')
      .slice(0, 120);

    if (!password || !clientId) {
      res.status(400).json({ ok: false, error: 'missing_fields' });
      return;
    }

    const expectedHash = gateHashSecret.value();
    if (!expectedHash) {
      res.status(500).json({ ok: false, error: 'gate_not_configured' });
      return;
    }

    const db = getFirestore();
    const ref = db.collection('gate_ratelimit').doc(clientId);
    const snap = await ref.get();
    const now = Date.now();
    const data = snap.exists ? snap.data() : { attempts: 0, lockUntil: 0 };

    if (data.lockUntil && now < data.lockUntil) {
      res.json({
        ok: false,
        locked: true,
        lockUntil: data.lockUntil,
        retrySec: Math.ceil((data.lockUntil - now) / 1000),
      });
      return;
    }

    if (sha256(password) === expectedHash.trim().toLowerCase()) {
      await ref.set({ attempts: 0, lockUntil: 0, lastOk: now }, { merge: true });
      res.json({ ok: true });
      return;
    }

    const attempts = (data.attempts || 0) + 1;
    if (attempts >= MAX_ATTEMPTS) {
      const lockUntil = now + LOCKOUT_MS;
      await ref.set({ attempts: 0, lockUntil, lastFail: now }, { merge: true });
      res.json({
        ok: false,
        locked: true,
        lockUntil,
        retrySec: Math.ceil(LOCKOUT_MS / 1000),
      });
      return;
    }

    await ref.set({ attempts, lockUntil: 0, lastFail: now }, { merge: true });
    res.json({
      ok: false,
      attemptsLeft: MAX_ATTEMPTS - attempts,
    });
  }
);
