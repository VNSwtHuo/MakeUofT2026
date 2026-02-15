import { NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';

export async function GET() {
  try {
    console.log('[Test DB] Testing MongoDB connection...');
    console.log('[Test DB] MONGODB_URI exists:', !!process.env.MONGODB_URI);
    console.log('[Test DB] MONGODB_DB:', process.env.MONGODB_DB);
    
    if (!clientPromise) {
      return NextResponse.json({ 
        success: false, 
        error: 'MongoDB client promise is null',
        mongodbUri: process.env.MONGODB_URI ? 'Set' : 'Not set'
      });
    }

    const client = await clientPromise;
    const db = client.db(process.env.MONGODB_DB);
    
    // Test query - list collections
    const collections = await db.listCollections().toArray();
    
    // Test settings collection
    const settingsCount = await db.collection('settings').countDocuments();
    
    return NextResponse.json({ 
      success: true, 
      message: 'MongoDB connected successfully',
      database: process.env.MONGODB_DB,
      collections: collections.map(c => c.name),
      settingsCount
    });
  } catch (error) {
    console.error('[Test DB] Error:', error);
    return NextResponse.json({ 
      success: false, 
      error: String(error),
      mongodbUri: process.env.MONGODB_URI ? 'Set (but connection failed)' : 'Not set'
    }, { status: 500 });
  }
}
