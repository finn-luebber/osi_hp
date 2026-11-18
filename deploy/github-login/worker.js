/**
 * Login service for the editing interface when the repository is on GitHub.
 * Uses a GitHub App (not an OAuth App), so the key the editor receives
 *   - only reaches the repositories the app is installed on (here: the website repository),
 *   - only allows what the app may do (here: read and write files),
 *   - stops working after 8 hours.
 * The refresh key GitHub also sends stays here and is thrown away; it never reaches the browser.
 *
 * Runs as a Cloudflare Worker (free plan is enough). Setup: docs/HOSTING.md, part (a), step 2.
 *
 * Settings (Worker › Settings › Variables and Secrets):
 *   GITHUB_CLIENT_ID      Client ID of the GitHub App (not the App ID)
 *   GITHUB_CLIENT_SECRET  a client secret of the GitHub App (add it as a secret)
 *   ALLOWED_ORIGIN        address of the website, e.g. https://osi-luebeck.github.io
 *   GITHUB_REPOSITORY     the website repository, e.g. osi-luebeck/website
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const allowed = (env.ALLOWED_ORIGIN || '').replace(/\/$/, '');

    // 1. The editor opens /auth in a pop-up: send the editor to GitHub to log in.
    if (url.pathname === '/auth') {
      const state = crypto.randomUUID();
      const target = new URL('https://github.com/login/oauth/authorize');
      target.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
      target.searchParams.set('state', state);
      target.searchParams.set('redirect_uri', `${url.origin}/callback`);
      target.searchParams.set('allow_signup', 'false');
      return new Response(null, {
        status: 302,
        headers: {
          Location: target.toString(),
          'Set-Cookie': `osi_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
          'Cache-Control': 'no-store',
        },
      });
    }

    // 2. GitHub sends the editor back with a one-time code: swap it for a key.
    if (url.pathname === '/callback') {
      if (url.searchParams.get('error')) {
        return reply('error', { message: 'The login was cancelled.' }, allowed);
      }
      const cookie = (request.headers.get('Cookie') || '').match(/osi_state=([\w-]+)/);
      if (!cookie || cookie[1] !== url.searchParams.get('state')) {
        return reply('error', { message: 'The login took too long or was started elsewhere. Please try again.' }, allowed);
      }
      const res = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: env.GITHUB_CLIENT_ID,
          client_secret: env.GITHUB_CLIENT_SECRET,
          code: url.searchParams.get('code'),
          redirect_uri: `${url.origin}/callback`,
        }),
      });
      const data = await res.json();
      if (!data.access_token) {
        return reply('error', { message: data.error_description || 'GitHub did not confirm the login.' }, allowed);
      }

      // 3. Only hand out the key if it can write to the website repository.
      if (env.GITHUB_REPOSITORY) {
        const check = await fetch(`https://api.github.com/repos/${env.GITHUB_REPOSITORY}`, {
          headers: {
            Authorization: `Bearer ${data.access_token}`,
            Accept: 'application/vnd.github+json',
            'User-Agent': 'osi-luebeck-login',
            'X-GitHub-Api-Version': '2022-11-28',
          },
        });
        const repo = check.ok ? await check.json() : null;
        if (!repo || !repo.permissions || !repo.permissions.push) {
          await revoke(env, data.access_token);
          return reply('error', { message: 'Your GitHub account may not edit this website. Ask for write access to the repository, and check that the GitHub App is installed on it.' }, allowed);
        }
      }
      return reply('success', { token: data.access_token, provider: 'github' }, allowed);
    }

    return new Response('OSI Lübeck login service', { status: 200, headers: { 'Content-Type': 'text/plain' } });
  },
};

/** Withdraws a key that will not be used, so it does not linger at GitHub. */
async function revoke(env, token) {
  try {
    await fetch(`https://api.github.com/applications/${env.GITHUB_CLIENT_ID}/token`, {
      method: 'DELETE',
      headers: {
        Authorization: `Basic ${btoa(`${env.GITHUB_CLIENT_ID}:${env.GITHUB_CLIENT_SECRET}`)}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'osi-luebeck-login',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ access_token: token }),
    });
  } catch { /* the key expires after 8 hours anyway */ }
}

/** Hands the result to the editor window, but only if that window belongs to the website. */
function reply(status, content, allowed) {
  const message = `authorization:github:${status}:${JSON.stringify(content)}`;
  const page = `<!DOCTYPE html><meta charset="utf-8"><title>Login</title><p>One moment …</p><script>
(function () {
  var allowed = ${JSON.stringify(allowed)};
  window.addEventListener('message', function (e) {
    if (e.origin !== allowed) { return; }
    window.opener.postMessage(${JSON.stringify(message)}, e.origin);
    window.close();
  }, false);
  window.opener.postMessage('authorizing:github', allowed);
})();
</script>`;
  return new Response(page, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}
