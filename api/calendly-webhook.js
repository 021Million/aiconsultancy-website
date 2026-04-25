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
  console.log('[Calendly] Webhook received — reading body...');
  const rawBody = await readRawBody(req);
  console.log('[Calendly] Body read, length:', rawBody.length);

  // --- Signature verification temporarily disabled -------------------------
  console.log('[Calendly] Signature check skipped (disabled for testing)');

  // --- Parse JSON payload --------------------------------------------------
  let body;
  try {
    body = JSON.parse(rawBody);
    console.log('[Calendly] JSON parsed OK');
  } catch (err) {
    console.error('[Calendly] JSON parse failed:', err.message, '| Raw:', rawBody.slice(0, 200));
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

  console.log('[Calendly] Extracted fields:', JSON.stringify({
    name, email, timezone, eventName, startTime, endTime,
    meetingLink, company, website, biggestChallenge, allQAs: qas,
  }, null, 2));

  // --- Run research + doc + notification synchronously before responding ----
  // Vercel kills the function after the 200 is sent, so everything must
  // complete before we return. maxDuration: 30 in vercel.json gives us time.
  console.log('[Calendly] Starting processBooking (awaited)...');
  try {
    await processBooking({ name, email, company, website, biggestChallenge, startTime, meetingLink });
  } catch (err) {
    console.error('[processBooking] Top-level failure:', err.message, err.stack);
  }

  console.log('[Calendly] Responding 200 to Calendly');
  return res.status(200).json({ received: true });
};

module.exports.config = {
  api: { bodyParser: false },
};

// ---------------------------------------------------------------------------

async function processBooking({ name, email, company, website, biggestChallenge, startTime, meetingLink }) {
  console.log('[processBooking] Starting for:', name, '|', company);

  // 1. Research the client via Claude
  console.log('[processBooking] Step 1: researchClient...');
  const prepNote = await researchClient({ name, company, website, biggestChallenge });
  console.log('[processBooking] researchClient done. prepNote:', prepNote ? 'received (' + prepNote.length + ' chars)' : 'null — stopping');
  if (!prepNote) return;

  // 2. Create Google Doc and share with user
  console.log('[processBooking] Step 2: createGoogleDoc...');
  let docUrl = null;
  try {
    const doc = await createGoogleDoc({ name, startTime, prepNote });
    docUrl = doc ? doc.docUrl : null;
    console.log('[processBooking] createGoogleDoc done. docUrl:', docUrl || 'null');
  } catch (err) {
    console.error('[processBooking] createGoogleDoc threw:', err.message, err.stack);
  }

  // 3. Send Telegram notification
  console.log('[processBooking] Step 3: sendTelegramNotification...');
  try {
    await sendTelegramNotification({ name, email, company, startTime, meetingLink, prepNote, docUrl });
    console.log('[processBooking] sendTelegramNotification done');
  } catch (err) {
    console.error('[processBooking] sendTelegramNotification threw:', err.message, err.stack);
  }

  console.log('[processBooking] All steps complete for:', name);
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
// Fetch client website and use Claude to generate a meeting prep note
async function researchClient({ name, company, website, biggestChallenge }) {
  console.log('[Research] Starting. website:', website);

  if (!website) {
    console.log('[Research] No website — skipping.');
    return null;
  }

  var apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('[Research] ANTHROPIC_API_KEY is not set — cannot call Claude.');
    return null;
  }
  console.log('[Research] ANTHROPIC_API_KEY present:', apiKey.slice(0, 10) + '...');

  var url = website.startsWith('http') ? website : 'https://' + website;
  console.log('[Research] Fetching URL:', url);

  var siteContent = '';
  try {
    var siteRes = await fetch(url, {
      headers: { 'User-Agent': 'AI-Consultancy-Research-Bot/1.0' },
      signal: AbortSignal.timeout(5000),
    });
    console.log('[Research] Website fetch status:', siteRes.status);
    if (siteRes.ok) {
      var html = await siteRes.text();
      console.log('[Research] Raw HTML length:', html.length);
      siteContent = html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 2000);
      console.log('[Research] Extracted text length:', siteContent.length);
    } else {
      console.warn('[Research] Website returned non-OK status:', siteRes.status);
    }
  } catch (err) {
    console.warn('[Research] Website fetch failed (non-fatal):', err.message);
  }

  var systemPrompt = [
    'You are a meeting prep assistant for an AI consultancy.',
    'Write a brief prep note for a discovery call. Be concise — bullet points only.',
    'Cover five areas:',
    '1. Business Summary — what they do, size, market',
    '2. Likely Pain Points — based on their industry and stated challenge',
    '3. Questions to Ask — 3 specific questions',
    '4. Relevant AI Solutions — 2-3 most applicable',
    '5. Red Flags — any concerns to watch for',
    'Keep the total response under 400 words.',
  ].join('\n');

  var userMessage = [
    'Client: ' + (name || 'Unknown'),
    'Company: ' + (company || 'Unknown'),
    'Website: ' + url,
    'Challenge: ' + (biggestChallenge || 'Not provided'),
    '',
    'Website content:',
    siteContent || '(unavailable)',
  ].join('\n');

  console.log('[Research] Calling Claude API...');

  var claudeRes;
  try {
    claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 800,
        system:     systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
      signal: AbortSignal.timeout(15000),
    });
    console.log('[Research] Claude responded with status:', claudeRes.status);
  } catch (err) {
    console.error('[Research] Claude fetch threw:', err.message, err.stack);
    return null;
  }

  if (!claudeRes.ok) {
    var errText = await claudeRes.text();
    console.error('[Research] Claude API error:', claudeRes.status, errText);
    return null;
  }

  var claudeBody = await claudeRes.json();
  console.log('[Research] Claude response body keys:', Object.keys(claudeBody).join(', '));

  var prepNote = claudeBody.content && claudeBody.content[0] && claudeBody.content[0].text
    ? claudeBody.content[0].text
    : null;

  if (prepNote) {
    console.log('[Research] Prep note generated (' + prepNote.length + ' chars) for:', name);
  } else {
    console.error('[Research] Claude returned no text. Full body:', JSON.stringify(claudeBody));
  }

  return prepNote;
}

// ---------------------------------------------------------------------------
// Create a Google Doc with the prep note and share it with the configured email
async function createGoogleDoc({ name, startTime, prepNote }) {
  console.log('[Google] createGoogleDoc starting for:', name);

  var clientId     = process.env.GOOGLE_CLIENT_ID;
  var clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  var refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    console.warn('[Google] Missing env vars — clientId:', !!clientId, 'clientSecret:', !!clientSecret, 'refreshToken:', !!refreshToken);
    return null;
  }
  console.log('[Google] Env vars present. Building OAuth2 client...');

  var auth = new google.auth.OAuth2(clientId, clientSecret);
  auth.setCredentials({ refresh_token: refreshToken });

  var docs  = google.docs({ version: 'v1', auth });
  var drive = google.drive({ version: 'v3', auth });

  var dateStr = startTime
    ? new Date(startTime).toLocaleDateString('en-NZ', {
        day: '2-digit', month: 'short', year: 'numeric'
      })
    : new Date().toLocaleDateString('en-NZ', {
        day: '2-digit', month: 'short', year: 'numeric'
      });

  var title = 'Prep Note — ' + (name || 'Unknown') + ' — ' + dateStr;
  console.log('[Google] Creating document:', title);

  var createRes;
  try {
    createRes = await docs.documents.create({ requestBody: { title } });
  } catch (err) {
    console.error('[Google] docs.documents.create threw:', err.message, err.stack);
    throw err;
  }
  var docId = createRes.data.documentId;
  console.log('[Google] Document created, docId:', docId);

  var headerLines = [
    'CLIENT PREP NOTE',
    '='.repeat(60),
    '',
    'Client:   ' + (name    || 'Unknown'),
    'Meeting:  ' + (startTime ? new Date(startTime).toLocaleString('en-NZ') : 'TBC'),
    '',
    '='.repeat(60),
    '',
    '',
  ];
  var fullContent = headerLines.join('\n') + prepNote;
  console.log('[Google] Inserting content (' + fullContent.length + ' chars)...');

  try {
    await docs.documents.batchUpdate({
      documentId: docId,
      requestBody: {
        requests: [{ insertText: { location: { index: 1 }, text: fullContent } }],
      },
    });
    console.log('[Google] Content inserted');
  } catch (err) {
    console.error('[Google] batchUpdate threw:', err.message, err.stack);
    throw err;
  }

  var shareEmail = process.env.GOOGLE_SHARE_EMAIL || 'info@realmissai.com';
  console.log('[Google] Sharing with:', shareEmail);
  try {
    await drive.permissions.create({
      fileId: docId,
      sendNotificationEmail: false,
      requestBody: { type: 'user', role: 'writer', emailAddress: shareEmail },
    });
    console.log('[Google] Document shared');
  } catch (err) {
    console.error('[Google] permissions.create threw:', err.message, err.stack);
    throw err;
  }

  var docUrl = 'https://docs.google.com/document/d/' + docId + '/edit';
  console.log('[Google] Done. URL:', docUrl);

  return { docId, docUrl, title };
}

// ---------------------------------------------------------------------------
// Send a Telegram notification to the configured bot
async function sendTelegramNotification({ name, email, company, startTime, meetingLink, prepNote, docUrl }) {
  console.log('[Telegram] sendTelegramNotification starting for:', name);

  var token  = process.env.TELEGRAM_BOT_TOKEN;
  var chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.error('[Telegram] Missing env vars — token:', !!token, 'chatId:', !!chatId);
    return;
  }
  console.log('[Telegram] Env vars present. chatId:', chatId);

  var dateStr = startTime
    ? new Date(startTime).toLocaleString('en-NZ', {
        weekday: 'short', day: '2-digit', month: 'short',
        year: 'numeric', hour: '2-digit', minute: '2-digit'
      })
    : 'TBC';

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

  console.log('[Telegram] Sending message 1 (summary)...');
  await postTelegramMessage(token, chatId, summaryLines.join('\n'));
  console.log('[Telegram] Message 1 sent');

  if (prepNote) {
    var header = '🧠 <b>Prep Note — ' + escapeHtml(name || 'Unknown') + '</b>\n\n';
    var chunks = splitIntoChunks(header + escapeHtml(prepNote), 4000);
    console.log('[Telegram] Sending prep note in', chunks.length, 'chunk(s)...');
    for (var i = 0; i < chunks.length; i++) {
      await postTelegramMessage(token, chatId, chunks[i]);
      console.log('[Telegram] Chunk', i + 1, 'of', chunks.length, 'sent');
    }
  }

  console.log('[Telegram] All messages sent');
}

// Send a single Telegram HTML message
async function postTelegramMessage(token, chatId, text) {
  console.log('[Telegram] postTelegramMessage — length:', text.length);
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
    console.log('[Telegram] sendMessage OK');
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
