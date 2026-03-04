/* ============================================================
   Netlify Function: subscribe.js
   Proxies newsletter signups to Beehiiv API.
   The API key stays here on the server — never exposed to the browser.
   ============================================================ */

exports.handler = async function (event) {
  /* Only allow POST requests */
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  /* Parse the email from the request body */
  let email;
  try {
    const body = JSON.parse(event.body);
    email = body.email;
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
  }

  if (!email) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Email is required' }) };
  }

  /* These come from Netlify environment variables — never hard-coded here.
     Set them in: Netlify dashboard → Site settings → Environment variables */
  const BEEHIIV_API_KEY       = process.env.BEEHIIV_API_KEY;
  const BEEHIIV_PUBLICATION_ID = process.env.BEEHIIV_PUBLICATION_ID;

  if (!BEEHIIV_API_KEY || !BEEHIIV_PUBLICATION_ID) {
    console.error('Missing Beehiiv environment variables');
    return { statusCode: 500, body: JSON.stringify({ error: 'Server configuration error' }) };
  }

  /* Call the Beehiiv API */
  try {
    const response = await fetch(
      `https://api.beehiiv.com/v2/publications/${BEEHIIV_PUBLICATION_ID}/subscriptions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${BEEHIIV_API_KEY}`
        },
        body: JSON.stringify({
          email: email,
          reactivate_existing: false,
          send_welcome_email: true
        })
      }
    );

    if (response.ok || response.status === 201) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: true })
      };
    } else {
      const err = await response.text();
      console.error('Beehiiv API error:', response.status, err);
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: 'Subscription failed' })
      };
    }
  } catch (err) {
    console.error('Network error calling Beehiiv:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Network error' })
    };
  }
};
