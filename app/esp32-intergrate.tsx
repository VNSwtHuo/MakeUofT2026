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

        // Process complete lines
        const lines = buffer.split("\n");
        buffer = lines.pop() || ""; // Keep incomplete line in buffer

        for (const line of lines) {
          this.processLine(line.trim());
        }
      }
    } catch (error) {
      console.error("Error reading from ESP32:", error);
    } finally {
      this.reader?.releaseLock();
    }
  }

  private processLine(line: string): void {
    if (!line) return;

    // Check if it's RFID data (format: "UID: XX XX XX XX")
    if (line.startsWith("UID:")) {
      const uid = line.substring(4).trim();
      if (this.onRFIDCallback) {
        this.onRFIDCallback(uid);
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
