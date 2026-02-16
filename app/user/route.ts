import clientPromise from "@/lib/mongodb";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { userId, settings } = body;

    if (!userId || !settings) {
      return NextResponse.json(
        { error: "Missing userId or settings" },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    if (!client) {
      return NextResponse.json(
        { error: "MongoDB client unavailable" },
        { status: 500 }
      );
    }

    const dbName = process.env.MONGODB_DB;
    if (!dbName) {
      return NextResponse.json(
        { error: "Missing MONGODB_DB env var" },
        { status: 500 }
      );
    }

    const db = client.db(dbName);

    const result = await db.collection("users").updateOne(
      { userId },
      {
        $set: {
          settings,
          updatedAt: new Date(),
        },
      },
      { upsert: true }
    );

    return NextResponse.json({ success: true, result });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Failed to save user settings" },
      { status: 500 }
    );
  }
}
