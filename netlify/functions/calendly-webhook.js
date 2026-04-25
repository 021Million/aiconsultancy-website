/* ============================================================
   Netlify Function: calendly-webhook.js
   Receives Calendly booking events, validates the signature,
   and extracts client data for the prep pipeline.
   ============================================================ */

const crypto = require('crypto');

/* Parse the Calendly-Webhook-Signature header.
   Format: "t=<timestamp>,v1=<hmac>" */
function parseSignatureHeader(header) {
  if (!header) return null;
  const parts = {};
  for (const part of header.split(',')) {
    const [key, val] = part.split('=');
    if (key && val) parts[key.trim()] = val.trim();
  }
  return parts.t && parts.v1 ? parts : null;
}

/* Verify HMAC-SHA256: Calendly signs timestamp + "." + raw body */
function verifySignature(signingKey, timestamp, rawBody, receivedHmac) {
  const message = `${timestamp}.${rawBody}`;
  const expected = crypto
    .createHmac('sha256', signingKey)
    .update(message, 'utf8')
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(expected, 'hex'),
    Buffer.from(receivedHmac, 'hex')
  );
}

/* Pull a custom question answer by matching question text keywords */
function extractAnswer(questionsAndAnswers, keyword) {
  if (!Array.isArray(questionsAndAnswers)) return null;
  const match = questionsAndAnswers.find(
    (qa) => qa.question && qa.question.toLowerCase().includes(keyword)
  );
  return match?.answer || null;
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const SIGNING_KEY = process.env.CALENDLY_WEBHOOK_SECRET;
  if (!SIGNING_KEY) {
    console.error('Missing CALENDLY_WEBHOOK_SECRET env var');
    return { statusCode: 500, body: JSON.stringify({ error: 'Server configuration error' }) };
  }

  /* Validate signature */
  const sigHeader = event.headers['calendly-webhook-signature'];
  const parsed = parseSignatureHeader(sigHeader);

  if (!parsed) {
    console.warn('Missing or malformed Calendly-Webhook-Signature header');
    return { statusCode: 401, body: JSON.stringify({ error: 'Missing signature' }) };
  }

  const rawBody = event.body || '';
  let signatureValid;
  try {
    signatureValid = verifySignature(SIGNING_KEY, parsed.t, rawBody, parsed.v1);
  } catch {
    signatureValid = false;
  }

  if (!signatureValid) {
    console.warn('Invalid webhook signature — request rejected');
    return { statusCode: 401, body: JSON.stringify({ error: 'Invalid signature' }) };
  }

  /* Parse body */
  let data;
  try {
    data = JSON.parse(rawBody);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  /* Only process new bookings */
  if (data.event !== 'invitee.created') {
    return { statusCode: 200, body: JSON.stringify({ received: true, skipped: true }) };
  }

  const { payload } = data;
  const qna = payload?.questions_and_answers || [];

  /* Extract booking data */
  const booking = {
    name:             payload?.invitee?.name          || null,
    email:            payload?.invitee?.email         || null,
    scheduledAt:      payload?.event?.start_time      || null,
    company:          extractAnswer(qna, 'company'),
    website:          extractAnswer(qna, 'website'),
    socialLinks:      extractAnswer(qna, 'social'),
    biggestChallenge: extractAnswer(qna, 'challenge'),
  };

  console.log('Calendly booking received:', JSON.stringify(booking, null, 2));

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ received: true }),
  };
};
