const { listBookings } = require('../_lib/booking-store');
const { readConfig } = require('../_lib/github-config-store');
const { computeDueItems, todayInPropertyTz } = require('../_lib/automation-engine');
const { sendAllDue } = require('../_lib/run-automation');

module.exports = async (req, res) => {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    // Fail closed: without a secret configured, this endpoint would be an
    // unauthenticated "email every guest" trigger callable by anyone.
    return res.status(500).json({ error: 'CRON_SECRET is not configured — refusing to run.' });
  }

  const auth = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim();
  if (auth !== cronSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const [bookings, { config }] = await Promise.all([
      listBookings({ includeCancelled: true }),
      readConfig(),
    ]);
    const today = todayInPropertyTz();
    const due = computeDueItems(bookings, config, today);
    const results = await sendAllDue(due);

    const sent   = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success);

    return res.json({ today, checked: bookings.length, due: due.length, sent, failed });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
