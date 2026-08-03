const { requireAdmin } = require('./_lib/auth');
const { readConfig, writeConfig, kvConfigured } = require('./_lib/kv-config-store');

module.exports = async (req, res) => {
  if (!requireAdmin(req, res)) return;

  if (req.method === 'GET') {
    try {
      const { config, source } = await readConfig();
      return res.json({ config, editable: kvConfigured(), source });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === 'PUT') {
    const { config } = req.body || {};
    if (!config || !Array.isArray(config.templates) || typeof config.automationRules !== 'object') {
      return res.status(400).json({ error: 'Invalid config payload.' });
    }
    try {
      await writeConfig(config);
      return res.json({ success: true });
    } catch (e) {
      const status = e.code === 'NOT_CONFIGURED' ? 501 : 500;
      return res.status(status).json({ error: e.message, code: e.code });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
