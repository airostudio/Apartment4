const { requireAdmin } = require('./_lib/auth');
const { listBookings } = require('./_lib/booking-store');
const { readConfig } = require('./_lib/github-config-store');
const { computeDueItems, todayInPropertyTz } = require('./_lib/automation-engine');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!requireAdmin(req, res)) return;

  try {
    const [bookings, { config }] = await Promise.all([
      listBookings({ includeCancelled: true }),
      readConfig(),
    ]);
    const today = todayInPropertyTz();
    const due = computeDueItems(bookings, config, today);

    return res.json({
      today,
      due: due.map(item => ({
        booking: item.booking,
        template: item.template,
        rule: item.rule,
      })),
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
