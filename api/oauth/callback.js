'use strict';

// ============================================================
// OAuth2 callback — exchanges the auth code for tokens and
// displays the refresh token so it can be pasted into Vercel.
// ============================================================

const { google } = require('googleapis');
const creds = require('../../google-credentials.json');

module.exports = async function handler(req, res) {
  const { code, error } = req.query;

  if (error) {
    return res.status(400).send('<h1>Google Auth Error</h1><pre>' + error + '</pre>');
  }

  if (!code) {
    return res.status(400).send('<h1>No code in callback</h1>');
  }

  const { client_id, client_secret, redirect_uris } = creds.web;
  const auth = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  let tokens;
  try {
    const result = await auth.getToken(code);
    tokens = result.tokens;
  } catch (err) {
    return res.status(500).send('<h1>Token exchange failed</h1><pre>' + err.message + '</pre>');
  }

  const refreshToken = tokens.refresh_token;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Google Auth — Refresh Token</title>
  <style>
    body { font-family: sans-serif; max-width: 700px; margin: 4rem auto; padding: 0 2rem; }
    h1   { color: #111; }
    pre  { background: #f0f0f0; padding: 1.5rem; word-break: break-all; white-space: pre-wrap; border-radius: 4px; }
    .ok  { color: #057a55; font-weight: bold; }
    .warn { color: #b45309; font-weight: bold; }
    ol   { line-height: 2; }
  </style>
</head>
<body>
  <h1>✅ Google Authorization Successful</h1>

  ${refreshToken ? `
  <p class="ok">Refresh token received. Copy it into Vercel now.</p>
  <pre>${refreshToken}</pre>
  <ol>
    <li>Go to <a href="https://vercel.com/dashboard" target="_blank">Vercel Dashboard</a> → your project → Settings → Environment Variables.</li>
    <li>Add a new variable: <strong>GOOGLE_REFRESH_TOKEN</strong></li>
    <li>Paste the value above and save.</li>
    <li>Redeploy the project for the variable to take effect.</li>
    <li>You only need to do this once. The refresh token does not expire unless you revoke access.</li>
  </ol>
  ` : `
  <p class="warn">⚠️ No refresh token returned. This usually means the app has already been authorised before.</p>
  <p>To force a new refresh token:</p>
  <ol>
    <li>Go to <a href="https://myaccount.google.com/permissions" target="_blank">Google Account Permissions</a>.</li>
    <li>Find this app and click <strong>Remove Access</strong>.</li>
    <li>Then visit <a href="/api/google-auth">/api/google-auth</a> again.</li>
  </ol>
  `}

  <hr>
  <p><small>Access token (short-lived, for reference): <code>${tokens.access_token ? tokens.access_token.slice(0, 20) + '…' : 'none'}</code></small></p>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html');
  return res.status(200).send(html);
};
