'use strict';

const crypto  = require('crypto');
const path    = require('path');
const { google } = require('googleapis');

// Vercel: skip body parsing so we receive the raw stream for HMAC verification
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // --- Read raw body -------------------------------------------------------
  const rawBody = await readRawBody(req);

  // --- Signature verification temporarily disabled -------------------------
  console.log('[Calendly] Signature check skipped (disabled for testing)');

  // --- Parse JSON payload --------------------------------------------------
  let body;
  try {
    body = JSON.parse(rawBody);
  } catch (err) {
    console.warn('[Calendly] JSON parse failed:', err.message);
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  console.log('[Calendly] Raw payload:', JSON.stringify(body, null, 2));

  // --- Extract fields -------------------------------------------------------
  const p              = body.payload           || {};
  const scheduledEvent = p.scheduled_event      || {};
  const location       = scheduledEvent.location || {};
  const qas            = p.questions_and_answers || [];

  const name             = p.name                    || null;
  const email            = p.email                   || null;
  const timezone         = p.timezone                || null;
  const eventName        = scheduledEvent.name       || null;
  const startTime        = scheduledEvent.start_time || null;
  const endTime          = scheduledEvent.end_time   || null;
  const meetingLink      = location.join_url         || null;

  const company          = findAnswer(qas, ['company']);
  const website          = findAnswer(qas, ['website', 'social']);
  const biggestChallenge = findAnswer(qas, ['help', 'challenge']);

  console.log('[Calendly] New booking:', JSON.stringify({
    name, email, timezone, eventName, startTime, endTime,
    meetingLink, company, website, biggestChallenge, allQAs: qas,
  }, null, 2));

  // --- Research + doc + notification in background -------------------------
  // Fire-and-forget: don't await so we respond to Calendly immediately.
  processBooking({ name, email, company, website, biggestChallenge, startTime, meetingLink })
    .catch(function (err) {
      console.error('[processBooking] Failed:', err.message);
    });

  return res.status(200).json({ received: true });
};

module.exports.config = {
  api: { bodyParser: false },
};

// ---------------------------------------------------------------------------

async function processBooking({ name, email, company, website, biggestChallenge, startTime, meetingLink }) {
  // 1. Research the client via Claude
  const prepNote = await researchClient({ name, company, website, biggestChallenge });
  if (!prepNote) return;

  // 2. Create Google Doc and share with user
  let docUrl = null;
  try {
    const doc = await createGoogleDoc({ name, startTime, prepNote });
    docUrl = doc ? doc.docUrl : null;
  } catch (err) {
    console.error('[Google] Doc creation failed:', err.message);
  }

  // 3. Send Telegram notification
  try {
    await sendTelegramNotification({ name, email, company, startTime, meetingLink, prepNote, docUrl });
  } catch (err) {
    console.error('[Telegram] Notification failed:', err.message);
  }
}

// ---------------------------------------------------------------------------
// Read raw request body from a Node readable stream
function readRawBody(req) {
  return new Promise(function (resolve, reject) {
    var chunks = [];
    req.on('data', function (chunk) { chunks.push(Buffer.from(chunk)); });
    req.on('end',  function ()      { resolve(Buffer.concat(chunks).toString('utf8')); });
    req.on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// Fetch client website and use Claude to generate a 7-section meeting prep note
async function researchClient({ name, company, website, biggestChallenge }) {
  if (!website) {
    console.log('[Research] No website provided — skipping research.');
    return null;
  }

  console.log('[Research] Fetching website:', website);

  var url = website.startsWith('http') ? website : 'https://' + website;

  var siteContent = '';
  try {
    var siteRes = await fetch(url, {
      headers: { 'User-Agent': 'AI-Consultancy-Research-Bot/1.0' },
      signal: AbortSignal.timeout(8000)
    });
    if (siteRes.ok) {
      var html = await siteRes.text();
      siteContent = html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 4000);
    } else {
      console.warn('[Research] Site returned status:', siteRes.status);
    }
  } catch (err) {
    console.warn('[Research] Could not fetch website:', err.message);
  }

  var apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn('[Research] ANTHROPIC_API_KEY not set — skipping Claude call.');
    return null;
  }

  var systemPrompt = [
    'You are a meeting prep assistant for an AI consultancy.',
    'A new client has booked a discovery call. Use the information below to write a concise meeting prep note for the consultant.',
    'Structure your response with these seven sections:',
    '1. Business Summary — what the business does, size, market',
    '2. Industry and Market — key context about their sector',
    '3. Likely Pain Points — based on their industry and stated challenge',
    '4. Suggested Talking Points — what to open with and explore',
    '5. Questions to Ask — 3-5 specific, useful questions for this client',
    '6. Relevant AI Solutions — which AI tools or automations would likely apply',
    '7. Red Flags — any concerns or complexity to watch for',
    'Be direct and specific. Use bullet points within sections. Avoid generic advice.',
  ].join('\n');

  var userMessage = [
    'Client name: ' + (name || 'Unknown'),
    'Company: ' + (company || 'Unknown'),
    'Website: ' + url,
    'Biggest challenge they stated: ' + (biggestChallenge || 'Not provided'),
    '',
    'Website content (extracted):',
    siteContent || '(Could not retrieve website content)',
  ].join('\n');

  console.log('[Research] Sending to Claude...');

  var claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 1500,
      system:     systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!claudeRes.ok) {
    var errText = await claudeRes.text();
    console.error('[Research] Claude API error:', claudeRes.status, errText);
    return null;
  }

  var claudeBody = await claudeRes.json();
  var prepNote = claudeBody.content && claudeBody.content[0] && claudeBody.content[0].text
    ? claudeBody.content[0].text
    : null;

  if (prepNote) {
    console.log('[Research] Prep note for', name, ':\n\n' + prepNote);
  }

  return prepNote;
}

// ---------------------------------------------------------------------------
// Create a Google Doc with the prep note and share it with the configured email
async function createGoogleDoc({ name, startTime, prepNote }) {
  var clientId     = process.env.GOOGLE_CLIENT_ID;
  var clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  var refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    console.warn('[Google] GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN not set — skipping doc creation.');
    return null;
  }

  // Build OAuth2 client with stored refresh token
  var auth = new google.auth.OAuth2(clientId, clientSecret);
  auth.setCredentials({ refresh_token: refreshToken });

  var docs  = google.docs({ version: 'v1', auth });
  var drive = google.drive({ version: 'v3', auth });

  // Format the date for the document title
  var dateStr = startTime
    ? new Date(startTime).toLocaleDateString('en-NZ', {
        day: '2-digit', month: 'short', year: 'numeric'
      })
    : new Date().toLocaleDateString('en-NZ', {
        day: '2-digit', month: 'short', year: 'numeric'
      });

  var title = 'Prep Note — ' + (name || 'Unknown') + ' — ' + dateStr;

  // ---- Create the document -------------------------------------------------
  var createRes = await docs.documents.create({ requestBody: { title } });
  var docId = createRes.data.documentId;
  console.log('[Google] Document created:', docId);

  // ---- Build the full content (header block + prep note) ------------------
  var headerLines = [
    'CLIENT PREP NOTE',
    '=' .repeat(60),
    '',
    'Client:   ' + (name    || 'Unknown'),
    'Meeting:  ' + (startTime ? new Date(startTime).toLocaleString('en-NZ') : 'TBC'),
    '',
    '='.repeat(60),
    '',
    '',
  ];
  var fullContent = headerLines.join('\n') + prepNote;

  // ---- Insert content at index 1 (after the title paragraph) -------------
  await docs.documents.batchUpdate({
    documentId: docId,
    requestBody: {
      requests: [
        {
          insertText: {
            location: { index: 1 },
            text: fullContent,
          },
        },
      ],
    },
  });
  console.log('[Google] Content inserted into document');

  // ---- Share with the consultancy email -----------------------------------
  var shareEmail = process.env.GOOGLE_SHARE_EMAIL || 'info@realmissai.com';
  await drive.permissions.create({
    fileId: docId,
    sendNotificationEmail: false,
    requestBody: {
      type:         'user',
      role:         'writer',
      emailAddress: shareEmail,
    },
  });
  console.log('[Google] Document shared with', shareEmail);

  var docUrl = 'https://docs.google.com/document/d/' + docId + '/edit';
  console.log('[Google] Doc URL:', docUrl);

  return { docId, docUrl, title };
}

// ---------------------------------------------------------------------------
// Send a Telegram notification to the configured bot
async function sendTelegramNotification({ name, email, company, startTime, meetingLink, prepNote, docUrl }) {
  var token  = process.env.TELEGRAM_BOT_TOKEN;
  var chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.warn('[Telegram] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set — skipping notification.');
    return;
  }

  var dateStr = startTime
    ? new Date(startTime).toLocaleString('en-NZ', {
        weekday: 'short', day: '2-digit', month: 'short',
        year: 'numeric', hour: '2-digit', minute: '2-digit'
      })
    : 'TBC';

  // ---- Message 1: booking summary + doc link ------------------------------
  var summaryLines = [
    '🗓 <b>New Booking</b>',
    '',
    '<b>Client:</b> ' + escapeHtml(name    || 'Unknown'),
    '<b>Email:</b>  ' + escapeHtml(email   || 'Unknown'),
    '<b>Company:</b> ' + escapeHtml(company || 'Unknown'),
    '<b>Meeting:</b> ' + escapeHtml(dateStr),
    meetingLink ? '<b>Join:</b> ' + meetingLink : '',
    '',
    docUrl
      ? '📄 <b>Prep Note:</b> <a href="' + docUrl + '">Open in Google Docs</a>'
      : '⚠️ Prep note generated but Google Doc creation failed — see logs.',
  ].filter(Boolean);

  await postTelegramMessage(token, chatId, summaryLines.join('\n'));

  // ---- Message 2: full prep note (split into ≤4000-char chunks) ----------
  if (prepNote) {
    var header = '🧠 <b>Prep Note — ' + escapeHtml(name || 'Unknown') + '</b>\n\n';
    var chunks = splitIntoChunks(header + escapeHtml(prepNote), 4000);
    for (var i = 0; i < chunks.length; i++) {
      await postTelegramMessage(token, chatId, chunks[i]);
    }
  }
}

// Send a single Telegram HTML message
async function postTelegramMessage(token, chatId, text) {
  var res = await fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id:                  chatId,
      text:                     text,
      parse_mode:               'HTML',
      disable_web_page_preview: false,
    }),
  });

  if (!res.ok) {
    var errBody = await res.text();
    console.error('[Telegram] sendMessage failed:', res.status, errBody);
  } else {
    console.log('[Telegram] Message sent successfully');
  }
}

// Split text into chunks that don't exceed maxLen, breaking at newlines
function splitIntoChunks(text, maxLen) {
  if (text.length <= maxLen) return [text];
  var chunks = [];
  while (text.length > 0) {
    if (text.length <= maxLen) {
      chunks.push(text);
      break;
    }
    // Try to break at a newline within the limit
    var breakAt = text.lastIndexOf('\n', maxLen);
    if (breakAt < 1) breakAt = maxLen;
    chunks.push(text.slice(0, breakAt));
    text = text.slice(breakAt).replace(/^\n/, '');
  }
  return chunks;
}

// Minimal HTML escaping for Telegram's HTML parse mode
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ---------------------------------------------------------------------------
// Find the answer to the first question whose text includes any of the keywords
function findAnswer(qas, keywords) {
  var match = qas.find(function (qa) {
    if (!qa.question) return false;
    var q = qa.question.toLowerCase();
    return keywords.some(function (kw) { return q.includes(kw); });
  });
  return match ? (match.answer || null) : null;
}
