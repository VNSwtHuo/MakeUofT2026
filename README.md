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

## Features

- 🎵 **Custom Audio Upload**: Upload MP3/WAV files (< 1MB)
- 🎛️ **Tone Generator**: Create custom frequency-based buzzer sounds
- 🤖 **AI Audio**: Generate voice (TTS) and sound effects via ElevenLabs
- 📏 **Distance Ranges**: Configure up to multiple detection zones (0-2.5 meters)
- 🔌 **Web Serial**: Direct ESP32 communication via browser
- 💾 **Audio Streaming**: Automatic conversion and transmission to ESP32 SPIFFS
- 🔊 **DAC Playback**: Real-time audio playback via ESP32 DAC

## Quick Start

1. **Upload Firmware**: Flash [arduino/arduino.ino](./arduino/arduino.ino) to ESP32
2. **Start App**: `npm run dev`
3. **Connect**: Click "Connect ESP32" in browser
4. **Configure**: Upload/generate audio → Assign to ranges → Save

👉 See [QUICKSTART.md](./QUICKSTART.md) for detailed setup instructions
📚 See [AUDIO_SYSTEM.md](./AUDIO_SYSTEM.md) for complete documentation

## API Overview

- `POST /api/elevenlabs/tts` - text-to-speech generation
- `POST /api/elevenlabs/music` - sound effects generation
- `POST /user` - persist user settings to MongoDB
- **Web Serial API** - direct ESP32 communication (Chrome/Edge only)

## Audio System

The system converts audio files (MP3/WAV) to 8-bit PCM format and streams them to ESP32 over Web Serial:

```
Audio File → PCM Conversion (8kHz, 8-bit, mono) → Web Serial → ESP32 SPIFFS → DAC Playback
```

**Supported Formats**:
- Input: MP3, WAV (< 1MB)
- Output: 8-bit unsigned PCM, 8kHz sample rate

**Hardware Requirements**:
- ESP32 with DAC (GPIO25)
- Audio amplifier + speaker (recommended)
- Ultrasonic sensor (HC-SR04)
- RFID reader (MFRC522)
