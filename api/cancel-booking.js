const crypto = require('crypto');
const Stripe  = require('stripe');

function verifyToken(token, adminPassword) {
  try {
    const decoded   = Buffer.from(token, 'base64').toString('utf8');
    const lastColon = decoded.lastIndexOf(':');
    if (lastColon < 0) return false;
    const payload  = decoded.slice(0, lastColon);
    const hmac     = decoded.slice(lastColon + 1);
    const parts    = payload.split(':');
    const ts       = parseInt(parts[parts.length - 1], 10);
    if (isNaN(ts) || Date.now() - ts > 86400000) return false;
    const expected = crypto.createHmac('sha256', adminPassword).update(payload).digest('hex');
    const bufA     = Buffer.from(expected);
    const bufB     = Buffer.from(hmac);
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  } catch (_) { return false; }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const adminPassword = process.env.ADMIN_PASSWORD || '';
  if (!adminPassword) {
    return res.status(500).json({ error: 'Server not configured.' });
  }

  const auth = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim();
  if (!auth || !verifyToken(auth, adminPassword)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { paymentIntentId } = req.body || {};
  if (!paymentIntentId || !/^pi_/.test(paymentIntentId)) {
    return res.status(400).json({ error: 'Invalid payment intent ID.' });
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return res.status(500).json({ error: 'Stripe not configured.' });
  }

  try {
    const stripe = new Stripe(secretKey, { apiVersion: '2023-10-16' });
    await stripe.paymentIntents.update(paymentIntentId, {
      metadata: { cancelled: '1' },
    });
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
