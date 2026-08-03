const { requireAdmin } = require('./_lib/auth');
const { kvConfigured } = require('./_lib/kv-config-store');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!requireAdmin(req, res)) return;

  return res.json({
    databaseConfigured:      kvConfigured(),
    cronSecretConfigured:    !!process.env.CRON_SECRET,
    webhookSecretConfigured: !!process.env.STRIPE_WEBHOOK_SECRET,
    resendConfigured:        !!process.env.RESEND_API_KEY,
    stripeConfigured:        !!process.env.STRIPE_SECRET_KEY,
  });
};
