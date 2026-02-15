export class ESP32Service {
  private port: any = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private onDataCallback: ((angle: number, distance: number) => void) | null =
    null;
  private onRFIDCallback: ((uid: string) => void) | null = null;
  private onDisconnectCallback: (() => void) | null = null;
  private onLogoutCallback: (() => void) | null = null;

  async connect(): Promise<boolean> {
    try {
      if (!(navigator as any).serial) {
        throw new Error("Web Serial API not supported in this browser");
      }

      // Reuse already-granted ports if available
      if (!this.port) {
        const ports = await (navigator as any).serial.getPorts();
        if (ports && ports.length > 0) {
          this.port = ports[0];
        }
      }

      // If no existing port, ask the user to pick one
      if (!this.port) {
        this.port = await (navigator as any).serial.requestPort();
      }

      // Try to open the port if it's not already open. Some implementations
      // throw when opening an already-open port, so tolerate that case.
      try {
        // A port that is already open typically exposes readable/writable
        // streams; attempt to open only when they are not available.
        const needsOpen = !this.port.readable && !this.port.writable;
        if (needsOpen) {
          await this.port.open({ baudRate: 9600 });
        }
      } catch (err: any) {
        const msg = String(err?.message || err);
        if (!/already open|invalidstate|InvalidStateError/i.test(msg)) {
          throw err;
        }
        console.warn(
          "Serial port already open, continuing without open():",
          msg,
        );
      }

      // Set up writer if available
      if (this.port.writable && !this.writer) {
        this.writer = this.port.writable.getWriter();
      }

      // Listen for disconnect events
      if (this.port && (navigator as any).serial) {
        (navigator as any).serial.addEventListener('disconnect', (event: any) => {
          if (event.target === this.port) {
            this.handleDisconnect();
          }
        });
      }

      // Start reading (will no-op if not readable)
      this.startReading();

      return true;
    } catch (error) {
      console.error("Failed to connect to ESP32:", error);
      return false;
    }
  }

  async disconnect(): Promise<void> {
    if (this.reader) {
      try {
        await this.reader.cancel();
      } catch (err) {
        console.warn("Error cancelling reader:", err);
      }
      try {
        this.reader.releaseLock();
      } catch (err) {
        // ignore
      }
      this.reader = null;
    }
    if (this.writer) {
      try {
        this.writer.releaseLock();
      } catch (err) {
        console.warn("Error releasing writer lock:", err);
      }
      this.writer = null;
    }
    if (this.port) {
      try {
        await this.port.close();
      } catch (err) {
        console.warn("Error closing port:", err);
      }
      this.port = null;
    }
  }

  private async startReading(): Promise<void> {
    if (!this.port?.readable) return;

    // If there's already a reader or the stream is locked, don't re-create one
    if (this.reader) return;
    // ReadableStream has a 'locked' property in the streams API
    // If it's already locked, avoid calling getReader() which will throw
    try {
      // @ts-ignore - some environments may not have locked typed
      if (this.port.readable.locked) {
        console.warn("Readable stream already locked; skipping startReading()");
        return;
      }
    } catch (err) {
      // If checking locked fails, continue and handle getReader() error below
    }

    try {
      this.reader = this.port.readable.getReader();
    } catch (err: any) {
      const msg = String(err?.message || err);
      console.warn("Unable to get reader from readable stream:", msg);
      return;
    }
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (this.reader) {
        const { value, done } = await this.reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete lines (handle both \n and \r\n)
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || ""; // Keep incomplete line in buffer

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (trimmedLine) {
            this.processLine(trimmedLine);
          }
        }
      }
    } catch (error) {
      console.error("Error reading from ESP32:", error);
      this.handleDisconnect();
    } finally {
      try {
        this.reader?.releaseLock();
      } catch (err) {
        // ignore
      }
    }
  }

  private processLine(line: string): void {
    if (!line) return;

    // Check if it's logout message
    if (/^LOGOUT:/i.test(line)) {
      if (this.onLogoutCallback) {
        this.onLogoutCallback();
      }
      return;
    }

    // Check if it's RFID data (format: "UID: XX XX XX XX" or "UID:XX XX XX XX")
    // Handle both with and without space after colon, case insensitive
    const uidMatch = line.match(/^UID:\s*(.+)$/i);
    if (uidMatch) {
      const uid = uidMatch[1].trim();
      // Remove any trailing whitespace, newlines, or carriage returns
      const cleanUid = uid.replace(/[\s\r\n]+$/, "").replace(/^\s+/, "");

      // Only trigger if we have a valid UID (at least 2 characters, typically "XX XX XX XX")
      if (cleanUid && cleanUid.length >= 2 && this.onRFIDCallback) {
        // Call callback immediately (synchronously) to ensure it fires
        // The callback handler will manage navigation timing
        try {
          this.onRFIDCallback(cleanUid);
        } catch (error) {
          console.error("Error in RFID callback:", error);
        }
      } else if (cleanUid && cleanUid.length >= 2 && !this.onRFIDCallback) {
        // Debug: callback not set
        console.warn("RFID UID detected but callback not set:", cleanUid);
      }
      return;
    }

    // Check if it's radar data (format: "angle,distance")
    const parts = line.split(",");
    if (parts.length === 2) {
      const angle = parseInt(parts[0]);
      const distance = parseInt(parts[1]);

      if (!isNaN(angle) && !isNaN(distance)) {
        if (this.onDataCallback) {
          this.onDataCallback(angle, distance);
        }
      }
    }
  }

  async sendSettings(settings: {
    visionRange: number;
    distanceZones: Array<{ distance: number; soundFont: string }>;
  }): Promise<void> {
    if (!this.writer) return;

    // Format: "SETTINGS:visionRange,dist1,dist2,dist3\n"
    const distances = settings.distanceZones.map((z) => z.distance).join(",");
    const message = `SETTINGS:${settings.visionRange},${distances}\n`;

    const encoder = new TextEncoder();
    await this.writer.write(encoder.encode(message));
  }

  async sendUserSettings(settings: {
    userId: string;
    ranges: Array<{
      minDistance: number;
      maxDistance: number;
      audioId: string;
      audioName?: string;
    }>;
    audioFiles: Array<{
      id: string;
      identifier: string;
      name: string;
      frequency: number;
      period: number;
      sourceType: string;
      sampleCount: number;
      hexData: string;
    }>;
  }): Promise<void> {
    if (!this.writer) {
      throw new Error("ESP32 not connected");
    }

    const encoder = new TextEncoder();

    // Send command to start settings upload
    const startCommand = `SAVE_SETTINGS:${settings.userId}\n`;
    await this.writer.write(encoder.encode(startCommand));

    // Wait a bit for ESP32 to be ready
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Send ranges data (convert meters to centimeters)
    const rangesData = settings.ranges
      .map(
        (r) =>
          `${(r.minDistance * 100).toFixed(0)},${(r.maxDistance * 100).toFixed(0)},${r.audioId}`,
      )
      .join("|");
    const rangesMessage = `RANGES:${rangesData}\n`;
    await this.writer.write(encoder.encode(rangesMessage));

    // Wait a bit
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Send audio files data (simplified - just IDs and identifiers for now)
    const audioData = settings.audioFiles
      .map(
        (a) =>
          `${a.id}:${a.identifier}:${a.frequency}:${a.period}:${a.sourceType}`,
      )
      .join("|");
    const audioMessage = `AUDIO:${audioData}\n`;
    await this.writer.write(encoder.encode(audioMessage));

    // Wait a bit
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Send end command
    const endCommand = `END_SETTINGS\n`;
    await this.writer.write(encoder.encode(endCommand));
  }

  /**
   * Parse a .h file containing unsigned char/uint8_t array data
   * Returns the raw bytes extracted from the array
   * Example format:
   *   unsigned char AUDIO_DATA[] = {
   *     0x00, 0x01, 0x02, ..., 0xFF
   *   };
   */
  static parseHexFile(fileContent: string): Uint8Array {
    // Extract the array content between { and }
    const match = fileContent.match(/\{([^}]+)\}/);
    if (!match) {
      throw new Error("Could not find array data in .h file");
    }

    const arrayContent = match[1];
    // Split by comma and filter out empty strings and whitespace-only strings
    const hexValues = arrayContent
      .split(",")
      .map((v) => v.trim())
      .filter((v) => v.length > 0)
      .map((v) => {
        // Remove '0x' prefix and convert
        const hex = v.replace(/0x|0X/, "");
        return parseInt(hex, 16);
      });

    if (hexValues.some((v) => isNaN(v))) {
      throw new Error("Invalid hex values found in array");
    }

    return new Uint8Array(hexValues);
  }

  /**
   * Send audio file (raw bytes) to ESP32 over serial
   * Protocol:
   *   START_SOUND <filename> <length>\n
   *   [binary bytes]
   *   END_SOUND\n
   */
  async sendAudioFile(
    filename: string,
    audioBytes: Uint8Array,
    sampleRate: number = 8000,
  ): Promise<void> {
    if (!this.writer) {
      throw new Error("ESP32 not connected");
    }

    const encoder = new TextEncoder();

    // Send start marker with filename and byte length
    const startMessage = `START_SOUND ${filename} ${audioBytes.length}\n`;
    console.log(
      `[ESP32] Sending audio file: ${filename} (${audioBytes.length} bytes)`,
    );
    await this.writer.write(encoder.encode(startMessage));

    // Wait for ESP32 to be ready
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Send binary audio data in chunks to avoid buffer overflow
    const chunkSize = 256;
    for (let i = 0; i < audioBytes.length; i += chunkSize) {
      const chunk = audioBytes.slice(
        i,
        Math.min(i + chunkSize, audioBytes.length),
      );
      await this.writer.write(chunk);
      // Small delay between chunks to let ESP32 process
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    // Wait before sending end marker
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Send end marker
    const endMessage = `END_SOUND\n`;
    await this.writer.write(encoder.encode(endMessage));

    console.log(`[ESP32] Audio file sent: ${filename}`);
  }

  /**
   * Send audio file from a .h file content directly
   */
  async sendAudioFileFromHex(
    filename: string,
    hexFileContent: string,
    sampleRate: number = 8000,
  ): Promise<void> {
    const audioBytes = ESP32Service.parseHexFile(hexFileContent);
    await this.sendAudioFile(filename, audioBytes, sampleRate);
  }

  /**
   * Convert and send uploaded audio file (MP3/WAV)
   * This method handles the full pipeline:
   * 1. Validate file
   * 2. Convert to PCM
   * 3. Send to ESP32
   */
  async convertAndSendAudioFile(
    audioFile: File,
    targetSampleRate: number = 8000,
  ): Promise<void> {
    // Import audio converter dynamically
    const { convertAudioToPCM, validateAudioFile } =
      await import("@/lib/audioConverter");

    // Validate file
    const validation = validateAudioFile(audioFile);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    console.log(`[ESP32] Converting audio file: ${audioFile.name}`);

    // Convert to PCM
    const { pcmData, metadata } = await convertAudioToPCM(
      audioFile,
      targetSampleRate,
    );

    console.log(
      `[ESP32] Converted to PCM: ${metadata.sampleCount} samples at ${metadata.sampleRate}Hz`,
    );

    // Send to ESP32
    const filename = audioFile.name.replace(/\.(mp3|wav)$/i, ".raw");
    await this.sendAudioFile(filename, pcmData, metadata.sampleRate);
  }

  /**
   * Send multiple audio files (used for saving user settings with audio)
   */
  async sendMultipleAudioFiles(
    audioFiles: Array<{
      id: string;
      file?: File;
      pcmData?: Uint8Array;
      sampleRate?: number;
    }>,
  ): Promise<void> {
    for (const audio of audioFiles) {
      try {
        if (audio.file) {
          // Convert and send uploaded file
          await this.convertAndSendAudioFile(
            audio.file,
            audio.sampleRate || 8000,
          );
        } else if (audio.pcmData) {
          // Send pre-converted PCM data
          const filename = `${audio.id}.raw`;
          await this.sendAudioFile(
            filename,
            audio.pcmData,
            audio.sampleRate || 8000,
          );
        }
      } catch (error) {
        console.error(`Failed to send audio ${audio.id}:`, error);
        throw error;
      }
    }
  }

  onRadarData(callback: (angle: number, distance: number) => void): void {
    this.onDataCallback = callback;
  }

  onRFIDScan(callback: (uid: string) => void): void {
    this.onRFIDCallback = callback;
  }

  onDisconnect(callback: () => void): void {
    this.onDisconnectCallback = callback;
  }

  onLogout(callback: () => void): void {
    this.onLogoutCallback = callback;
  }

  private handleDisconnect(): void {
    console.log('ESP32 disconnected');
    this.port = null;
    this.reader = null;
    this.writer = null;
    if (this.onDisconnectCallback) {
      this.onDisconnectCallback();
    }
  }

  isConnected(): boolean {
    return this.port !== null;
  }
}

export const esp32Service = new ESP32Service();
