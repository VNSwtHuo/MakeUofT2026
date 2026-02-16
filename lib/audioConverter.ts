/**
 * Audio Converter Library
 * Converts MP3/WAV audio files to raw PCM format suitable for ESP32 DAC playback
 */

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

/**
 * Convert audio file (MP3/WAV) to raw 8-bit PCM data for ESP32 DAC
 * Target: 8kHz or 16kHz mono, 8-bit unsigned PCM
 */
export async function convertAudioToPCM(
  audioFile: File,
  targetSampleRate: number = 8000
): Promise<ConvertedAudio> {
  // Load audio file as ArrayBuffer
  const arrayBuffer = await audioFile.arrayBuffer();

  // Create AudioContext with target sample rate
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
    sampleRate: targetSampleRate,
  });

  try {
    // Decode audio data
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    // Get channel data (convert to mono if stereo)
    let audioData: Float32Array;
    if (audioBuffer.numberOfChannels === 1) {
      audioData = audioBuffer.getChannelData(0);
    } else {
      // Mix down to mono by averaging channels
      const left = audioBuffer.getChannelData(0);
      const right = audioBuffer.getChannelData(1);
      audioData = new Float32Array(left.length);
      for (let i = 0; i < left.length; i++) {
        audioData[i] = (left[i] + right[i]) / 2;
      }
    }

    // Resample if needed (AudioContext should handle this with sampleRate setting)
    // But if the decoded sample rate doesn't match, we need offline context
    let resampledData = audioData;
    if (audioBuffer.sampleRate !== targetSampleRate) {
      resampledData = await resampleAudio(
        audioData,
        audioBuffer.sampleRate,
        targetSampleRate
      );
    }

    // Convert float32 PCM (-1.0 to 1.0) to 8-bit unsigned PCM (0 to 255)
    const pcmData = new Uint8Array(resampledData.length);
    for (let i = 0; i < resampledData.length; i++) {
      // Clamp to -1.0 to 1.0 range
      const sample = Math.max(-1, Math.min(1, resampledData[i]));
      // Convert to 0-255 range (8-bit unsigned)
      pcmData[i] = Math.floor((sample + 1) * 127.5);
    }

    const metadata: AudioMetadata = {
      sampleRate: targetSampleRate,
      channels: 1, // Always mono
      duration: resampledData.length / targetSampleRate,
      sampleCount: resampledData.length,
    };

    await audioContext.close();

    return {
      pcmData,
      metadata,
    };
  } catch (error) {
    await audioContext.close();
    throw new Error(`Failed to convert audio: ${(error as Error).message}`);
  }
}

/**
 * Simple linear interpolation resampler
 */
async function resampleAudio(
  audioData: Float32Array,
  sourceSampleRate: number,
  targetSampleRate: number
): Promise<Float32Array> {
  const ratio = sourceSampleRate / targetSampleRate;
  const newLength = Math.floor(audioData.length / ratio);
  const result = new Float32Array(newLength);

  for (let i = 0; i < newLength; i++) {
    const srcIndex = i * ratio;
    const srcIndexFloor = Math.floor(srcIndex);
    const srcIndexCeil = Math.min(srcIndexFloor + 1, audioData.length - 1);
    const fraction = srcIndex - srcIndexFloor;

    // Linear interpolation
    result[i] =
      audioData[srcIndexFloor] * (1 - fraction) +
      audioData[srcIndexCeil] * fraction;
  }

  return result;
}

/**
 * Convert Web Audio API tone to PCM
 * Used for generated tones (buzzer sounds)
 */
export function generateTonePCM(
  frequency: number,
  duration: number,
  sampleRate: number = 8000
): ConvertedAudio {
  const sampleCount = Math.floor(duration * sampleRate);
  const pcmData = new Uint8Array(sampleCount);

  for (let i = 0; i < sampleCount; i++) {
    const t = i / sampleRate;
    const sample = Math.sin(2 * Math.PI * frequency * t);
    // Convert to 8-bit unsigned
    pcmData[i] = Math.floor((sample + 1) * 127.5);
  }

  return {
    pcmData,
    metadata: {
      sampleRate,
      channels: 1,
      duration,
      sampleCount,
    },
  };
}

/**
 * Validate audio file size (should be under 1MB)
 */
export function validateAudioFile(file: File): { valid: boolean; error?: string } {
  const maxSize = 1024 * 1024; // 1MB

  if (file.size > maxSize) {
    return {
      valid: false,
      error: `File size (${(file.size / 1024).toFixed(0)}KB) exceeds 1MB limit`,
    };
  }

  const validTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/wave', 'audio/x-wav'];
  if (!validTypes.some(type => file.type.includes(type) || file.name.toLowerCase().endsWith('.mp3') || file.name.toLowerCase().endsWith('.wav'))) {
    return {
      valid: false,
      error: 'Only MP3 and WAV files are supported',
    };
  }

  return { valid: true };
}
