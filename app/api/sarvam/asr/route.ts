import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Server Config Error: SARVAM_API_KEY missing in server env.' }, { status: 500 });
  }

  try {
    // Note: in 'nodejs' runtime, req.formData() handles multipart parsing automatically in recent Next.js versions
    const formData = await req.formData();
    
    const response = await fetch('https://api.sarvam.ai/speech-to-text-translate', {
      method: 'POST',
      headers: { 'api-subscription-key': apiKey },
      body: formData,
    });

    if (!response.ok) {
        const text = await response.text();
        return NextResponse.json({ error: `Sarvam API Error: ${text}` }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("ASR Proxy Error", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}