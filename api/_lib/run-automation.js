const { sendEmail, textToHtml } = require('./send-email-core');
const { markEmailSent } = require('./booking-store');
const { applyBookingVars } = require('./template-vars');

/**
 * Sends one due (booking, template) pair and records it in the booking's
 * emailsSent ledger. Never throws — returns a result object so batch callers
 * (cron) can keep going after one failure instead of aborting the whole run.
 */
async function sendDueItem(item) {
  const { booking, template } = item;
  try {
    const subject = applyBookingVars(template.subject, booking);
    const body    = applyBookingVars(template.body, booking);
    await sendEmail({ to: booking.email, subject, text: body, html: textToHtml(body) });
    await markEmailSent(booking.stripeId, template.id);
    return { success: true, bookingId: booking.id, templateId: template.id };
  } catch (e) {
    return { success: false, bookingId: booking.id, templateId: template.id, error: e.message };
  }
}

async function sendAllDue(dueItems) {
  const results = [];
  for (const item of dueItems) {
    results.push(await sendDueItem(item));
  }
  return results;
}

module.exports = { sendDueItem, sendAllDue };
