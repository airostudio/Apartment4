const { Resend } = require('resend');

/**
 * Core Resend send, shared by the HTTP handler (api/send-email.js) and
 * server-internal callers (cron, webhook) that send without an HTTP hop.
 * Throws on missing config or Resend failure — callers decide how to report it.
 */
async function sendEmail({ to, subject, text, html, fromName }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    const err = new Error('Email service not configured. Add RESEND_API_KEY to Vercel environment variables.');
    err.code = 'NOT_CONFIGURED';
    throw err;
  }
  if (!to || !subject || (!text && !html)) {
    const err = new Error('Missing required fields: to, subject, and text or html.');
    err.code = 'BAD_REQUEST';
    throw err;
  }

  const recipients = Array.isArray(to) ? to : [to];
  const fromAddress = `${fromName || 'Cascade Apartment 4'} <hello@cascadeskiapartments.com>`;

  const resend = new Resend(apiKey);
  const result = await resend.emails.send({
    from: fromAddress,
    to:   recipients,
    bcc:  ['thebutcher1@bigpond.com'],
    subject,
    text: text || '',
    html: html || undefined,
  });

  if (result.error) {
    const err = new Error(result.error.message || 'Could not send email.');
    throw err;
  }

  return { id: result.data ? result.data.id : (result.id || null) };
}

function textToHtml(text) {
  const escaped = String(text || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return '<div style="font-family:Inter,Arial,sans-serif;font-size:15px;line-height:1.7;color:#1e293b;max-width:600px;margin:0 auto;padding:32px 24px;">' +
    escaped.replace(/\n/g, '<br>') + '</div>';
}

module.exports = { sendEmail, textToHtml };
