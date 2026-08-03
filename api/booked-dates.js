const { listBookings } = require('./_lib/booking-store');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();

  try {
    const bookings = await listBookings({ includeCancelled: false });
    const ranges = bookings.map(b => ({ checkin: b.checkin, checkout: b.checkout }));
    return res.json({ ranges });
  } catch (_) {
    return res.json({ ranges: [] }); // fail open — never block the guest UI
  }
};
