/**
 * Small login service for the editing interface when the repository is on GitHub.
 * GitHub only hands out logins to a server that keeps a secret; this is that server.
 * It runs as a Cloudflare Worker (free plan is enough). Setup: docs/HOSTING.md, part B.
 *
 * Settings (Worker › Settings › Variables):
 *   GITHUB_CLIENT_ID      from the GitHub OAuth app
 *   GITHUB_CLIENT_SECRET  from the GitHub OAuth app (as an encrypted secret)
 *   ALLOWED_ORIGIN        address of the website, e.g. https://osi-luebeck.github.io
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
      target.searchParams.set('scope', 'repo');
      target.searchParams.set('state', state);
      target.searchParams.set('redirect_uri', `${url.origin}/callback`);
      return new Response(null, {
        status: 302,
        headers: {
          Location: target.toString(),
          'Set-Cookie': `osi_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
        },
      });
    }

    // 2. GitHub sends the editor back with a one-time code: swap it for a token.
    if (url.pathname === '/callback') {
      const cookie = (request.headers.get('Cookie') || '').match(/osi_state=([\w-]+)/);
      if (!cookie || cookie[1] !== url.searchParams.get('state')) {
        return reply('error', { message: 'The login took too long or was started elsewhere. Please try again.' }, allowed);
      }
      const res = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET, code: url.searchParams.get('code') }),
      });
      const data = await res.json();
      return data.access_token
        ? reply('success', { token: data.access_token, provider: 'github' }, allowed)
        : reply('error', { message: data.error_description || 'GitHub did not confirm the login.' }, allowed);
    }

    return new Response('OSI Lübeck login service', { status: 200 });
  },
};

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
