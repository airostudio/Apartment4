const { requireAdmin } = require('./_lib/auth');
const { listBookings } = require('./_lib/booking-store');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!requireAdmin(req, res)) return;

  try {
    const bookings = await listBookings({ includeCancelled: false });
    return res.json({ bookings });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
