const fs = require('fs');
const path = require('path');

const KEY = 'email-config';
const LOCAL_FALLBACK_PATH = path.join(__dirname, '..', '..', 'data', 'email-config.json');

/**
 * Vercel deprecated the native "Vercel KV" product in favor of Marketplace
 * database integrations (Upstash Redis, etc.). Depending on how the
 * database gets connected, the REST credentials may show up under either
 * naming convention — support both instead of guessing which one applies.
 */
function redisEnv() {
  const url   = process.env.KV_REST_API_URL   || process.env.UPSTASH_REDIS_REST_URL   || '';
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
  return { url, token, configured: !!(url && token) };
}

function kvConfigured() {
  return redisEnv().configured;
}

function readLocalFallback() {
  return JSON.parse(fs.readFileSync(LOCAL_FALLBACK_PATH, 'utf8'));
}

/** Talks to the Upstash Redis REST API directly (no SDK dependency —
 * @vercel/kv was just a thin wrapper around this same API, and the SDK
 * choice shouldn't matter once we're calling the stable HTTP interface). */
async function redisCommand(command) {
  const { url, token } = redisEnv();
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
  });
  const data = await resp.json();
  if (!resp.ok || data.error) {
    throw new Error(data.error || `Redis request failed (${resp.status})`);
  }
  return data.result;
}

/**
 * Reads the live email config (templates + automationRules) from a real
 * database, not a git commit, so saves are instant and immune to
 * branch/redeploy mismatches. On first ever read (empty database), seeds it
 * from the bundled defaults so nothing is lost, then the database becomes
 * authoritative. Falls back to the bundled file (read-only) if no database
 * is connected yet.
 */
async function readConfig() {
  if (kvConfigured()) {
    try {
      const raw = await redisCommand(['GET', KEY]);
      if (raw) return { config: JSON.parse(raw), source: 'kv' };
      const seeded = readLocalFallback();
      await redisCommand(['SET', KEY, JSON.stringify(seeded)]);
      return { config: seeded, source: 'kv' };
    } catch (_) {
      // fall through to local fallback
    }
  }
  return { config: readLocalFallback(), source: 'local' };
}

/**
 * Overwrites the stored config. Requires a connected database — throws
 * NOT_CONFIGURED otherwise so callers fail loudly instead of silently
 * discarding the admin's edit.
 */
async function writeConfig(newConfig) {
  if (!kvConfigured()) {
    const err = new Error('The email template database isn’t connected yet — add a Redis/KV database (e.g. Upstash) to this project from the Vercel Marketplace first. Your change was not saved.');
    err.code = 'NOT_CONFIGURED';
    throw err;
  }
  await redisCommand(['SET', KEY, JSON.stringify(newConfig)]);
  return { success: true };
}

module.exports = { readConfig, writeConfig, kvConfigured };
