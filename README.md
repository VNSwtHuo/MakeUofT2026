# Beats per Meter

[Checkout Devpost](https://devpost.com/software/beats-per-meter)

Web dashboard + ESP32 firmware for ultrasonic range-based audio alerts.

## What This Project Does

- Configure distance ranges and assign sounds to each range
- Upload MP3/WAV files or generate tones/AI audio (ElevenLabs)
- Convert audio to 8-bit PCM and send it to ESP32 over Web Serial
- Store range settings in `data/rangeSettings.json` and optional user settings in MongoDB

## Tech Stack

- Next.js (App Router), React, TypeScript
- Web Serial API (Chrome/Edge)
- ESP32 firmware in `arduino/arduino.ino`
- ElevenLabs APIs for TTS/SFX
- MongoDB for user-related persistence

## Prerequisites

- Node.js 18+
- npm
- ESP32 board (for hardware mode)
- Chrome or Edge (required for Web Serial)

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env.local` in the project root:

```bash
ELEVENLABS_API_KEY=your_elevenlabs_api_key
MONGODB_URI=your_mongodb_connection_string
MONGODB_DB=your_database_name
```

3. Start development server:

```bash
npm run dev
```

Open `http://localhost:3000`.

## Run Flow (Hardware)

1. Flash `arduino/arduino.ino` to ESP32 in Arduino IDE
2. Open the web app and click **Connect to ESP32**
3. Scan RFID (or use the available guest flow in UI)
4. Upload/generate audio and assign one sound per range
5. Click **SAVE & LOAD TO ESP32** to transfer audio/settings

## API Routes

- `POST /api/elevenlabs/tts`
- `POST /api/elevenlabs/sfx`
- `POST /api/elevenlabs/music`
- `GET/POST /api/settings`
- `GET /api/test-db`

## Important Notes

- `data/` is required at runtime for local range settings storage.
- Audio transfer pipeline: MP3/WAV → PCM (8-bit mono) → ESP32 SPIFFS.
- Default public SVG assets in `public/` are from Next.js starter and safe to keep.

## Scripts

- `npm run dev`
- `npm run build`
- `npm run start`
- `npm run lint`
