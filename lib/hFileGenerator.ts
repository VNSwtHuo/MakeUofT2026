/**
 * .h File Generator
 * Generates C header files containing audio data as uint8_t arrays
 */

import { AudioMetadata } from './audioConverter';

export interface HFileData {
  filename: string;
  content: string;
  arrayName: string;
}

/**
 * Generate a .h file from PCM audio bytes
 * Format:
 *   const uint8_t AUDIO_DATA[] = {
 *     0x00, 0x01, 0x02, ..., 0xFF
 *   };
 *   const unsigned int AUDIO_DATA_LENGTH = 12345;
 *   const unsigned int SAMPLE_RATE = 8000;
 */
export function generateHFile(
  audioBytes: Uint8Array,
  metadata: AudioMetadata,
  identifier: string
): HFileData {
  const arrayName = sanitizeIdentifier(identifier);
  const filename = `${arrayName}.h`;

  // Generate hex array content
  const hexValues: string[] = [];
  for (let i = 0; i < audioBytes.length; i++) {
    hexValues.push(`0x${audioBytes[i].toString(16).padStart(2, '0')}`);
  }

  // Format in rows of 12 bytes for readability
  const rows: string[] = [];
  for (let i = 0; i < hexValues.length; i += 12) {
    const row = hexValues.slice(i, i + 12).join(', ');
    rows.push(`  ${row}`);
  }

  // Generate complete .h file content
  const content = `// Auto-generated audio data file
// Original identifier: ${identifier}
// Sample rate: ${metadata.sampleRate} Hz
// Duration: ${metadata.duration.toFixed(2)}s
// Sample count: ${metadata.sampleCount}

#ifndef ${arrayName.toUpperCase()}_H
#define ${arrayName.toUpperCase()}_H

const unsigned char ${arrayName}_data[] = {
${rows.join(',\n')}
};

const unsigned int ${arrayName}_length = ${audioBytes.length};
const unsigned int ${arrayName}_sample_rate = ${metadata.sampleRate};
const unsigned int ${arrayName}_channels = ${metadata.channels};

#endif // ${arrayName.toUpperCase()}_H
`;

  return {
    filename,
    content,
    arrayName,
  };
}

/**
 * Sanitize a string to be a valid C identifier
 * - Remove or replace invalid characters
 * - Ensure it starts with a letter or underscore
 * - Convert to uppercase with underscores
 */
function sanitizeIdentifier(str: string): string {
  // Remove file extension if present
  let cleaned = str.replace(/\.(mp3|wav|h)$/i, '');

  // Replace spaces and special chars with underscores
  cleaned = cleaned.replace(/[^a-zA-Z0-9_]/g, '_');

  // Remove consecutive underscores
  cleaned = cleaned.replace(/_+/g, '_');

  // Ensure it starts with a letter or underscore
  if (/^\d/.test(cleaned)) {
    cleaned = 'AUDIO_' + cleaned;
  }

  // Convert to uppercase
  cleaned = cleaned.toUpperCase();

  // Truncate if too long (max 64 chars)
  if (cleaned.length > 64) {
    cleaned = cleaned.substring(0, 64);
  }

  return cleaned;
}

/**
 * Download .h file to user's computer
 */
export function downloadHFile(hFileData: HFileData): void {
  const blob = new Blob([hFileData.content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = hFileData.filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Parse existing .h file and extract metadata
 * Returns the identifier and byte data
 */
export function parseHFileMetadata(content: string): {
  identifier: string;
  sampleRate?: number;
  length?: number;
} {
  const result: any = {};

  // Try to extract identifier from array name
  const arrayMatch = content.match(/const\s+unsigned\s+char\s+(\w+)_data\s*\[\]/);
  if (arrayMatch) {
    result.identifier = arrayMatch[1];
  }

  // Extract sample rate
  const sampleRateMatch = content.match(/const\s+unsigned\s+int\s+\w+_sample_rate\s*=\s*(\d+)/);
  if (sampleRateMatch) {
    result.sampleRate = parseInt(sampleRateMatch[1]);
  }

  // Extract length
  const lengthMatch = content.match(/const\s+unsigned\s+int\s+\w+_length\s*=\s*(\d+)/);
  if (lengthMatch) {
    result.length = parseInt(lengthMatch[1]);
  }

  return result;
}
