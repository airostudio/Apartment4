const Stripe = require('stripe');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return res.json({ ranges: [] });

  try {
    const stripe  = new Stripe(secretKey, { apiVersion: '2023-10-16' });
    const intents = await stripe.paymentIntents.list({ limit: 100 });
    const ranges  = intents.data
      .filter(pi => pi.status === 'succeeded' && pi.metadata && pi.metadata.checkin && pi.metadata.checkout)
      .map(pi => ({ checkin: pi.metadata.checkin, checkout: pi.metadata.checkout }));
    return res.json({ ranges });
  } catch (_) {
    return res.json({ ranges: [] }); // fail open — never block the guest UI
  }
};
