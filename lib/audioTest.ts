/**
 * Audio Testing Utilities
 * Helper functions for testing audio conversion and playback
 */

import { convertAudioToPCM, generateTonePCM, validateAudioFile } from './audioConverter';
import { generateHFile, downloadHFile } from './hFileGenerator';

/**
 * Test audio file conversion
 * Returns conversion info and allows preview
 */
export async function testAudioConversion(file: File): Promise<{
  success: boolean;
  error?: string;
  info?: {
    originalSize: number;
    convertedSize: number;
    duration: number;
    sampleRate: number;
    compression: number;
  };
}> {
  try {
    // Validate
    const validation = validateAudioFile(file);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    // Convert
    const { pcmData, metadata } = await convertAudioToPCM(file, 8000);

    const info = {
      originalSize: file.size,
      convertedSize: pcmData.length,
      duration: metadata.duration,
      sampleRate: metadata.sampleRate,
      compression: ((1 - pcmData.length / file.size) * 100),
    };

    return { success: true, info };
  } catch (error) {
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

/**
 * Convert audio file and download as .h file
 * Useful for embedding audio in firmware
 */
export async function convertAndDownloadAsHFile(
  file: File,
  identifier?: string
): Promise<void> {
  const { pcmData, metadata } = await convertAudioToPCM(file, 8000);
  const hFile = generateHFile(
    pcmData,
    metadata,
    identifier || file.name
  );
  downloadHFile(hFile);
}

/**
 * Play PCM data in browser for preview
 */
export function playPCMPreview(
  pcmData: Uint8Array,
  sampleRate: number
): void {
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

  // Convert 8-bit unsigned PCM to Float32 for Web Audio
  const audioBuffer = audioContext.createBuffer(1, pcmData.length, sampleRate);
  const channelData = audioBuffer.getChannelData(0);

  for (let i = 0; i < pcmData.length; i++) {
    // Convert 0-255 to -1.0 to 1.0
    channelData[i] = (pcmData[i] / 127.5) - 1;
  }

  const source = audioContext.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(audioContext.destination);
  source.start();
}

/**
 * Generate and preview a test tone
 */
export function testToneGeneration(
  frequency: number = 440,
  duration: number = 1,
  sampleRate: number = 8000
): void {
  const { pcmData } = generateTonePCM(frequency, duration, sampleRate);
  playPCMPreview(pcmData, sampleRate);
  console.log(`Generated ${frequency}Hz tone: ${pcmData.length} samples at ${sampleRate}Hz`);
}

/**
 * Analyze audio file characteristics
 */
export async function analyzeAudioFile(file: File): Promise<{
  filename: string;
  size: string;
  type: string;
  valid: boolean;
  convertedInfo?: {
    pcmSize: string;
    duration: string;
    sampleCount: number;
    estimatedPlaybackTime: string;
  };
}> {
  const validation = validateAudioFile(file);

  const result: any = {
    filename: file.name,
    size: `${(file.size / 1024).toFixed(2)} KB`,
    type: file.type,
    valid: validation.valid,
  };

  if (validation.valid) {
    try {
      const { pcmData, metadata } = await convertAudioToPCM(file, 8000);
      result.convertedInfo = {
        pcmSize: `${(pcmData.length / 1024).toFixed(2)} KB`,
        duration: `${metadata.duration.toFixed(2)}s`,
        sampleCount: metadata.sampleCount,
        estimatedPlaybackTime: `${metadata.duration.toFixed(2)}s at ${metadata.sampleRate}Hz`,
      };
    } catch (error) {
      result.valid = false;
      result.error = (error as Error).message;
    }
  }

  return result;
}

/**
 * Batch analyze multiple files
 */
export async function analyzeMultipleFiles(files: File[]): Promise<void> {
  console.log(`Analyzing ${files.length} files...`);

  for (const file of files) {
    const analysis = await analyzeAudioFile(file);
    console.log('---');
    console.log(`File: ${analysis.filename}`);
    console.log(`Original Size: ${analysis.size}`);
    console.log(`Type: ${analysis.type}`);
    console.log(`Valid: ${analysis.valid}`);

    if (analysis.convertedInfo) {
      console.log(`Converted Size: ${analysis.convertedInfo.pcmSize}`);
      console.log(`Duration: ${analysis.convertedInfo.duration}`);
      console.log(`Sample Count: ${analysis.convertedInfo.sampleCount}`);
    }
  }

  console.log('---');
  console.log('Analysis complete!');
}

/**
 * Export for use in browser console
 */
if (typeof window !== 'undefined') {
  (window as any).audioTest = {
    testAudioConversion,
    convertAndDownloadAsHFile,
    playPCMPreview,
    testToneGeneration,
    analyzeAudioFile,
    analyzeMultipleFiles,
  };
}
