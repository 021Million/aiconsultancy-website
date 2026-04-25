'use strict';

const crypto = require('crypto');

// Vercel: skip body parsing so we receive the raw stream for HMAC verification
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // --- Read raw body -------------------------------------------------------
  const rawBody = await readRawBody(req);

  // --- Verify Calendly HMAC-SHA256 signature --------------------------------
  // Header format: Calendly-Webhook-Signature: t=<unix_ts>,v1=<hex_digest>
  // Signed content: "<timestamp>.<raw_body>"
  const secret = process.env.CALENDLY_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[Calendly] CALENDLY_WEBHOOK_SECRET env var is not set');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const sigHeader = req.headers['calendly-webhook-signature'];
  if (!sigHeader) {
    console.warn('[Calendly] Missing signature header');
    return res.status(400).json({ error: 'Missing Calendly-Webhook-Signature header' });
  }

  const t   = parseHeaderPart(sigHeader, 't=');
  const v1  = parseHeaderPart(sigHeader, 'v1=');

  if (!t || !v1) {
    console.warn('[Calendly] Malformed signature header:', sigHeader);
    return res.status(400).json({ error: 'Malformed signature header' });
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(t + '.' + rawBody, 'utf8')
    .digest('hex');

  // timingSafeEqual requires equal-length buffers — both are 64-char hex strings
  // but guard against a malformed v1 value just in case
  const receivedBuf = Buffer.from(v1, 'hex');
  const expectedBuf = Buffer.from(expected, 'hex');

  if (
    receivedBuf.length !== expectedBuf.length ||
    !crypto.timingSafeEqual(receivedBuf, expectedBuf)
  ) {
    console.warn('[Calendly] Signature mismatch — possible spoofed request');
    return res.status(403).json({ error: 'Invalid signature' });
  }

  // --- Parse JSON payload --------------------------------------------------
  let body;
  try {
    body = JSON.parse(rawBody);
  } catch (err) {
    console.warn('[Calendly] JSON parse failed:', err.message);
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  // --- Extract fields -------------------------------------------------------
  // Calendly invitee.created payload shape:
  // { event: "invitee.created", payload: { event_type, event, invitee } }
  const p          = body.payload        || {};
  const invitee    = p.invitee           || {};
  const event      = p.event             || {};
  const eventType  = p.event_type        || {};
  const qas        = invitee.questions_and_answers || [];

  const name       = invitee.name        || null;
  const email      = invitee.email       || null;
  const eventName  = eventType.name      || event.name || null;
  const startTime  = event.start_time    || null;

  const company          = findAnswer(qas, ['company', 'business', 'organisation', 'organization']);
  const website          = findAnswer(qas, ['website', 'url', 'site']);
  const biggestChallenge = findAnswer(qas, ['challenge', 'problem', 'help', 'struggling']);

  // --- Log everything -------------------------------------------------------
  console.log('[Calendly] New booking:', JSON.stringify({
    name,
    email,
    eventName,
    startTime,
    company,
    website,
    biggestChallenge,
    allQAs: qas,
  }, null, 2));

  // --- Done -----------------------------------------------------------------
  return res.status(200).json({ received: true });
};

module.exports.config = {
  api: { bodyParser: false },
};

// ---------------------------------------------------------------------------

// Collect the full request body as a UTF-8 string from the readable stream
function readRawBody(req) {
  return new Promise(function (resolve, reject) {
    var chunks = [];
    req.on('data', function (chunk) { chunks.push(Buffer.from(chunk)); });
    req.on('end',  function ()      { resolve(Buffer.concat(chunks).toString('utf8')); });
    req.on('error', reject);
  });
}

// Extract a value from "t=123,v1=abc" style header strings
// parseHeaderPart("t=123,v1=abc", "v1=") => "abc"
function parseHeaderPart(header, prefix) {
  var part = header.split(',').find(function (s) { return s.trim().startsWith(prefix); });
  return part ? part.trim().slice(prefix.length) : null;
}

// Find the answer to the first question whose text includes any of the keywords
function findAnswer(qas, keywords) {
  var match = qas.find(function (qa) {
    if (!qa.question) return false;
    var q = qa.question.toLowerCase();
    return keywords.some(function (kw) { return q.includes(kw); });
  });
  return match ? (match.answer || null) : null;
}
