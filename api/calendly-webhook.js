const crypto = require('crypto');

/* Disable Vercel's default body parser so we can read the raw bytes
   needed for HMAC signature verification. */
async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  /* Read raw body as a string */
  const rawBody = await readRawBody(req);

  /* ----------------------------------------------------------------
     1. Verify Calendly webhook signature
     Header format: Calendly-Webhook-Signature: t=<unix_ts>,v1=<hex>
     Signed content: "<timestamp>.<raw_body>"
     Algorithm: HMAC-SHA256 with CALENDLY_WEBHOOK_SECRET
  ---------------------------------------------------------------- */
  const sigHeader = req.headers['calendly-webhook-signature'];
  if (!sigHeader) {
    console.warn('[Calendly] Missing Calendly-Webhook-Signature header');
    return res.status(400).json({ error: 'Missing signature header' });
  }

  const secret = process.env.CALENDLY_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[Calendly] CALENDLY_WEBHOOK_SECRET env variable is not set');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const parts = sigHeader.split(',');
  const tPart = parts.find(p => p.startsWith('t='));
  const v1Part = parts.find(p => p.startsWith('v1='));

  if (!tPart || !v1Part) {
    console.warn('[Calendly] Malformed signature header:', sigHeader);
    return res.status(400).json({ error: 'Invalid signature header format' });
  }

  const timestamp = tPart.slice(2);
  const receivedSig = v1Part.slice(3);

  const expectedSig = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`, 'utf8')
    .digest('hex');

  /* Use timingSafeEqual to prevent timing attacks.
     Both are SHA-256 hex strings so they should always be 64 chars,
     but guard against malformed input just in case. */
  const receivedBuf = Buffer.from(receivedSig, 'hex');
  const expectedBuf = Buffer.from(expectedSig, 'hex');

  const signaturesMatch =
    receivedBuf.length === expectedBuf.length &&
    crypto.timingSafeEqual(receivedBuf, expectedBuf);

  if (!signaturesMatch) {
    console.warn('[Calendly] Signature verification failed');
    return res.status(403).json({ error: 'Invalid signature' });
  }

  /* ----------------------------------------------------------------
     2. Parse the JSON payload
  ---------------------------------------------------------------- */
  let body;
  try {
    body = JSON.parse(rawBody);
  } catch {
    console.warn('[Calendly] Failed to parse JSON body');
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  /* ----------------------------------------------------------------
     3. Extract fields
     Calendly payload shape for invitee.created:
     {
       event: "invitee.created",
       payload: {
         event_type: { name: "..." },
         event:      { start_time: "...", name: "..." },
         invitee:    { name: "...", email: "...", questions_and_answers: [...] }
       }
     }
  ---------------------------------------------------------------- */
  const payload      = body.payload || {};
  const invitee      = payload.invitee || {};
  const event        = payload.event || {};
  const eventType    = payload.event_type || {};
  const qas          = invitee.questions_and_answers || [];

  const inviteeName  = invitee.name  || null;
  const inviteeEmail = invitee.email || null;
  const eventName    = eventType.name || event.name || null;
  const startTime    = event.start_time || null;

  /* Match question answers by keyword — handles varied question wording */
  const findAnswer = (...keywords) => {
    const match = qas.find(qa =>
      qa.question &&
      keywords.some(kw => qa.question.toLowerCase().includes(kw))
    );
    return match ? (match.answer || null) : null;
  };

  const company         = findAnswer('company', 'business', 'organisation', 'organization');
  const website         = findAnswer('website', 'url', 'site');
  const biggestChallenge = findAnswer('challenge', 'problem', 'help', 'struggling');

  /* ----------------------------------------------------------------
     4. Log everything
  ---------------------------------------------------------------- */
  console.log('[Calendly] New booking received:', JSON.stringify({
    inviteeName,
    inviteeEmail,
    eventName,
    startTime,
    answers: {
      company,
      website,
      biggestChallenge,
    },
    allQuestions: qas,
  }, null, 2));

  /* ----------------------------------------------------------------
     5. Return 200 OK
  ---------------------------------------------------------------- */
  return res.status(200).json({ received: true });
}

/* Read the full request body as a UTF-8 string */
function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk.toString('utf8'); });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

handler.config = { api: { bodyParser: false } };

module.exports = handler;
