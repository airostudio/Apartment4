const fs = require('fs');
const path = require('path');

const CONFIG_PATH = 'data/email-config.json';
const LOCAL_FALLBACK_PATH = path.join(__dirname, '..', '..', 'data', 'email-config.json');

function githubEnv() {
  const token  = process.env.GITHUB_TOKEN || '';
  const repo   = process.env.GITHUB_REPO || 'airostudio/apartment4';
  const branch = process.env.GITHUB_BRANCH || 'main';
  return { token, repo, branch, configured: !!token };
}

/**
 * Reads the live email config (templates + automationRules).
 * Prefers the GitHub Contents API (so admin saves are visible immediately,
 * with no need to wait for a redeploy of the bundled file). Falls back to
 * the bundled repo file (read-only) if GITHUB_TOKEN isn't configured, or if
 * the GitHub API call fails for any reason.
 */
async function readConfig() {
  const { token, repo, branch, configured } = githubEnv();

  if (configured) {
    try {
      const resp = await fetch(
        `https://api.github.com/repos/${repo}/contents/${CONFIG_PATH}?ref=${encodeURIComponent(branch)}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github+json',
            'User-Agent': 'cascade-apartment4-email-automation',
          },
        }
      );
      if (resp.ok) {
        const data = await resp.json();
        const content = Buffer.from(data.content, 'base64').toString('utf8');
        const parsed = JSON.parse(content);
        return { config: parsed, sha: data.sha, source: 'github' };
      }
    } catch (_) {
      // fall through to local fallback
    }
  }

  const raw = fs.readFileSync(LOCAL_FALLBACK_PATH, 'utf8');
  return { config: JSON.parse(raw), sha: null, source: 'local' };
}

/**
 * Commits a new config to GitHub. Requires GITHUB_TOKEN. `expectedSha` should
 * be the `sha` returned by a prior readConfig() call, used for optimistic
 * concurrency (GitHub rejects the write if the file changed since).
 */
async function writeConfig(newConfig, expectedSha) {
  const { token, repo, branch, configured } = githubEnv();
  if (!configured) {
    const err = new Error('GITHUB_TOKEN is not configured — cannot save. Add it in your Vercel project environment variables.');
    err.code = 'NOT_CONFIGURED';
    throw err;
  }

  const content = Buffer.from(JSON.stringify(newConfig, null, 2) + '\n', 'utf8').toString('base64');
  const body = {
    message: 'Update email templates/automation rules via admin panel',
    content,
    branch,
  };
  if (expectedSha) body.sha = expectedSha;

  const resp = await fetch(`https://api.github.com/repos/${repo}/contents/${CONFIG_PATH}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'cascade-apartment4-email-automation',
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errBody = await resp.json().catch(() => ({}));
    const err = new Error(errBody.message || `GitHub commit failed (${resp.status})`);
    err.status = resp.status;
    throw err;
  }

  const data = await resp.json();
  return { sha: data.content ? data.content.sha : null };
}

module.exports = { readConfig, writeConfig, githubEnv };
