import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { prompt, style } = await request.json();

    if (!prompt || !style) {
      return NextResponse.json(
        { error: 'Missing required fields: prompt and style' },
        { status: 400 }
      );
    }

    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'ElevenLabs API key not configured on server' },
        { status: 500 }
      );
    }

    const response = await fetch('https://api.elevenlabs.io/v1/sound-generation/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': apiKey,
      },
      body: JSON.stringify({
        text: prompt,
        style: style,
        duration_ms: 30000, // 30 seconds max
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.detail?.message || `ElevenLabs API error: ${response.status}`;
      return NextResponse.json(
        { error: errorMessage },
        { status: response.status }
      );
    }

    const audioBuffer = await response.arrayBuffer();
    
    return new NextResponse(audioBuffer, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error) {
    console.error('Music generation API error:', error);
    return NextResponse.json(
      { error: `Failed to generate music: ${(error as Error).message}` },
      { status: 500 }
    );
  }
}
