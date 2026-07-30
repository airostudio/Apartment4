const { Resend } = require('resend');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Email service not configured. Add RESEND_API_KEY to Vercel environment variables.' });
  }

  const { to, subject, text, html, fromName } = req.body || {};

  if (!to || !subject || (!text && !html)) {
    return res.status(400).json({ error: 'Missing required fields: to, subject, and text or html.' });
  }

  const recipients = Array.isArray(to) ? to : [to];
  const fromAddress = `${fromName || 'Cascade Apartment 4'} <hello@cascadeskiapartments.com>`;

  try {
    const resend = new Resend(apiKey);
    const result = await resend.emails.send({
      from: fromAddress,
      to:   recipients,
      subject,
      text: text || '',
      html: html  || undefined,
    });
    return res.json({ success: true, id: result.data ? result.data.id : result.id });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Could not send email.' });
  }
};
