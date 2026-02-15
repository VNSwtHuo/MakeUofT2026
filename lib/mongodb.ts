import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
const options = {};

let client: MongoClient;
let clientPromise: Promise<MongoClient> | null = null;

declare global {
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

// Only initialize MongoDB if URI is provided
if (uri && uri.trim()) {
  console.log('[MongoDB] Initializing connection...');
  if (!global._mongoClientPromise) {
    client = new MongoClient(uri, options);
    global._mongoClientPromise = client.connect();
    console.log('[MongoDB] Client connection promise created');
  } else {
    console.log('[MongoDB] Reusing existing connection promise');
  }
  clientPromise = global._mongoClientPromise;
} else {
  console.warn('[MongoDB] MONGODB_URI not configured - Database features disabled');
  console.warn('[MongoDB] Current MONGODB_URI value:', uri ? `"${uri.substring(0, 20)}..."` : 'undefined');
}

export default clientPromise;
