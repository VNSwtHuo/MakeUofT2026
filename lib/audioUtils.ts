/**
 * Shared audio utilities for the application
 */

/**
 * Play a sine wave tone using Web Audio API
 */
export const playTone = (frequency: number, duration: number): void => {
  const audioContext = new (
    window.AudioContext || (window as any).webkitAudioContext
  )();
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);

  oscillator.frequency.value = frequency;
  oscillator.type = "sine";

  gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(
    0.01,
    audioContext.currentTime + duration,
  );

  const startTime = audioContext.currentTime;
  oscillator.start(startTime);
  oscillator.stop(startTime + duration);
};

/**
 * Play PCM audio data using Web Audio API
 */
export const playPCM = (
  pcmData: Uint8Array,
  sampleRate: number
): void => {
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
};

/**
 * Download a file with the specified name and content
 */
export const downloadFile = (filename: string, content: string): void => {
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
