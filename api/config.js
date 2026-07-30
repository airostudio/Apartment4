module.exports = (req, res) => {
  const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY || '';
  res.setHeader('Content-Type', 'application/json');
  res.json({ publishableKey, configured: !!publishableKey });
};
