const Stripe = require('stripe');
const { requireAdmin } = require('./_lib/auth');
const { normalizeBooking } = require('./_lib/booking-store');
const { readConfig } = require('./_lib/kv-config-store');
const { computeDueItems, todayInPropertyTz } = require('./_lib/automation-engine');
const { sendAllDue } = require('./_lib/run-automation');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!requireAdmin(req, res)) return;

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
    const pi = await stripe.paymentIntents.update(paymentIntentId, {
      metadata: { cancelled: '1' },
    });

    // Fire any enabled "on cancel" automated emails right away. Best-effort —
    // a failure here must never undo or mask the cancellation itself.
    let automationResults = [];
    try {
      const booking = normalizeBooking(pi);
      const { config } = await readConfig();
      const due = computeDueItems([booking], config, todayInPropertyTz());
      automationResults = await sendAllDue(due);
    } catch (_) {
      // swallow — cancellation already succeeded
    }

    return res.json({ success: true, automationResults });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
