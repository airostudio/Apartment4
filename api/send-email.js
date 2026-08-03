const { requireAdmin } = require('./_lib/auth');
const { sendEmail } = require('./_lib/send-email-core');
const { markEmailSent } = require('./_lib/booking-store');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!requireAdmin(req, res)) return;

  const { to, subject, text, html, fromName, bookingStripeId, templateId } = req.body || {};

  try {
    const result = await sendEmail({ to, subject, text, html, fromName });
    if (bookingStripeId && templateId) {
      // Best-effort — don't fail the whole request if the ledger write fails.
      await markEmailSent(bookingStripeId, templateId).catch(() => {});
    }
    return res.json({ success: true, id: result.id });
  } catch (e) {
    const status = e.code === 'NOT_CONFIGURED' ? 500 : (e.code === 'BAD_REQUEST' ? 400 : 500);
    return res.status(status).json({ error: e.message || 'Could not send email.' });
  }
};
