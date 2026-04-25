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

  // --- Signature verification temporarily disabled -------------------------
  // TODO: re-enable before production
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

  // --- Log everything -------------------------------------------------------
  console.log('[Calendly] New booking:', JSON.stringify({
    name,
    email,
    timezone,
    eventName,
    startTime,
    endTime,
    meetingLink,
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
