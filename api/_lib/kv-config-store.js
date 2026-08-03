const fs = require('fs');
const path = require('path');
const { kv } = require('@vercel/kv');

const KEY = 'email-config';
const LOCAL_FALLBACK_PATH = path.join(__dirname, '..', '..', 'data', 'email-config.json');

function kvConfigured() {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

function readLocalFallback() {
  return JSON.parse(fs.readFileSync(LOCAL_FALLBACK_PATH, 'utf8'));
}

/**
 * Reads the live email config (templates + automationRules) from Vercel KV —
 * a real database, not a git commit, so saves are instant and immune to
 * branch/redeploy mismatches. On first ever read (empty KV), seeds it from
 * the bundled defaults so nothing is lost, then KV becomes authoritative.
 * Falls back to the bundled file (read-only) if KV isn't connected yet.
 */
async function readConfig() {
  if (kvConfigured()) {
    try {
      let config = await kv.get(KEY);
      if (!config) {
        config = readLocalFallback();
        await kv.set(KEY, config);
      }
      return { config, source: 'kv' };
    } catch (_) {
      // fall through to local fallback
    }
  }
  return { config: readLocalFallback(), source: 'local' };
}

/**
 * Overwrites the stored config. Requires Vercel KV to be connected — throws
 * NOT_CONFIGURED otherwise so callers fail loudly instead of silently
 * discarding the admin's edit.
 */
async function writeConfig(newConfig) {
  if (!kvConfigured()) {
    const err = new Error('The email template database isn’t connected yet — add Vercel KV to this project in the Vercel dashboard first. Your change was not saved.');
    err.code = 'NOT_CONFIGURED';
    throw err;
  }
  await kv.set(KEY, newConfig);
  return { success: true };
}

module.exports = { readConfig, writeConfig, kvConfigured };
