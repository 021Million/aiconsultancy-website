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

  // --- Research client in the background -----------------------------------
  // Fire-and-forget: don't await so we respond to Calendly immediately.
  researchClient({ name, company, website, biggestChallenge }).catch(function (err) {
    console.error('[Calendly] researchClient failed:', err.message);
  });

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

// ---------------------------------------------------------------------------
// Fetch the client's website and use Claude to generate a meeting prep note.
async function researchClient({ name, company, website, biggestChallenge }) {
  if (!website) {
    console.log('[Research] No website provided — skipping research.');
    return;
  }

  console.log('[Research] Fetching website:', website);

  // Normalise URL
  var url = website.startsWith('http') ? website : 'https://' + website;

  var siteContent = '';
  try {
    var siteRes = await fetch(url, {
      headers: { 'User-Agent': 'AI-Consultancy-Research-Bot/1.0' },
      signal: AbortSignal.timeout(8000)
    });
    if (siteRes.ok) {
      var html = await siteRes.text();
      // Strip tags, compress whitespace, cap at ~4000 chars
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
    return;
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
    return;
  }

  var claudeBody = await claudeRes.json();
  var prepNote   = claudeBody.content && claudeBody.content[0] && claudeBody.content[0].text
    ? claudeBody.content[0].text
    : '(No response)';

  console.log('[Research] Prep note for', name, ':\n\n' + prepNote);
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
