'use strict';

// ============================================================
// ONE-TIME SETUP: Visit /api/google-auth in your browser
// while logged in to Google as info@realmissai.com.
// It redirects to Google's consent screen, then back to
// /api/oauth/callback which displays your refresh token.
// Copy that token into GOOGLE_REFRESH_TOKEN in Vercel env vars.
// ============================================================

const { google } = require('googleapis');
const creds = require('../google-credentials.json');

module.exports = function handler(req, res) {
  const { client_id, client_secret, redirect_uris } = creds.web;

  const auth = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  const authUrl = auth.generateAuthUrl({
    access_type: 'offline',
    prompt:      'consent', // always show consent screen to guarantee refresh_token
    scope: [
      'https://www.googleapis.com/auth/documents',
      'https://www.googleapis.com/auth/drive.file',
    ],
  });

  res.redirect(authUrl);
};
