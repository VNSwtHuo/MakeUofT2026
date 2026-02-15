# MakeUofT2026

Next.js app for the Ultrasonic Navigation System dashboard, audio generation, and distance-based triggers.

## Prerequisites

- Node.js 18+ (recommended: latest LTS)
- npm (or pnpm/yarn)
- An ElevenLabs API key for TTS and SFX
- A MongoDB instance (for saving user settings)

## Setup

1) Install dependencies

```bash
npm install
```

2) Configure environment variables

Create a `.env.local` file in the project root:

```bash
ELEVENLABS_API_KEY=your_elevenlabs_api_key
MONGODB_URI=your_mongodb_connection_string
MONGODB_DB=your_database_name
```

Notes:
- `ELEVENLABS_API_KEY` is required for `/api/elevenlabs/tts` and `/api/elevenlabs/music`.
- `MONGODB_URI` and `MONGODB_DB` are required for the user settings API at `/app/user/route.ts`.

3) Run the dev server

```bash
npm run dev
```

Open http://localhost:3000 in your browser.

## Useful Scripts

- `npm run dev` - start the development server
- `npm run build` - build for production
- `npm run start` - run the production build
- `npm run lint` - lint the codebase

## API Overview

- `POST /api/elevenlabs/tts` - text-to-speech generation
- `POST /api/elevenlabs/music` - sound effects generation
- `POST /user` - persist user settings to MongoDB
