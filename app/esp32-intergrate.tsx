export class ESP32Service {
  private port: any = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private onDataCallback: ((angle: number, distance: number) => void) | null =
    null;
  private onRFIDCallback: ((uid: string) => void) | null = null;

  async connect(): Promise<boolean> {
    try {
      // Request serial port
      this.port = await navigator.serial.requestPort();
      await this.port.open({ baudRate: 9600 });

      // Set up writer
      if (this.port.writable) {
        this.writer = this.port.writable.getWriter();
      }

      // Start reading
      this.startReading();

      return true;
    } catch (error) {
      console.error("Failed to connect to ESP32:", error);
      return false;
    }
  }

  async disconnect(): Promise<void> {
    if (this.reader) {
      await this.reader.cancel();
      this.reader = null;
    }
    if (this.writer) {
      this.writer.releaseLock();
      this.writer = null;
    }
    if (this.port) {
      await this.port.close();
      this.port = null;
    }
  }

  private async startReading(): Promise<void> {
    if (!this.port?.readable) return;

    this.reader = this.port.readable.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
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
      // Try to restart reading if there's an error
      if (this.port?.readable) {
        setTimeout(() => this.startReading(), 1000);
      }
    } finally {
      this.reader?.releaseLock();
    }
  }

  private processLine(line: string): void {
    if (!line) return;

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

    // Send ranges data
    const rangesData = settings.ranges
      .map(
        (r) =>
          `${r.minDistance.toFixed(2)},${r.maxDistance.toFixed(2)},${r.audioId}`,
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

  onRadarData(callback: (angle: number, distance: number) => void): void {
    this.onDataCallback = callback;
  }

  onRFIDScan(callback: (uid: string) => void): void {
    this.onRFIDCallback = callback;
  }

  isConnected(): boolean {
    return this.port !== null;
  }
}

export const esp32Service = new ESP32Service();
