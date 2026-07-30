const crypto = require('crypto');

function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, bufA); // dummy compare to keep timing consistent
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const adminEmail    = process.env.ADMIN_EMAIL    || '';
  const adminPassword = process.env.ADMIN_PASSWORD || '';

  if (!adminEmail || !adminPassword) {
    return res.status(500).json({ error: 'Admin credentials are not configured on the server.' });
  }

  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ success: false });
  }

  const emailOk = safeEqual(email.toLowerCase().trim(), adminEmail.toLowerCase().trim());
  const passOk  = safeEqual(password, adminPassword);

  if (emailOk && passOk) {
    return res.json({ success: true, role: 'owner' });
  }

  await new Promise(function(r) { setTimeout(r, 400); });
  return res.status(401).json({ success: false });
};
