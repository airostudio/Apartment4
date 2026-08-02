const crypto = require('crypto');

function verifyToken(token, adminPassword) {
  try {
    const decoded   = Buffer.from(token, 'base64').toString('utf8');
    const lastColon = decoded.lastIndexOf(':');
    if (lastColon < 0) return false;
    const payload   = decoded.slice(0, lastColon);
    const hmac      = decoded.slice(lastColon + 1);
    const parts     = payload.split(':');
    const ts        = parseInt(parts[parts.length - 1], 10);
    if (isNaN(ts) || Date.now() - ts > 86400000) return false; // 24h expiry
    const expected  = crypto.createHmac('sha256', adminPassword).update(payload).digest('hex');
    const bufA      = Buffer.from(expected);
    const bufB      = Buffer.from(hmac);
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  } catch (_) { return false; }
}

/**
 * Requires a valid admin session Bearer token on the request.
 * On failure, writes the response and returns false — caller should
 * `if (!requireAdmin(req, res)) return;` immediately after calling.
 */
function requireAdmin(req, res) {
  const adminPassword = process.env.ADMIN_PASSWORD || '';
  if (!adminPassword) {
    res.status(500).json({ error: 'Server not configured.' });
    return false;
  }
  const auth = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim();
  if (!auth || !verifyToken(auth, adminPassword)) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

module.exports = { verifyToken, requireAdmin };
