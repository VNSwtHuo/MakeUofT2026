# Quick Start Guide

## Setup

### 1. Upload ESP32 Firmware

```bash
# Open Arduino IDE
# File → Open → arduino/arduino.ino
# Select Board: ESP32 Dev Module
# Select Port: Your ESP32 port
# Upload
```

**Required Libraries** (install via Arduino Library Manager):
- MFRC522
- Adafruit_GFX
- Adafruit_SSD1306
- ESP32Servo
- Preferences (built-in)
- SPIFFS (built-in)

### 2. Run Next.js App

```bash
npm install
npm run dev
# Open http://localhost:3000
```

## Usage Flow

### Step 1: Connect ESP32
1. Open the web app in Chrome/Edge
2. Click **"Connect to ESP32"** button
3. Select the ESP32 serial port
4. Wait for connection confirmation

### Step 2: Scan RFID
1. Place RFID card on the reader
2. Dashboard automatically loads with your user ID

### Step 3: Upload/Create Audio
Choose one or more options:

**Option A: Upload Audio Files**
- Click "Choose Audio Files"
- Select MP3 or WAV files (< 1MB each)
- Files appear in "Custom Audio Files" section

**Option B: Generate Custom Tones**
- Adjust frequency (20-2000 Hz)
- Adjust period (0.1-5 seconds)
- Click "Save Custom Tone"

**Option C: Generate AI Voice**
- Select voice from dropdown
- Enter text to speak
- Click "Generate Speech"

**Option D: Use Preset Sounds**
- Preset buzzer sounds are already available
- Click any preset to preview

### Step 4: Configure Ranges
1. Each range shows min-max distance (in meters)
2. Select audio from dropdown for each range
3. **Optional**: Add custom ranges:
   - Enter min distance (e.g., 0.5m)
   - Enter max distance (e.g., 1.5m)
   - Click "Add Custom Range"
   - Assign audio to new range

### Step 5: Save & Load
1. Ensure all ranges have audio assigned (required)
2. Click **"SAVE & LOAD TO ESP32"**
3. Wait for:
   - Audio conversion (MP3/WAV → PCM)
   - Audio transmission to ESP32
   - Settings save
4. Success message appears when complete

### Step 6: Test
1. Move an object in front of the ultrasonic sensor
2. Audio plays when object enters configured range
3. Audio loops while object remains in range
4. Different audio plays for different ranges

## Example Configuration

```
Range 1: 0.0m - 1.0m   → High-pitched beep (1000Hz)
Range 2: 1.0m - 2.0m   → Medium beep (800Hz)
Range 3: 2.0m - 4.0m   → Low beep (440Hz)
```

## Hardware Connections

```
ESP32 → Audio Output:
  GPIO25 (DAC1) → Audio Amplifier Input → Speaker
  GND → Common Ground

ESP32 → Ultrasonic Sensor:
  GPIO25 → TRIG
  GPIO33 → ECHO
  5V → VCC
  GND → GND

ESP32 → RFID Reader:
  See arduino.ino for SPI connections
```

## Troubleshooting

### "ESP32 not connected"
- Make sure ESP32 is plugged in via USB
- Use Chrome or Edge browser (Web Serial API required)
- Click "Connect to ESP32" and select the correct port

### "No user ID detected"
- Scan your RFID card on the reader
- Check RFID connections
- Look at Serial Monitor for "UID: XX XX XX XX"

### Audio not playing
1. Check Serial Monitor for "SPIFFS Mounted Successfully"
2. Verify "AUDIO_SAVED" messages appear during upload
3. Check DAC connection (GPIO25)
4. Test with a multimeter: voltage should change during playback

### File upload fails
- Ensure file is < 1MB
- Use MP3 or WAV format only
- Check available SPIFFS space in Serial Monitor

### Audio quality poor
- Add audio amplifier circuit (e.g., PAM8403)
- Add low-pass filter: 10kΩ resistor + 10nF capacitor
- Reduce input audio volume before conversion

## Demo Mode

Want to test without hardware?

1. Click **"Guest Login"** on login page
2. Configure ranges and audio
3. Click "Play Sequence" to test audio playback in browser
4. Settings won't be sent to ESP32 (no hardware needed)

## Next Steps

- Read [AUDIO_SYSTEM.md](./AUDIO_SYSTEM.md) for detailed documentation
- Customize ranges for your application
- Generate AI voices for accessibility features
- Integrate with your own MongoDB for persistent storage

## Support

For issues or questions:
- Check Serial Monitor for debug messages
- Review console logs in browser DevTools
- See troubleshooting section in AUDIO_SYSTEM.md
