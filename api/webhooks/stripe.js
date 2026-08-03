const Stripe = require('stripe');
const { normalizeBooking } = require('../_lib/booking-store');
const { readConfig } = require('../_lib/kv-config-store');
const { computeDueItems, todayInPropertyTz } = require('../_lib/automation-engine');
const { sendAllDue } = require('../_lib/run-automation');

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const secretKey     = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secretKey || !webhookSecret) {
    // Fail closed — an unverifiable webhook must not be trusted.
    return res.status(500).json({ error: 'Webhook not configured (STRIPE_WEBHOOK_SECRET missing).' });
  }

  const stripe = new Stripe(secretKey, { apiVersion: '2023-10-16' });
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    const rawBody = await readRawBody(req);
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (e) {
    return res.status(400).json({ error: `Webhook signature verification failed: ${e.message}` });
  }

  if (event.type !== 'payment_intent.succeeded') {
    return res.json({ received: true, skipped: true });
  }

  try {
    const pi = event.data.object;
    if (!pi.metadata || !pi.metadata.checkin) {
      return res.json({ received: true, skipped: true, reason: 'no booking metadata' });
    }
    const booking = normalizeBooking(pi);
    const { config } = await readConfig();
    const due = computeDueItems([booking], config, todayInPropertyTz());
    const results = await sendAllDue(due);
    return res.json({ received: true, sent: results });
  } catch (e) {
    // Stripe retries on non-2xx, but we've already verified + accepted the
    // event — report success and let the daily cron catch anything missed.
    return res.json({ received: true, error: e.message });
  }
}

module.exports = handler;
// Vercel-specific: disable automatic JSON body parsing so we can verify the
// raw Stripe signature before touching the payload.
module.exports.config = { api: { bodyParser: false } };
