const PROPERTY_NAME = 'Cascade Apartment 4';

function fmtBookingDate(dateStr) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-AU', {
    weekday: 'short', day: 'numeric', month: 'long', year: 'numeric',
  });
}

function calcTotalStr(booking) {
  if (booking.amountCents) {
    return '$' + (booking.amountCents / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  const nights = Math.round((new Date(booking.checkout + 'T12:00:00') - new Date(booking.checkin + 'T12:00:00')) / 86400000);
  return '$' + (nights * (booking.rate || 855) + 150).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Mirrors the client-side substitution in admin/emails.html — keep both in sync. */
function applyBookingVars(text, booking) {
  const nights = Math.round((new Date(booking.checkout + 'T12:00:00') - new Date(booking.checkin + 'T12:00:00')) / 86400000);
  const guestCount = booking.guests || 1;
  return String(text || '')
    .replace(/\{\{guest_name\}\}/g, booking.name || 'Guest')
    .replace(/\{\{check_in\}\}/g, fmtBookingDate(booking.checkin))
    .replace(/\{\{check_out\}\}/g, fmtBookingDate(booking.checkout))
    .replace(/\{\{booking_ref\}\}/g, booking.id || '')
    .replace(/\{\{property_name\}\}/g, PROPERTY_NAME)
    .replace(/\{\{guest_count\}\}/g, guestCount + ' guest' + (guestCount !== 1 ? 's' : ''))
    .replace(/\{\{total_amount\}\}/g, calcTotalStr(booking))
    .replace(/\{\{nights\}\}/g, String(nights))
    .replace(/\{\{payment_date\}\}/g, booking.paidAt ? new Date(booking.paidAt).toLocaleDateString('en-AU') : '')
    .replace(/\{\{payment_method\}\}/g, booking.source === 'stripe' ? 'Credit Card (Stripe)' : 'Manual');
}

module.exports = { PROPERTY_NAME, fmtBookingDate, calcTotalStr, applyBookingVars };
