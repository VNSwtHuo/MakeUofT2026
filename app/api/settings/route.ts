import { NextRequest, NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';
import fs from 'fs';
import path from 'path';

const SETTINGS_FILE = path.join(process.cwd(), 'data', 'rangeSettings.json');

// Ensure data directory exists
function ensureDataDir() {
  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

// Read from local file
function readSettingsFromFile(userId: string) {
  if (!fs.existsSync(SETTINGS_FILE)) {
    return null;
  }
  const data = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
  return Array.isArray(data) ? data.find((s: any) => s.userId === userId) : null;
}

// Write to local file
function writeSettingsToFile(userId: string, ranges: any[]) {
  ensureDataDir();
  let data = [];
  if (fs.existsSync(SETTINGS_FILE)) {
    data = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
    if (!Array.isArray(data)) data = [];
  }
  
  const existingIndex = data.findIndex((s: any) => s.userId === userId);
  const newEntry = { userId, ranges, updatedAt: new Date().toISOString() };
  
  if (existingIndex >= 0) {
    data[existingIndex] = newEntry;
  } else {
    data.push(newEntry);
  }
  
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2));
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, ranges } = body;

    console.log('[POST /api/settings] Saving for userId:', userId);
    console.log('[POST /api/settings] Ranges count:', ranges?.length || 0);

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Missing userId' },
        { status: 400 }
      );
    }

    // Try MongoDB first
    if (clientPromise) {
      try {
        const client = await clientPromise;
        const db = client.db(process.env.MONGODB_DB);

        const result = await db.collection('settings').updateOne(
          { userId },
          {
            $set: {
              userId,
              ranges,
              updatedAt: new Date(),
            },
          },
          { upsert: true }
        );

        console.log('[POST /api/settings] MongoDB save successful');
        return NextResponse.json({ success: true, storage: 'mongodb' });
      } catch (dbError) {
        console.error('[POST /api/settings] MongoDB failed, falling back to file:', dbError);
      }
    }

    // Fallback to file storage
    writeSettingsToFile(userId, ranges);
    console.log('[POST /api/settings] File storage save successful');
    return NextResponse.json({ success: true, storage: 'file' });
    
  } catch (error) {
    console.error('[POST /api/settings] Failed to save settings:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to save settings', details: String(error) },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');

    console.log('[GET /api/settings] Requested userId:', userId);

    if (!userId) {
      return NextResponse.json(
        { error: 'Missing userId parameter' },
        { status: 400 }
      );
    }

    // Try MongoDB first
    if (clientPromise) {
      try {
        const client = await clientPromise;
        const db = client.db(process.env.MONGODB_DB);

        console.log('[GET /api/settings] Querying MongoDB...');
        const settings = await db.collection('settings').findOne({ userId });

        if (settings) {
          console.log('[GET /api/settings] Found in MongoDB, ranges:', settings.ranges?.length || 0);
          return NextResponse.json({
            userId: settings.userId,
            ranges: settings.ranges || [],
            updatedAt: settings.updatedAt,
            storage: 'mongodb'
          });
        }
        
        console.log('[GET /api/settings] Not found in MongoDB, checking file...');
      } catch (dbError) {
        console.error('[GET /api/settings] MongoDB failed, falling back to file:', dbError);
      }
    }

    // Fallback to file storage
    const fileSettings = readSettingsFromFile(userId);
    
    if (!fileSettings) {
      return NextResponse.json(
        { error: 'No settings found for this user' },
        { status: 404 }
      );
    }

    console.log('[GET /api/settings] Found in file, ranges:', fileSettings.ranges?.length || 0);
    return NextResponse.json({
      userId: fileSettings.userId,
      ranges: fileSettings.ranges || [],
      updatedAt: fileSettings.updatedAt,
      storage: 'file'
    });
    
  } catch (error) {
    console.error('[GET /api/settings] Failed to load settings:', error);
    return NextResponse.json(
      { error: 'Failed to load settings', details: String(error) },
      { status: 500 }
    );
  }
}