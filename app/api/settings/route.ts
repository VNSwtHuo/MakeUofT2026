import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // TODO: persist `body` however you need to
    // e.g. write to a file, database, or forward to another service
    console.log('Settings received:', body);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to save settings:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to save settings' },
      { status: 500 }
    );
  }
}

// Optional: add a GET handler to read settings back
export async function GET() {
  // TODO: return stored settings
  return NextResponse.json({ settings: {} });
}