# Audio System Documentation

## Overview

This system allows users to customize ultrasonic sensor detection ranges and assign custom audio files to each range. Audio files are sent from the Next.js web app to the ESP32 over Web Serial and played via the ESP32's DAC when objects are detected within configured ranges.

## Architecture

### Components

1. **Frontend (Next.js Web App)**
   - Audio file upload/management (MP3, WAV)
   - Audio generation (tones, AI voices via ElevenLabs)
   - Range configuration UI
   - Web Serial communication with ESP32
   - Audio format conversion (MP3/WAV → PCM)

2. **ESP32 Firmware**
   - SPIFFS file system for audio storage
   - Serial protocol for receiving audio data
   - DAC-based audio playback (GPIO25)
   - Ultrasonic sensor distance detection
   - Range-based audio triggering

3. **Libraries**
   - `lib/audioConverter.ts` - Audio conversion utilities
   - `lib/hFileGenerator.ts` - .h file generation
   - `lib/audioWorkflow.ts` - Complete workflow orchestration

## System Flow

### 1. User Login
```
User scans RFID → ESP32 sends UID → Next.js receives → Dashboard loads
```

### 2. Audio Configuration
```
User uploads/generates audio → Converts to PCM → Assigns to range → Saves
```

### 3. Audio Transmission (Save & Load)
```
Frontend:
  1. Convert all audio files to 8-bit PCM (8kHz/16kHz)
  2. Send START_SOUND <filename> <length>
  3. Send binary PCM data in chunks
  4. Send END_SOUND
  5. Repeat for all audio files
  6. Send SAVE_SETTINGS with range configuration

ESP32:
  1. Receive audio files → Save to /sounds/ in SPIFFS
  2. Receive range settings → Save to Preferences
  3. Confirm completion
```

### 4. Runtime Operation
```
ESP32 continuously:
  1. Read ultrasonic sensor distance
  2. Check if distance matches any configured range
  3. If match → Play corresponding audio from SPIFFS via DAC
  4. Loop audio every 1 second while object in range
```

## Audio Format Specifications

### Input Formats (Web App)
- **Supported**: MP3, WAV
- **Max Size**: 1MB per file
- **Recommended Duration**: < 5 seconds for responsive playback

### Output Format (ESP32)
- **Format**: Raw 8-bit PCM
- **Sample Rate**: 8000 Hz (default) or 16000 Hz
- **Channels**: Mono
- **Bit Depth**: 8-bit unsigned (0-255)
- **Encoding**: Linear PCM, no compression

### Conversion Process
```javascript
// Web Audio API decodes MP3/WAV → Float32 samples
// Resample to target rate (8kHz)
// Convert to mono (if stereo)
// Convert float (-1.0 to 1.0) to uint8 (0 to 255)
```

## Serial Protocol

### Audio File Transfer
```
Frontend → ESP32:
START_SOUND <filename> <byte_count>\n
[binary PCM data]
END_SOUND\n

ESP32 → Frontend:
OK:RECEIVING_AUDIO
AUDIO_SAVED:<filename>
OK:AUDIO_COMPLETE
```

### Settings Transfer
```
Frontend → ESP32:
SAVE_SETTINGS:<userId>\n
RANGES:<min1>,<max1>,<audioId1>|<min2>,<max2>,<audioId2>...\n
AUDIO:<id1>:<identifier1>:<freq1>:<period1>:<type1>|...\n
END_SETTINGS\n

ESP32 → Frontend:
OK:READY
OK:RANGES
OK:AUDIO
OK:SAVED
```

## API Reference

### Frontend Functions

#### `convertAudioToPCM(audioFile: File, targetSampleRate: number)`
Converts MP3/WAV to raw PCM data.

**Returns**: `{ pcmData: Uint8Array, metadata: AudioMetadata }`

#### `generateTonePCM(frequency: number, duration: number, sampleRate: number)`
Generates a sine wave tone as PCM data.

**Returns**: `{ pcmData: Uint8Array, metadata: AudioMetadata }`

#### `saveSettingsToESP32(userId, ranges, audioFiles, onProgress)`
Complete workflow to send audio files and settings to ESP32.

**Parameters**:
- `userId`: RFID user ID
- `ranges`: Array of distance ranges with assigned audioId
- `audioFiles`: Array of AudioFileInfo objects
- `onProgress`: Optional callback for progress updates

### ESP32 Functions

#### `void processSerialInput()`
Main serial handler. Processes both text commands and binary audio data.

#### `void triggerAudio(String audioId)`
Starts playback of the specified audio file from SPIFFS.

#### `void playAudioSamples()`
Non-blocking audio playback via DAC. Called in `loop()`.

#### `void stopAudio()`
Stops current audio playback and resets DAC to silence.

## Hardware Configuration

### ESP32 Pins
- **GPIO25**: DAC1 (Audio output)
- **GPIO26**: Servo motor (conflicts with DAC2)
- **GPIO25**: Ultrasonic trigger
- **GPIO33**: Ultrasonic echo
- **GPIO4**: RFID SS
- **GPIO27**: RFID RST

### Connections
- DAC1 (GPIO25) → Audio amplifier/speaker
- Ground → Common ground for all components

### Audio Output
- DAC voltage range: 0-3.3V
- 8-bit resolution: 0-255 steps
- Recommended: Use audio amplifier for better volume
- Optional: Add RC low-pass filter to smooth DAC output

## Storage

### SPIFFS Partition
- **Location**: ESP32 flash memory
- **Default Size**: ~1.5MB (depends on partition table)
- **Directory Structure**:
  ```
  /sounds/
    ├── audio_id1.raw
    ├── audio_id2.raw
    └── audio_id3.raw
  ```

### Preferences (NVS)
- Stores user settings (ranges, audio mappings)
- Persists across reboots
- Namespace: "userSettings"

## Usage Guide

### For Users

1. **Connect ESP32**
   - Click "Connect ESP32" button
   - Grant USB serial port permission in browser

2. **Scan RFID Card**
   - Place RFID card on reader
   - Dashboard loads with user ID

3. **Configure Audio**
   - Upload MP3/WAV files (< 1MB)
   - OR generate tones (custom frequency/period)
   - OR use AI voice/SFX generation
   - OR use preset buzzer sounds

4. **Configure Ranges**
   - Set distance ranges (0-4 meters)
   - Assign audio to each range
   - Add custom ranges if needed

5. **Save & Load**
   - Click "SAVE & LOAD TO ESP32"
   - Wait for audio conversion and transmission
   - Settings are saved to both ESP32 and cloud

### For Developers

#### Adding New Audio Sources
```typescript
// 1. Add to AudioFileInfo type
interface AudioFileInfo {
  id: string;
  name: string;
  sourceType: 'uploaded' | 'saved-tone' | 'ai-voice' | 'ai-sfx' | 'your-new-type';
  // ... your additional fields
}

// 2. Implement conversion in prepareAudioFile()
if (audio.sourceType === 'your-new-type') {
  // Convert to PCM
  pcmData = await yourConversionFunction(audio);
}
```

#### Modifying Serial Protocol
```cpp
// ESP32 side - add new command handler
else if (line.startsWith("YOUR_COMMAND:")) {
  // Handle your command
  String data = line.substring(13);
  // Process data
  Serial.println("OK:YOUR_COMMAND");
}
```

## Troubleshooting

### Audio Not Playing
1. Check SPIFFS is mounted: Serial monitor shows "SPIFFS Mounted Successfully"
2. Verify audio file exists: `SPIFFS.exists("/sounds/audio_id.raw")`
3. Check DAC connection: Measure voltage on GPIO25 during playback
4. Verify sample rate: Should be 8000 Hz or 16000 Hz

### Audio Quality Issues
- **Distorted**: Check audio amplifier gain, reduce input volume
- **Choppy**: Increase sample buffer size or optimize `playAudioSamples()`
- **Too quiet**: Add audio amplifier circuit
- **High-pitched noise**: Add low-pass filter (e.g., 10kΩ + 10nF)

### Serial Communication Fails
1. Check baud rate: Must be 9600
2. Verify Web Serial API support: Chrome/Edge only
3. Check USB cable: Must support data, not just power
4. Try disconnecting and reconnecting

### File Size Limits
- Single file: 1MB (frontend validation)
- Total SPIFFS: ~1.5MB (adjust partition if needed)
- Reduce file size: Lower sample rate or shorten duration

## Performance Considerations

### Audio Latency
- **Trigger to playback**: ~50-100ms
- **Sample playback**: Real-time (8kHz = 125μs per sample)
- **File open**: ~10-50ms from SPIFFS

### Memory Usage
- **Heap**: ~10KB per open file handle
- **Stack**: Minimal (< 1KB)
- **Flash**: Audio files stored in SPIFFS

### Optimization Tips
1. Use 8kHz sample rate instead of 16kHz (half the data)
2. Keep audio files short (< 3 seconds ideal)
3. Limit number of concurrent audio files to 3-5
4. Use preset tones for simple beeps (no file storage needed)

## Security Considerations

- Audio files are stored unencrypted in SPIFFS
- Web Serial requires user gesture (button click) to connect
- RFID UIDs are transmitted in plaintext
- Consider adding authentication for sensitive applications

## Future Enhancements

- [ ] Support for compressed audio (ADPCM, Opus)
- [ ] Multiple audio channels/mixing
- [ ] Volume control via PWM or digital pot
- [ ] Streaming audio without full file storage
- [ ] Pitch/speed modification
- [ ] Audio effects (reverb, echo)

## License

This project is part of MakeUofT 2026.
