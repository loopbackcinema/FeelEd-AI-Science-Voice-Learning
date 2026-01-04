export const config = {
  runtime: 'edge',
};

export default async function handler(request: Request) {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'Server Config Error: SARVAM_API_KEY missing' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const body = await request.json();
    
    const response = await fetch('https://api.sarvam.ai/text-to-speech', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-subscription-key': apiKey,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
        const text = await response.text();
        return new Response(
          JSON.stringify({ error: `Sarvam API Error: ${text}` }),
          { status: response.status, headers: { 'Content-Type': 'application/json' } }
        );
    }

    const data = await response.json();
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
    
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}