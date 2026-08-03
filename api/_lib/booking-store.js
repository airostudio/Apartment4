const Stripe = require('stripe');

function getStripe() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return null;
  return new Stripe(secretKey, { apiVersion: '2023-10-16' });
}

function normalizeBooking(pi) {
  const emailsSent = (pi.metadata.emailsSent || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  return {
    id:           pi.metadata.ref || pi.id,
    stripeId:     pi.id,
    name:         pi.metadata.name     || 'Unknown',
    email:        pi.metadata.email    || '',
    phone:        pi.metadata.phone    || '',
    checkin:      pi.metadata.checkin  || '',
    checkout:     pi.metadata.checkout || '',
    guests:       parseInt(pi.metadata.guests) || 1,
    rate:         855,
    status:       pi.metadata.cancelled === '1' ? 'Cancelled' : 'Confirmed',
    cancelled:    pi.metadata.cancelled === '1',
    source:       'stripe',
    amountCents:  pi.amount,
    earlyCheckin: pi.metadata.earlyCheckin === '1',
    lateCheckout: pi.metadata.lateCheckout === '1',
    notes:        'Paid online via Stripe. Payment ID: ' + pi.id,
    createdAt:    pi.metadata.createdAt || new Date(pi.created * 1000).toISOString(),
    paidAt:       new Date(pi.created * 1000).toISOString(),
    emailsSent:   emailsSent,
  };
}

/**
 * Lists bookings derived from succeeded Stripe PaymentIntents.
 * By default excludes cancelled bookings (matches the public/admin "active
 * bookings" view). Pass includeCancelled:true for automation/email purposes
 * that still need to act on cancelled bookings (e.g. on_cancel emails).
 */
async function listBookings({ includeCancelled = false } = {}) {
  const stripe = getStripe();
  if (!stripe) return [];

  const intents = await stripe.paymentIntents.list({ limit: 100 });
  return intents.data
    .filter(pi => pi.status === 'succeeded' && pi.metadata && pi.metadata.checkin)
    .filter(pi => includeCancelled || pi.metadata.cancelled !== '1')
    .map(normalizeBooking);
}

/**
 * Appends a template id to a booking's emailsSent ledger (stored in Stripe
 * PaymentIntent metadata) so it isn't sent again by automation or manual
 * "Send Now" actions. No-ops silently if already present.
 */
async function markEmailSent(stripeId, templateId) {
  const stripe = getStripe();
  if (!stripe || !stripeId || !templateId) return;

  const pi = await stripe.paymentIntents.retrieve(stripeId);
  const existing = (pi.metadata.emailsSent || '').split(',').map(s => s.trim()).filter(Boolean);
  if (existing.includes(templateId)) return;
  existing.push(templateId);

  await stripe.paymentIntents.update(stripeId, {
    metadata: { emailsSent: existing.join(',').slice(0, 500) },
  });
}

module.exports = { getStripe, normalizeBooking, listBookings, markEmailSent };
