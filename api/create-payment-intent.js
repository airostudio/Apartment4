const Stripe = require('stripe');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return res.status(500).json({ error: 'Stripe not configured on the server.' });
  }

  const { amountCents, currency, booking } = req.body;

  if (!amountCents || !Number.isInteger(amountCents) || amountCents < 50) {
    return res.status(400).json({ error: 'Invalid payment amount.' });
  }

  try {
    const stripe = new Stripe(secretKey, { apiVersion: '2023-10-16' });
    const metadata = booking ? {
      ref:          String(booking.ref      || ''),
      name:         String(booking.name     || ''),
      email:        String(booking.email    || ''),
      phone:        String(booking.phone    || ''),
      checkin:      String(booking.checkin  || ''),
      checkout:     String(booking.checkout || ''),
      guests:       String(booking.guests   || ''),
      earlyCheckin: String(booking.earlyCheckin || '0'),
      lateCheckout: String(booking.lateCheckout || '0'),
      createdAt:    new Date().toISOString(),
    } : {};
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: (currency || 'aud').toLowerCase(),
      automatic_payment_methods: { enabled: true },
      metadata,
    });
    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Could not create payment.' });
  }
};
