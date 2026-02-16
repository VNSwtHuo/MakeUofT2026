/**
 * Shared type definitions for audio system
 */

export interface AudioFile {
  id: string;
  name: string;
  url?: string;
  file?: File;
  isPreset?: boolean;
  frequency?: number;
  duration?: number;
  period?: number;
  voiceId?: string;
  voiceName?: string;
  sourceType?: "uploaded" | "saved-tone" | "ai-voice" | "ai-sfx";
}

export interface DistanceTrigger {
  id: string;
  minDistance: number;
  maxDistance: number;
  audioId: string | null;
  audioName?: string;
}

export interface AudioFileInfo {
  id: string;
  name: string;
  sourceType: "uploaded" | "saved-tone" | "ai-voice" | "ai-sfx";

  // For uploaded files
  file?: File;
  url?: string;

  // For tones
  frequency?: number;
  period?: number;

  // Converted data
  pcmData?: Uint8Array;
  sampleRate?: number;
}

export interface AudioMetadata {
  sampleRate: number;
  channels: number;
  duration: number;
  sampleCount: number;
}

export interface ConvertedAudio {
  pcmData: Uint8Array;
  metadata: AudioMetadata;
}

export interface HFileData {
  filename: string;
  content: string;
  arrayName: string;
}
