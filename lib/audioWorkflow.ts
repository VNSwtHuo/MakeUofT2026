/**
 * Audio Workflow Utility
 * Handles the complete workflow of preparing and sending audio files to ESP32
 */

import { convertAudioToPCM, generateTonePCM } from './audioConverter';
import { esp32Service } from '@/app/esp32-intergrate';

export interface AudioFileInfo {
  id: string;
  name: string;
  sourceType: 'uploaded' | 'saved-tone' | 'ai-voice' | 'ai-sfx';

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

/**
 * Prepare audio file for ESP32 transmission
 * Converts audio files to PCM format
 */
export async function prepareAudioFile(
  audio: AudioFileInfo,
  targetSampleRate: number = 8000
): Promise<{ id: string; pcmData: Uint8Array; sampleRate: number; filename: string }> {
  let pcmData: Uint8Array;
  let sampleRate = targetSampleRate;

  if (audio.sourceType === 'saved-tone' && audio.frequency && audio.period) {
    // Generate tone PCM
    const converted = generateTonePCM(audio.frequency, audio.period, targetSampleRate);
    pcmData = converted.pcmData;
    sampleRate = converted.metadata.sampleRate;
  } else if (audio.file) {
    // Convert uploaded file
    const converted = await convertAudioToPCM(audio.file, targetSampleRate);
    pcmData = converted.pcmData;
    sampleRate = converted.metadata.sampleRate;
  } else if (audio.url) {
    // Download and convert from URL (for AI-generated audio)
    const response = await fetch(audio.url);
    const blob = await response.blob();
    const file = new File([blob], audio.name, { type: blob.type });
    const converted = await convertAudioToPCM(file, targetSampleRate);
    pcmData = converted.pcmData;
    sampleRate = converted.metadata.sampleRate;
  } else {
    throw new Error(`Cannot prepare audio file: ${audio.id} - missing source data`);
  }

  // Generate safe filename
  const filename = `${audio.id}.raw`;

  return {
    id: audio.id,
    pcmData,
    sampleRate,
    filename,
  };
}

/**
 * Send all audio files to ESP32
 * This is called before sending settings
 */
export async function sendAudioFilesToESP32(
  audioFiles: AudioFileInfo[],
  onProgress?: (current: number, total: number, filename: string) => void
): Promise<void> {
  const total = audioFiles.length;

  for (let i = 0; i < audioFiles.length; i++) {
    const audio = audioFiles[i];

    if (onProgress) {
      onProgress(i + 1, total, audio.name);
    }

    try {
      // Prepare audio file (convert to PCM)
      const prepared = await prepareAudioFile(audio);

      // Send to ESP32
      await esp32Service.sendAudioFile(
        prepared.filename,
        prepared.pcmData,
        prepared.sampleRate
      );

      console.log(`[Workflow] Sent audio file: ${prepared.filename} (${prepared.pcmData.length} bytes)`);
      
      // Wait between files to let ESP32 finish writing to SPIFFS
      await new Promise((resolve) => setTimeout(resolve, 200));
    } catch (error) {
      console.error(`[Workflow] Failed to send audio ${audio.id}:`, error);
      throw new Error(`Failed to send audio "${audio.name}": ${(error as Error).message}`);
    }
  }
}

/**
 * Complete workflow: Send audio files then send settings
 */
export async function saveSettingsToESP32(
  userId: string,
  ranges: Array<{
    id: string;
    minDistance: number;
    maxDistance: number;
    audioId: string;
    audioName?: string;
  }>,
  audioFiles: AudioFileInfo[],
  onProgress?: (stage: string, progress?: number) => void
): Promise<void> {
  try {
    // Stage 1: Send all audio files
    if (onProgress) onProgress('Sending audio files...', 0);

    await sendAudioFilesToESP32(audioFiles, (current, total, filename) => {
      const progress = (current / total) * 50; // 0-50% for audio upload
      if (onProgress) onProgress(`Uploading ${filename}...`, progress);
    });

    if (onProgress) onProgress('Audio files uploaded', 50);

    // CRITICAL: Wait for ESP32 to finish processing audio files
    // The ESP32 needs time to close files and be ready for settings commands
    console.log('[Workflow] Waiting for ESP32 to be ready for settings...');
    await new Promise((resolve) => setTimeout(resolve, 2000)); // Increased to 2 seconds

    // Stage 2: Send settings
    if (onProgress) onProgress('Saving settings...', 60);

    await esp32Service.sendUserSettings({
      userId,
      ranges: ranges.map(r => ({
        minDistance: r.minDistance,
        maxDistance: r.maxDistance,
        audioId: r.audioId,
        audioName: r.audioName || r.audioId,
      })),
      audioFiles: audioFiles.map(a => ({
        id: a.id,
        identifier: a.id,
        name: a.name,
        frequency: a.frequency || 0,
        period: a.period || 0,
        sourceType: a.sourceType,
        sampleCount: a.pcmData?.length || 0,
        hexData: '', // Not needed for this workflow
      })),
    });

    if (onProgress) onProgress('Settings saved!', 100);
  } catch (error) {
    console.error('[Workflow] Save settings failed:', error);
    throw error;
  }
}

/**
 * Get unique audio files from ranges
 * Returns only the audio files that are actually assigned to ranges
 */
export function getUsedAudioFiles(
  ranges: Array<{ audioId: string | null }>,
  allAudioFiles: AudioFileInfo[]
): AudioFileInfo[] {
  const usedIds = new Set(
    ranges
      .map(r => r.audioId)
      .filter(id => id !== null) as string[]
  );

  return allAudioFiles.filter(audio => usedIds.has(audio.id));
}
