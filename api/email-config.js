const { requireAdmin } = require('./_lib/auth');
const { readConfig, writeConfig, githubEnv } = require('./_lib/github-config-store');

module.exports = async (req, res) => {
  if (!requireAdmin(req, res)) return;

  if (req.method === 'GET') {
    try {
      const { config, sha, source } = await readConfig();
      return res.json({ config, sha, editable: githubEnv().configured, source });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === 'PUT') {
    const { config, sha } = req.body || {};
    if (!config || !Array.isArray(config.templates) || typeof config.automationRules !== 'object') {
      return res.status(400).json({ error: 'Invalid config payload.' });
    }
    try {
      const result = await writeConfig(config, sha);
      return res.json({ success: true, sha: result.sha });
    } catch (e) {
      const status = e.code === 'NOT_CONFIGURED' ? 501 : (e.status === 409 ? 409 : 500);
      return res.status(status).json({ error: e.message, code: e.code });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
