const crypto = require('crypto');
const Stripe  = require('stripe');

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

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const adminPassword = process.env.ADMIN_PASSWORD || '';
  if (!adminPassword) {
    return res.status(500).json({ error: 'Server not configured.' });
  }

  const auth  = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim();
  if (!auth || !verifyToken(auth, adminPassword)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return res.json({ bookings: [] });
  }

  try {
    const stripe  = new Stripe(secretKey, { apiVersion: '2023-10-16' });
    // Fetch up to 100 most recent payment intents
    const intents = await stripe.paymentIntents.list({ limit: 100 });

    const bookings = intents.data
      .filter(pi => pi.status === 'succeeded' && pi.metadata && pi.metadata.checkin)
      .map(pi => ({
        id:          pi.metadata.ref || pi.id,
        name:        pi.metadata.name     || 'Unknown',
        email:       pi.metadata.email    || '',
        phone:       pi.metadata.phone    || '',
        checkin:     pi.metadata.checkin  || '',
        checkout:    pi.metadata.checkout || '',
        guests:      parseInt(pi.metadata.guests) || 1,
        rate:        855,
        status:      'Confirmed',
        source:      'stripe',
        amountCents: pi.amount,
        earlyCheckin: pi.metadata.earlyCheckin === '1',
        lateCheckout: pi.metadata.lateCheckout === '1',
        notes:       'Paid online via Stripe. Payment ID: ' + pi.id,
        paidAt:      new Date(pi.created * 1000).toISOString(),
      }));

    return res.json({ bookings });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
