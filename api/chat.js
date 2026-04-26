'use strict';

var SYSTEM_PROMPT = `You are the assistant for AI Consultancy, a done-for-you AI implementation business. You help small and medium business owners understand how AI can save them time and reduce admin work.

Your job: answer questions clearly, help visitors understand what AI could do for their specific business, and guide interested people toward booking a free discovery call.

Keep responses short — 2 to 4 sentences unless the question genuinely needs more. Plain language only, no jargon.

Key information:
- Services: AI consulting and strategy, workflow automation, custom AI tools, AI training workshops
- Industries we work with: trades, healthcare, real estate, education, admin-heavy teams, professional services
- Book a free discovery call: https://calendly.com/aiconsulting-keira/30min
- Email: info@realmissai.com
- Pricing: not published — discussed on the discovery call based on what the business needs

Tone: warm, practical, calm. Focus on time saved and work eliminated, not features. Never use: "leverage", "synergy", "cutting-edge", "game-changing", "innovative".

If someone wants to know more about their specific situation, suggest booking a free call — it takes 30 minutes and there is no obligation.`;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  var body      = req.body || {};
  var message   = body.message;
  var sessionId = body.sessionId;
  var history   = body.history || [];
  var pageUrl   = body.pageUrl || null;

  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'Missing message' });
  }
  if (!sessionId) return res.status(400).json({ error: 'Missing sessionId' });

  var apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('[Chat] ANTHROPIC_API_KEY not set');
    return res.status(500).json({ error: 'API not configured' });
  }

  try {
    // Build conversation — cap at last 10 turns to keep tokens manageable
    var messages = [];
    if (Array.isArray(history)) {
      history.slice(-10).forEach(function (m) {
        if ((m.role === 'user' || m.role === 'assistant') && m.content) {
          messages.push({ role: m.role, content: String(m.content) });
        }
      });
    }
    messages.push({ role: 'user', content: message.trim() });

    console.log('[Chat] Calling Claude. session:', sessionId, 'turns:', messages.length);

    var anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 350,
        system: SYSTEM_PROMPT,
        messages: messages,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!anthropicRes.ok) {
      var errData = await anthropicRes.json().catch(function () { return {}; });
      console.error('[Chat] Anthropic error:', JSON.stringify(errData));
      return res.status(502).json({ error: 'AI service error — please try again.' });
    }

    var anthropicData = await anthropicRes.json();
    var reply = anthropicData.content && anthropicData.content[0] && anthropicData.content[0].text;

    if (!reply) {
      console.error('[Chat] Empty response from Anthropic');
      return res.status(502).json({ error: 'Empty response — please try again.' });
    }

    console.log('[Chat] Reply generated. Saving to Supabase.');
    await saveToSupabase({ sessionId, userMessage: message.trim(), assistantReply: reply, pageUrl });

    return res.status(200).json({ reply });

  } catch (err) {
    console.error('[Chat] Handler threw:', err.message);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
};

async function saveToSupabase({ sessionId, userMessage, assistantReply, pageUrl }) {
  var url = process.env.SUPABASE_URL;
  var key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.warn('[Chat] Supabase env vars missing — skipping save');
    return;
  }

  var rows = [
    { session_id: sessionId, role: 'user',      content: userMessage,    page_url: pageUrl },
    { session_id: sessionId, role: 'assistant', content: assistantReply, page_url: pageUrl },
  ];

  try {
    var res = await fetch(url + '/rest/v1/chat_conversations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': key,
        'Authorization': 'Bearer ' + key,
      },
      body: JSON.stringify(rows),
    });
    if (!res.ok) {
      var data = await res.json().catch(function () { return {}; });
      console.error('[Chat] Supabase insert failed:', JSON.stringify(data));
    } else {
      console.log('[Chat] Saved to Supabase. session:', sessionId);
    }
  } catch (err) {
    console.error('[Chat] Supabase threw:', err.message);
  }
}
