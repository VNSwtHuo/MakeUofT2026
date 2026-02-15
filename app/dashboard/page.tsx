"use client";

import { LogOut, Upload, Volume2, Play, Pause } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useState, useRef, useEffect } from "react";

interface AudioFile {
  id: string;
  name: string;
  url?: string;
  isPreset?: boolean;
  frequency?: number;
  duration?: number;
  period?: number;
  voiceId?: string;
  voiceName?: string;
}

interface DistanceTrigger {
  id: string;
  minDistance: number;
  maxDistance: number;
  audioId: string | null;
  audioName?: string;
}

const PRESET_BUZZER_SOUNDS: AudioFile[] = [
  {
    id: "warning",
    name: "440Hz, 1s",
    frequency: 440,
    duration: 0.5,
    period: 1,
    isPreset: true,
  },
  {
    id: "alert",
    name: "800Hz, 0.8s",
    frequency: 800,
    duration: 0.3,
    period: 0.8,
    isPreset: true,
  },
  {
    id: "beep",
    name: "1000Hz, 0.5s",
    frequency: 1000,
    duration: 0.2,
    period: 0.5,
    isPreset: true,
  },
  {
    id: "chime",
    name: "1200Hz, 1.2s",
    frequency: 1200,
    duration: 0.4,
    period: 1.2,
    isPreset: true,
  },
];

// ElevenLabs voices
const ELEVENLABS_VOICES = [
  { id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel - Warm Female" },
  { id: "pNInz6obpgDQGcFmaJgB", name: "Adam - Deep Male" },
  { id: "GhkQkxbimoIykF4iGYqh", name: "Kyle - Neutral" },
];

// Function to play a tone using Web Audio API
const playTone = (frequency: number, duration: number) => {
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);

  oscillator.frequency.value = frequency;
  oscillator.type = "sine";

  gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);

  oscillator.start(audioContext.currentTime);
  oscillator.stop(audioContext.currentTime + duration);
};

export default function Dashboard() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const repeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const presetRepeatIntervalsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const [uploadedAudios, setUploadedAudios] = useState<AudioFile[]>([]);
  const [savedCustomTones, setSavedCustomTones] = useState<AudioFile[]>([]);
  const [activeSound, setActiveSound] = useState<string | null>(null);
  const [customFrequency, setCustomFrequency] = useState<number | string>(500);
  const [customPeriod, setCustomPeriod] = useState<number | string>(0.5);
  const [soundGenerationType, setSoundGenerationType] = useState<"tts" | "alarm" | "sfx">("tts");
  const [ttsText, setTtsText] = useState<string>("");
  const [selectedVoice, setSelectedVoice] = useState<string>("21m00Tcm4TlvDq8ikWAM");
  const [alarmFrequency, setAlarmFrequency] = useState<number | string>(800);
  const [alarmPattern, setAlarmPattern] = useState<"steady" | "pulse" | "siren">("pulse");
  const [alarmDuration, setAlarmDuration] = useState<number | string>(3);
  const [sfxType, setSfxType] = useState<"error" | "success" | "warning" | "beep">("beep");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPlayingRepeat, setIsPlayingRepeat] = useState(false);
  const [distanceTriggers, setDistanceTriggers] = useState<DistanceTrigger[]>([
    { id: "zone1", minDistance: 0, maxDistance: 1, audioId: null },
    { id: "zone2", minDistance: 1, maxDistance: 2, audioId: null },
    { id: "zone3", minDistance: 2, maxDistance: 4, audioId: null },
  ]);
  const [newRangeMin, setNewRangeMin] = useState<number | string>(0.1);
  const [newRangeMax, setNewRangeMax] = useState<number | string>(0.5);
  const [isPlayingSequence, setIsPlayingSequence] = useState(false);
  const [playingTrigger, setPlayingTrigger] = useState<string | null>(null);
  const [playbackProgress, setPlaybackProgress] = useState(0); // 0-100
  const sequenceIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const playbackStartTimeRef = useRef<number>(0);
  const playbackDurationRef = useRef<number>(0);
  const sequenceStartTimeRef = useRef<number>(0);
  const totalSequenceDurationRef = useRef<number>(0);

  // Update playback progress animation
  useEffect(() => {
    if (!isPlayingSequence) return;
    
    const updateProgress = () => {
      if (sequenceStartTimeRef.current && totalSequenceDurationRef.current) {
        const elapsed = Date.now() - sequenceStartTimeRef.current;
        const progress = Math.min((elapsed / totalSequenceDurationRef.current) * 100, 100);
        setPlaybackProgress(progress);
      }
      if (isPlayingSequence) {
        requestAnimationFrame(updateProgress);
      }
    };
    
    const animationId = requestAnimationFrame(updateProgress);
    return () => cancelAnimationFrame(animationId);
  }, [isPlayingSequence]);

  // Cleanup intervals on unmount
  useEffect(() => {
    return () => {
      if (repeatIntervalRef.current) {
        clearInterval(repeatIntervalRef.current);
      }
      if (sequenceIntervalRef.current) {
        clearInterval(sequenceIntervalRef.current);
      }
      presetRepeatIntervalsRef.current.forEach((intervalId) => {
        clearInterval(intervalId);
      });
      presetRepeatIntervalsRef.current.clear();
    };
  }, []);

  const updateDistanceTrigger = (triggerId: string, audioId: string | null, audioName?: string) => {
    setDistanceTriggers((prev) =>
      prev.map((trigger) =>
        trigger.id === triggerId
          ? { ...trigger, audioId, audioName }
          : trigger
      )
    );
  };

  const stopAllAudio = () => {
    // Stop preset audio
    presetRepeatIntervalsRef.current.forEach((intervalId) => {
      clearInterval(intervalId);
    });
    presetRepeatIntervalsRef.current.clear();

    // Stop custom repeating tone
    if (repeatIntervalRef.current) {
      clearInterval(repeatIntervalRef.current);
      repeatIntervalRef.current = null;
    }

    // Stop distance sequence
    if (sequenceIntervalRef.current) {
      clearInterval(sequenceIntervalRef.current);
      sequenceIntervalRef.current = null;
    }

    // Stop uploaded audio file
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current.loop = false;
    }

    // Reset state
    setActiveSound(null);
    setIsPlayingRepeat(false);
    setIsPlayingSequence(false);
    setPlayingTrigger(null);
    setPlaybackProgress(0);
  };

  const addCustomRange = () => {
    const minVal = typeof newRangeMin === 'string' ? parseFloat(newRangeMin) : newRangeMin;
    const maxVal = typeof newRangeMax === 'string' ? parseFloat(newRangeMax) : newRangeMax;

    if (isNaN(minVal) || isNaN(maxVal)) {
      alert("Please enter valid numbers");
      return;
    }

    if (minVal < 0 || maxVal > 4) {
      alert("Range must be between 0m and 4m");
      return;
    }

    if (minVal >= maxVal) {
      alert("Min distance must be less than max distance");
      return;
    }

    if (maxVal - minVal < 0.1) {
      alert("Range size must be at least 0.1m");
      return;
    }

    // Check for overlaps with existing ranges
    const overlaps = distanceTriggers.some(
      (trigger) =>
        (minVal >= trigger.minDistance && minVal < trigger.maxDistance) ||
        (maxVal > trigger.minDistance && maxVal <= trigger.maxDistance) ||
        (minVal <= trigger.minDistance && maxVal >= trigger.maxDistance)
    );

    if (overlaps) {
      alert("This range overlaps with an existing range");
      return;
    }

    const newTrigger: DistanceTrigger = {
      id: `custom-${Date.now()}`,
      minDistance: minVal,
      maxDistance: maxVal,
      audioId: null,
    };

    setDistanceTriggers((prev) => [...prev, newTrigger].sort((a, b) => a.minDistance - b.minDistance));
    setNewRangeMin(0.1);
    setNewRangeMax(0.5);
  };

  const deleteCustomRange = (triggerId: string) => {
    setDistanceTriggers((prev) => prev.filter((trigger) => trigger.id !== triggerId));
  };

  const playDistanceSequence = () => {
    if (isPlayingSequence) {
      // Stop the sequence
      if (sequenceIntervalRef.current) {
        clearInterval(sequenceIntervalRef.current);
        sequenceIntervalRef.current = null;
      }
      // Stop any currently playing audio
      presetRepeatIntervalsRef.current.forEach((intervalId) => {
        clearInterval(intervalId);
      });
      presetRepeatIntervalsRef.current.clear();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.loop = false;
      }
      setIsPlayingSequence(false);
      setPlayingTrigger(null);
      setPlaybackProgress(0);
      setActiveSound(null);
      return;
    }

    stopAllAudio();
    
    // Calculate total sequence duration (through ALL distance triggers, not just those with audio)
    let totalDuration = 0;
    distanceTriggers.forEach((trigger) => {
      const rangeSize = trigger.maxDistance - trigger.minDistance;
      const durationSeconds = rangeSize * 2; // 2 seconds per meter
      totalDuration += (durationSeconds + 0.5) * 1000; // Add gap between triggers
    });
    
    sequenceStartTimeRef.current = Date.now();
    totalSequenceDurationRef.current = totalDuration;
    
    setIsPlayingSequence(true);
    let currentIndex = 0;

    const playNextTrigger = () => {
      if (currentIndex >= distanceTriggers.length) {
        // Sequence complete
        setIsPlayingSequence(false);
        setPlayingTrigger(null);
        setActiveSound(null);
        if (audioRef.current) {
          audioRef.current.loop = false;
        }
        return;
      }

      const trigger = distanceTriggers[currentIndex];
      setPlayingTrigger(trigger.id);
      
      // Stop any previously playing audio
      presetRepeatIntervalsRef.current.forEach((intervalId) => {
        clearInterval(intervalId);
      });
      presetRepeatIntervalsRef.current.clear();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      
      const audio = [...PRESET_BUZZER_SOUNDS, ...uploadedAudios].find(
        (a) => a.id === trigger.audioId
      );

      if (audio) {
        setActiveSound(audio.id);
        // Calculate duration: 2 seconds per meter
        const rangeSize = trigger.maxDistance - trigger.minDistance;
        const durationSeconds = rangeSize * 2; // 2 seconds per meter
        const duration = durationSeconds * 1000;
        
        if (audio.frequency && audio.period) {
          // Play tone with its original period repeated for proportional duration (works for presets and custom tones)
          const startTime = Date.now();
          playTone(audio.frequency!, 0.1); // Play immediately
          
          const playInterval = setInterval(() => {
            if (Date.now() - startTime >= duration) {
              clearInterval(playInterval);
            } else {
              playTone(audio.frequency!, 0.1);
            }
          }, audio.period * 1000);
          presetRepeatIntervalsRef.current.set(`interval-${trigger.id}`, playInterval);
        } else if (audio.url) {
          // Play uploaded file with looping during distance sequence
          if (audioRef.current) {
            audioRef.current.src = audio.url;
            audioRef.current.loop = true; // Loop if audio ends before segment duration
            audioRef.current.currentTime = 0;
            audioRef.current.play();
          }
        }
      } else {
        // No audio assigned to this range, clear active sound state
        setActiveSound(null);
      }

      currentIndex++;
      const rangeSize = trigger.maxDistance - trigger.minDistance;
      const durationSeconds = rangeSize * 2; // 2 seconds per meter
      sequenceIntervalRef.current = setTimeout(playNextTrigger, (durationSeconds + 0.5) * 1000); // Add 0.5s gap
    };

    playNextTrigger();
  };

  const getAudioForDistance = (distanceMeters: number): AudioFile | null => {
    const trigger = distanceTriggers.find(
      (t) => distanceMeters >= t.minDistance && distanceMeters <= t.maxDistance
    );
    
    if (!trigger || !trigger.audioId) return null;
    
    const allAudios = [...PRESET_BUZZER_SOUNDS, ...uploadedAudios, ...savedCustomTones];
    return allAudios.find((audio) => audio.id === trigger.audioId) || null;
  };

  const handlePlayCustomTone = () => {
    const freq = typeof customFrequency === 'string' ? parseInt(customFrequency) : customFrequency;
    
    if (!isNaN(freq)) {
      stopAllAudio();
      playTone(freq, 0.1); // 100ms tone burst
      setActiveSound("custom");
    }
  };

  const handlePlayRepeatingTone = () => {
    if (isPlayingRepeat) {
      // Stop the repeating tone
      if (repeatIntervalRef.current) {
        clearInterval(repeatIntervalRef.current);
        repeatIntervalRef.current = null;
      }
      setIsPlayingRepeat(false);
      setActiveSound(null);
    } else {
      // Start repeating tone
      const freq = typeof customFrequency === 'string' ? parseInt(customFrequency) : customFrequency;
      const period = typeof customPeriod === 'string' ? parseFloat(customPeriod) : customPeriod;
      
      if (!isNaN(freq) && !isNaN(period)) {
        stopAllAudio();
        setIsPlayingRepeat(true);
        setActiveSound("custom");
        
        // Play immediately
        playTone(freq, 0.1);
        
        // Then set up repeating interval
        const intervalId = setInterval(() => {
          playTone(freq, 0.1);
        }, period * 1000);
        
        repeatIntervalRef.current = intervalId;
      }
    }
  };

  const handleSaveCustomTone = () => {
    const freq = typeof customFrequency === 'string' ? parseInt(customFrequency) : customFrequency;
    const period = typeof customPeriod === 'string' ? parseFloat(customPeriod) : customPeriod;
    
    if (isNaN(freq) || isNaN(period)) {
      alert("Please enter valid frequency and period values");
      return;
    }

    const selectedVoiceObj = ELEVENLABS_VOICES.find((v) => v.id === selectedVoice);
    const newCustomTone: AudioFile = {
      id: `custom-${Date.now()}`,
      name: `Custom ${freq}Hz, ${period.toFixed(1)}s`,
      frequency: freq,
      period: period,
      isPreset: false,
      voiceId: selectedVoice,
      voiceName: selectedVoiceObj?.name,
    };

    setSavedCustomTones((prev) => [...prev, newCustomTone]);
    alert(`Saved: ${newCustomTone.name}`);
  };

  const handleDeleteCustomTone = (id: string) => {
    setSavedCustomTones((prev) => prev.filter((tone) => tone.id !== id));
  };

  const generateTTS = async (text: string) => {
    if (!text.trim()) {
      alert("Please enter text to generate speech");
      return;
    }

    setIsGenerating(true);

    try {
      const response = await fetch("/api/elevenlabs/tts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: text,
          voiceId: selectedVoice,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to generate speech (${response.status})`);
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);

      const selectedVoiceObj = ELEVENLABS_VOICES.find((v) => v.id === selectedVoice);
      const newAudio: AudioFile = {
        id: `tts-${Date.now()}-${Math.random()}`,
        name: `Voice: "${text.substring(0, 30)}${text.length > 30 ? "..." : ""}"`,
        url: audioUrl,
        isPreset: false,
        voiceId: selectedVoice,
        voiceName: selectedVoiceObj?.name,
      };

      setUploadedAudios((prev) => [...prev, newAudio]);
      setTtsText("");
      alert("Speech generated and added to Custom Audio Files!");
    } catch (error) {
      console.error("TTS generation failed:", error);
      alert(`Failed to generate speech: ${(error as Error).message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const generateAlarm = () => {
    const freq = typeof alarmFrequency === 'string' ? parseInt(alarmFrequency) : alarmFrequency;
    const duration = typeof alarmDuration === 'string' ? parseFloat(alarmDuration) : alarmDuration;

    if (isNaN(freq) || isNaN(duration) || duration <= 0) {
      alert("Please enter valid frequency and duration");
      return;
    }

    setIsGenerating(true);

    // Create alarm sound using Web Audio API
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const durationSeconds = Math.min(duration, 10); // Max 10 seconds
    const sampleRate = audioContext.sampleRate;
    const numSamples = durationSeconds * sampleRate;
    const audioBuffer = audioContext.createBuffer(1, numSamples, sampleRate);
    const data = audioBuffer.getChannelData(0);

    let t = 0;
    if (alarmPattern === "steady") {
      for (let i = 0; i < numSamples; i++) {
        data[i] = Math.sin((2 * Math.PI * freq * t) / sampleRate) * 0.3;
        t++;
      }
    } else if (alarmPattern === "pulse") {
      for (let i = 0; i < numSamples; i++) {
        const beatFreq = 3; // 3 Hz pulse
        const envelope = Math.sin((Math.PI * beatFreq * t) / sampleRate) > 0 ? 0.3 : 0;
        data[i] = Math.sin((2 * Math.PI * freq * t) / sampleRate) * envelope;
        t++;
      }
    } else if (alarmPattern === "siren") {
      for (let i = 0; i < numSamples; i++) {
        const freqVariation = freq + (200 * Math.sin((2 * Math.PI * 2 * t) / sampleRate));
        data[i] = Math.sin((2 * Math.PI * freqVariation * t) / sampleRate) * 0.3;
        t++;
      }
    }

    // Convert to WAV and create blob
    const wav = audioBufferToWav(audioBuffer);
    const blob = new Blob([wav], { type: "audio/wav" });
    const url = URL.createObjectURL(blob);

    const newAudio: AudioFile = {
      id: `alarm-${Date.now()}-${Math.random()}`,
      name: `Alarm: ${freq}Hz ${alarmPattern}`,
      url: url,
      isPreset: false,
    };

    setUploadedAudios((prev) => [...prev, newAudio]);
    setIsGenerating(false);
    alert("Alarm generated and added to Custom Audio Files!");
  };

  const generateSFX = () => {
    setIsGenerating(true);

    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const sampleRate = audioContext.sampleRate;
    const duration = 0.5; // 500ms per sound effect
    const numSamples = duration * sampleRate;
    const audioBuffer = audioContext.createBuffer(1, numSamples, sampleRate);
    const data = audioBuffer.getChannelData(0);

    let t = 0;
    if (sfxType === "success") {
      // Rising tone: 400Hz -> 800Hz
      for (let i = 0; i < numSamples; i++) {
        const freq = 400 + (400 * i / numSamples);
        const envelope = 1 - (i / numSamples); // Fade out
        data[i] = Math.sin((2 * Math.PI * freq * t) / sampleRate) * envelope * 0.3;
        t++;
      }
    } else if (sfxType === "error") {
      // Falling tone: 800Hz -> 400Hz
      for (let i = 0; i < numSamples; i++) {
        const freq = 800 - (400 * i / numSamples);
        const envelope = 1 - (i / numSamples);
        data[i] = Math.sin((2 * Math.PI * freq * t) / sampleRate) * envelope * 0.3;
        t++;
      }
    } else if (sfxType === "warning") {
      // Alternating tones: 600Hz and 700Hz
      for (let i = 0; i < numSamples; i++) {
        const freq = (i / numSamples) * 2 % 1 > 0.5 ? 600 : 700;
        const envelope = 1 - (i / numSamples);
        data[i] = Math.sin((2 * Math.PI * freq * t) / sampleRate) * envelope * 0.3;
        t++;
      }
    } else if (sfxType === "beep") {
      // Simple beep: 500Hz
      for (let i = 0; i < numSamples; i++) {
        const envelope = 1 - (i / numSamples);
        data[i] = Math.sin((2 * Math.PI * 500 * t) / sampleRate) * envelope * 0.3;
        t++;
      }
    }

    const wav = audioBufferToWav(audioBuffer);
    const blob = new Blob([wav], { type: "audio/wav" });
    const url = URL.createObjectURL(blob);

    const newAudio: AudioFile = {
      id: `sfx-${Date.now()}-${Math.random()}`,
      name: `SFX: ${sfxType}`,
      url: url,
      isPreset: false,
    };

    setUploadedAudios((prev) => [...prev, newAudio]);
    setIsGenerating(false);
    alert("Sound effect generated and added to Custom Audio Files!");
  };

  // Helper function to convert AudioBuffer to WAV
  const audioBufferToWav = (audioBuffer: AudioBuffer): ArrayBuffer => {
    const numChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;
    const bytesPerSample = bitDepth / 8;

    const channelData = Array.from({ length: numChannels }, (_, i) =>
      audioBuffer.getChannelData(i)
    );

    const frameLength = audioBuffer.length;
    const dataLength = frameLength * numChannels * bytesPerSample;
    const bufferLength = 44 + dataLength;
    const buffer = new ArrayBuffer(bufferLength);
    const view = new DataView(buffer);

    // WAV header
    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    writeString(0, "RIFF");
    view.setUint32(4, bufferLength - 8, true);
    writeString(8, "WAVE");
    writeString(12, "fmt ");
    view.setUint32(16, 16, true); // Subchunk1Size
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
    view.setUint16(32, numChannels * bytesPerSample, true);
    view.setUint16(34, bitDepth, true);
    writeString(36, "data");
    view.setUint32(40, dataLength, true);

    // Write samples
    let offset = 44;
    for (let i = 0; i < frameLength; i++) {
      for (let j = 0; j < numChannels; j++) {
        const sample = Math.max(-1, Math.min(1, channelData[j][i]));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
        offset += 2;
      }
    }

    return buffer;
  };

  const handleLogout = () => {
    router.push("/");
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const url = event.target?.result as string;
        const newAudio: AudioFile = {
          id: `upload-${Date.now()}-${Math.random()}`,
          name: file.name,
          url,
          isPreset: false,
        };
        setUploadedAudios((prev) => [...prev, newAudio]);
      };
      reader.readAsDataURL(file);
    });

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const playSound = (audio: AudioFile) => {
    // If this sound is already playing, stop it
    if (activeSound === audio.id) {
      if (audio.frequency && audio.period && presetRepeatIntervalsRef.current.has(audio.id)) {
        const intervalId = presetRepeatIntervalsRef.current.get(audio.id);
        if (intervalId) {
          clearInterval(intervalId);
        }
        presetRepeatIntervalsRef.current.delete(audio.id);
      } else if (audio.url && audioRef.current) {
        // Stop uploaded audio file
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      setActiveSound(null);
      return;
    }

    // Stop all other audio before playing new sound
    stopAllAudio();
    
    setActiveSound(audio.id);
    
    if (audio.frequency && audio.period) {
      // Play tone with repetition (works for both presets and saved custom tones)
      playTone(audio.frequency, 0.1); // 100ms tone burst
      
      // Set up repeating interval
      const intervalId = setInterval(() => {
        playTone(audio.frequency!, 0.1);
      }, audio.period * 1000);
      
      presetRepeatIntervalsRef.current.set(audio.id, intervalId);
    } else if (audio.url) {
      // Play uploaded file
      if (audioRef.current) {
        audioRef.current.src = audio.url;
        audioRef.current.currentTime = 0;
        // Try to play and handle any errors
        const playPromise = audioRef.current.play();
        if (playPromise) {
          playPromise.catch((error) => {
            console.error("Failed to play audio:", error);
          });
        }
      }
    }
  };

  const deleteUploadedAudio = (id: string) => {
    setUploadedAudios((prev) => prev.filter((audio) => audio.id !== id));
  };

  const allAudios = [...PRESET_BUZZER_SOUNDS, ...uploadedAudios, ...savedCustomTones];

  return (
    <div className="min-h-screen flex flex-col px-4 py-8 bg-[#FFF8D4]">
      <audio ref={audioRef} onEnded={() => setActiveSound(null)} />

      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div className="text-center flex-1">
          <h1 className="text-[#313647] text-4xl font-bold">Audio Control Panel</h1>
          <p className="text-[#A3B087] mt-2">Radar Navigation System</p>
        </div>
        <Button
          onClick={handleLogout}
          size="lg"
          variant="outline"
          className="bg-[#435663] text-white hover:bg-[#435663]/90 hover:text-white"
        >
          <LogOut className="mr-2 size-4" />
          Logout
        </Button>
      </div>

      <div className="max-w-6xl mx-auto w-full space-y-8">
        {/* Upload and Preset Sounds - Side by Side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Upload Section */}
          <div className="bg-[#A3B087]/15 border-2 border-dashed border-[#A3B087] rounded-xl p-8 flex items-center justify-center">
            <div className="space-y-4 text-center">
              <h2 className="text-2xl font-semibold text-[#313647] flex items-center justify-center gap-2">
                <Upload className="size-6" />
                Upload Custom Audio
              </h2>
              <p className="text-[#A3B087]">
                Upload your own audio files to use as buzzer sounds
              </p>
              <div className="flex justify-center gap-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="audio/*"
                  multiple
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  size="lg"
                  className="bg-[#435663] text-white hover:bg-[#435663]/90"
                >
                  <Upload className="mr-2 size-4" />
                  Choose Audio Files
                </Button>
              </div>
            </div>
          </div>

          {/* Preset Buzzer Sounds */}
          <div className="bg-white border border-[#A3B087]/30 rounded-xl p-8">
            <h2 className="text-2xl font-semibold text-[#313647] mb-6 flex items-center gap-2">
              <Volume2 className="size-6" />
              Preset Buzzer Sounds
            </h2>
            <div className="grid grid-cols-2 gap-3">
              {PRESET_BUZZER_SOUNDS.map((audio) => (
                <Button
                  key={audio.id}
                  onClick={() => playSound(audio)}
                  className={`h-24 flex flex-col items-center justify-center transition-colors overflow-hidden ${
                    activeSound === audio.id
                      ? 'bg-[#435663] text-white border-[#435663]'
                      : 'bg-[#A3B087]/10 hover:bg-[#A3B087]/20 text-[#313647] border border-[#A3B087]/30'
                  } rounded-lg`}
                >
                  {activeSound === audio.id ? (
                    <Pause className="size-5 mb-1" />
                  ) : (
                    <Play className="size-5 mb-1" />
                  )}
                  <span className="text-xs font-medium text-center leading-tight line-clamp-2">{audio.name}</span>
                  <span className="text-xs mt-1 opacity-75">
                    {audio.period && `${audio.period}s`}
                  </span>
                  {activeSound === audio.id && (
                    <span className="text-xs mt-1 font-semibold">● Playing</span>
                  )}
                </Button>
              ))}
            </div>
          </div>
        </div>

        {/* Uploaded Audio Files */}
        {uploadedAudios.length > 0 && (
          <div className="bg-white border border-[#A3B087]/30 rounded-xl p-8">
            <h2 className="text-2xl font-semibold text-[#313647] mb-6">
              Custom Audio Files
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {uploadedAudios.map((audio) => (
                <div
                  key={audio.id}
                  className="flex items-center justify-between bg-[#FFF8D4] p-4 rounded-lg border border-[#A3B087]/20"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-[#313647] truncate">{audio.name}</p>
                    {audio.voiceName && (
                      <p className="text-sm text-[#A3B087]">{audio.voiceName}</p>
                    )}
                  </div>
                  <div className="flex gap-2 ml-4">
                    <Button
                      onClick={() => playSound(audio)}
                      disabled={activeSound !== null && activeSound !== audio.id}
                      size="sm"
                      variant="outline"
                      className="bg-[#435663] text-white hover:bg-[#435663]/90"
                    >
                      {activeSound === audio.id ? (
                        <Pause className="size-4" />
                      ) : (
                        <Play className="size-4" />
                      )}
                    </Button>
                    <Button
                      onClick={() => deleteUploadedAudio(audio.id)}
                      size="sm"
                      variant="destructive"
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Saved Custom Tones */}
        {savedCustomTones.length > 0 && (
          <div className="bg-white border border-[#A3B087]/30 rounded-xl p-8">
            <h2 className="text-2xl font-semibold text-[#313647] mb-6">
              Saved Custom Tones
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {savedCustomTones.map((audio) => (
                <div
                  key={audio.id}
                  className="flex items-center justify-between bg-[#FFF8D4] p-4 rounded-lg border border-[#A3B087]/20"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-[#313647] truncate">{audio.name}</p>
                    {audio.voiceName && (
                      <p className="text-sm text-[#A3B087]">{audio.voiceName}</p>
                    )}
                  </div>
                  <div className="flex gap-2 ml-4">
                    <Button
                      onClick={() => playSound(audio)}
                      disabled={activeSound !== null && activeSound !== audio.id}
                      size="sm"
                      variant="outline"
                      className="bg-[#435663] text-white hover:bg-[#435663]/90"
                    >
                      {activeSound === audio.id ? (
                        <Pause className="size-4" />
                      ) : (
                        <Play className="size-4" />
                      )}
                    </Button>
                    <Button
                      onClick={() => handleDeleteCustomTone(audio.id)}
                      size="sm"
                      variant="destructive"
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Custom Frequency Generator */}
        <div className="bg-white border border-[#A3B087]/30 rounded-xl p-8">
          <h2 className="text-2xl font-semibold text-[#313647] mb-6 flex items-center gap-2">
            <Volume2 className="size-6" />
            Custom Tone Generator
          </h2>
          <div className="space-y-6">
            {/* Frequency Slider */}
            <div className="space-y-3">
              <div className="flex justify-between items-center gap-4">
                <label className="text-lg font-medium text-[#313647]">
                  Frequency: <span className="text-[#A3B087]">{customFrequency} Hz</span>
                </label>
                <input
                  type="number"
                  min="20"
                  max="2000"
                  value={customFrequency}
                  onChange={(e) => setCustomFrequency(e.target.value)}
                  onBlur={(e) => {
                    const val = parseInt(e.target.value);
                    if (isNaN(val)) {
                      setCustomFrequency(500);
                    } else if (val < 20) {
                      setCustomFrequency(20);
                    } else if (val > 2000) {
                      setCustomFrequency(2000);
                    }
                  }}
                  className="w-24 px-3 py-2 border border-[#A3B087]/30 rounded-lg text-[#313647] font-medium"
                />
              </div>
              <input
                type="range"
                min="20"
                max="2000"
                value={typeof customFrequency === 'string' ? parseInt(customFrequency) || 500 : customFrequency}
                onChange={(e) => setCustomFrequency(parseInt(e.target.value))}
                className="w-full h-2 bg-[#A3B087]/30 rounded-lg appearance-none cursor-pointer accent-[#435663]"
              />
              <div className="flex justify-between text-sm text-[#A3B087]">
                <span>20 Hz</span>
                <span>2000 Hz</span>
              </div>
            </div>

            {/* Period Slider */}
            <div className="space-y-3">
              <div className="flex justify-between items-center gap-4">
                <label className="text-lg font-medium text-[#313647]">
                  Repeat Period: <span className="text-[#A3B087]">{typeof customPeriod === 'string' ? customPeriod : customPeriod.toFixed(2)} seconds</span>
                </label>
                <input
                  type="number"
                  min="0.1"
                  max="5"
                  step="0.1"
                  value={customPeriod}
                  onChange={(e) => setCustomPeriod(e.target.value)}
                  onBlur={(e) => {
                    const val = parseFloat(e.target.value);
                    if (isNaN(val)) {
                      setCustomPeriod(0.5);
                    } else if (val < 0.1) {
                      setCustomPeriod(0.1);
                    } else if (val > 5) {
                      setCustomPeriod(5);
                    }
                  }}
                  className="w-24 px-3 py-2 border border-[#A3B087]/30 rounded-lg text-[#313647] font-medium"
                />
              </div>
              <input
                type="range"
                min="0.1"
                max="5"
                step="0.1"
                value={typeof customPeriod === 'string' ? parseFloat(customPeriod) || 0.5 : customPeriod}
                onChange={(e) => setCustomPeriod(parseFloat(e.target.value))}
                className="w-full h-2 bg-[#A3B087]/30 rounded-lg appearance-none cursor-pointer accent-[#435663]"
              />
              <div className="flex justify-between text-sm text-[#A3B087]">
                <span>0.1s</span>
                <span>5s</span>
              </div>
            </div>

            {/* Play Buttons */}
            <div className="flex flex-col gap-3">
              <div className="flex gap-3">
                <Button
                  onClick={handlePlayCustomTone}
                  size="lg"
                  className="flex-1 bg-[#435663] text-white hover:bg-[#435663]/90"
                >
                  <Play className="mr-2 size-5" />
                  Play Once
                </Button>
                <Button
                  onClick={handlePlayRepeatingTone}
                  size="lg"
                  className={`flex-1 ${isPlayingRepeat ? 'bg-red-600 hover:bg-red-700' : 'bg-[#435663] hover:bg-[#435663]/90'} text-white`}
                >
                  {isPlayingRepeat ? (
                    <Pause className="mr-2 size-5" />
                  ) : (
                    <Play className="mr-2 size-5" />
                  )}
                  {isPlayingRepeat ? 'Stop Repeat' : 'Play Repeat'}
                </Button>
              </div>
              <Button
                onClick={handleSaveCustomTone}
                size="lg"
                className="bg-green-600 text-white hover:bg-green-700"
              >
                Save Custom Tone
              </Button>
            </div>
          </div>
        </div>

        {/* ElevenLabs Text-to-Speech Generator */}
        <div className="bg-white border border-[#A3B087]/30 rounded-xl p-8">
          <h2 className="text-2xl font-semibold text-[#313647] mb-6 flex items-center gap-2">
            <Volume2 className="size-6" />
            AI Sound Generator
          </h2>

          {/* Sound Type Tabs */}
          <div className="flex gap-2 mb-6 border-b border-[#A3B087]/20">
            {(
              [
                { type: "tts" as const, label: "Text-to-Speech" },
                { type: "alarm" as const, label: "Alarms" },
                { type: "sfx" as const, label: "Sound Effects" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.type}
                onClick={() => setSoundGenerationType(tab.type)}
                className={`px-4 py-2 font-medium transition-colors ${
                  soundGenerationType === tab.type
                    ? "text-[#435663] border-b-2 border-[#435663]"
                    : "text-[#A3B087] hover:text-[#313647]"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="space-y-6">
            {/* Text-to-Speech Section */}
            {soundGenerationType === "tts" && (
              <>
                {/* Voice Selection */}
                <div className="space-y-3">
                  <label className="text-lg font-medium text-[#313647]">
                    Select Voice
                  </label>
                  <select
                    value={selectedVoice}
                    onChange={(e) => setSelectedVoice(e.target.value)}
                    className="w-full px-4 py-2 border border-[#A3B087]/30 rounded-lg text-[#313647] bg-white focus:outline-none focus:border-[#435663]"
                  >
                    {ELEVENLABS_VOICES.map((voice) => (
                      <option key={voice.id} value={voice.id}>
                        {voice.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Text Input */}
                <div className="space-y-3">
                  <label className="text-lg font-medium text-[#313647]">
                    Text to Convert to Speech
                  </label>
                  <textarea
                    value={ttsText}
                    onChange={(e) => setTtsText(e.target.value)}
                    placeholder="Enter text you want converted to speech..."
                    className="w-full px-4 py-3 border border-[#A3B087]/30 rounded-lg text-[#313647] bg-white focus:outline-none focus:border-[#435663] min-h-24"
                  />
                  <p className="text-sm text-[#A3B087]">
                    {ttsText.length} characters
                  </p>
                </div>

                {/* Generate Button */}
                <Button
                  onClick={() => generateTTS(ttsText)}
                  disabled={isGenerating || !ttsText.trim()}
                  size="lg"
                  className="w-full bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-400"
                >
                  {isGenerating ? "Generating..." : "Generate Speech"}
                </Button>
              </>
            )}

            {/* Alarms Section */}
            {soundGenerationType === "alarm" && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <label className="text-lg font-medium text-[#313647]">
                      Frequency (Hz)
                    </label>
                    <input
                      type="number"
                      min="200"
                      max="2000"
                      value={alarmFrequency}
                      onChange={(e) => setAlarmFrequency(e.target.value)}
                      className="w-full px-4 py-2 border border-[#A3B087]/30 rounded-lg text-[#313647] bg-white"
                    />
                  </div>
                  <div className="space-y-3">
                    <label className="text-lg font-medium text-[#313647]">
                      Duration (seconds)
                    </label>
                    <input
                      type="number"
                      min="0.5"
                      max="10"
                      step="0.5"
                      value={alarmDuration}
                      onChange={(e) => setAlarmDuration(e.target.value)}
                      className="w-full px-4 py-2 border border-[#A3B087]/30 rounded-lg text-[#313647] bg-white"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-lg font-medium text-[#313647]">
                    Alarm Pattern
                  </label>
                  <div className="grid grid-cols-3 gap-3">
                    {(
                      [
                        { value: "steady" as const, label: "Steady" },
                        { value: "pulse" as const, label: "Pulse" },
                        { value: "siren" as const, label: "Siren" },
                      ] as const
                    ).map((pattern) => (
                      <button
                        key={pattern.value}
                        onClick={() => setAlarmPattern(pattern.value)}
                        className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                          alarmPattern === pattern.value
                            ? "bg-[#435663] text-white"
                            : "bg-[#A3B087]/10 text-[#313647] hover:bg-[#A3B087]/20"
                        }`}
                      >
                        {pattern.label}
                      </button>
                    ))}
                  </div>
                </div>

                <Button
                  onClick={generateAlarm}
                  disabled={isGenerating}
                  size="lg"
                  className="w-full bg-orange-600 text-white hover:bg-orange-700 disabled:bg-gray-400"
                >
                  {isGenerating ? "Generating..." : "Generate Alarm"}
                </Button>
              </>
            )}

            {/* Sound Effects Section */}
            {soundGenerationType === "sfx" && (
              <>
                <div className="space-y-3">
                  <label className="text-lg font-medium text-[#313647]">
                    Sound Effect Type
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    {(
                      [
                        { value: "beep" as const, label: "Beep" },
                        { value: "success" as const, label: "Success" },
                        { value: "warning" as const, label: "Warning" },
                        { value: "error" as const, label: "Error" },
                      ] as const
                    ).map((sfx) => (
                      <button
                        key={sfx.value}
                        onClick={() => setSfxType(sfx.value)}
                        className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                          sfxType === sfx.value
                            ? "bg-[#435663] text-white"
                            : "bg-[#A3B087]/10 text-[#313647] hover:bg-[#A3B087]/20"
                        }`}
                      >
                        {sfx.label}
                      </button>
                    ))}
                  </div>
                </div>

                <p className="text-sm text-[#A3B087]">
                  💡 Generates a 500ms sound effect based on type
                </p>

                <Button
                  onClick={generateSFX}
                  disabled={isGenerating}
                  size="lg"
                  className="w-full bg-green-600 text-white hover:bg-green-700 disabled:bg-gray-400"
                >
                  {isGenerating ? "Generating..." : "Generate Sound Effect"}
                </Button>
              </>
            )}

            {/* Music Section */}

          </div>
        </div>
        {/* Distance Range Audio Assignment */}
        <div className="bg-white border border-[#A3B087]/30 rounded-xl p-8">
          <h2 className="text-2xl font-semibold text-[#313647] mb-6 flex items-center gap-2">
            <Volume2 className="size-6" />
            Distance-Based Audio Triggers
          </h2>
          <p className="text-[#A3B087] mb-6">
            Assign audio files to play when objects are detected within distance ranges (0m - 4m)
          </p>
          
          {/* Visual Range Display */}
          <div className="mb-8 p-4 bg-[#FFF8D4] rounded-lg border border-[#A3B087]/20">
            <div className="flex items-center justify-between mb-4 px-2">
              <span className="text-sm font-medium text-[#313647]">0m</span>
              <span className="text-sm font-medium text-[#313647]">4m</span>
            </div>
            <div className="relative h-12 bg-white rounded border border-[#A3B087]/30 overflow-hidden mb-4">
              {/* Background showing all distance ranges */}
              <div className="absolute inset-0">
                {distanceTriggers.map((trigger) => {
                  const totalRange = 4 - 0;
                  const startPercent = ((trigger.minDistance - 0) / totalRange) * 100;
                  const widthPercent = ((trigger.maxDistance - trigger.minDistance) / totalRange) * 100;
                  return (
                    <div
                      key={`bg-${trigger.id}`}
                      style={{ 
                        left: `${startPercent}%`,
                        width: `${widthPercent}%`
                      }}
                      className="absolute top-0 bottom-0 bg-gradient-to-r from-gray-800 to-gray-300 border-r border-gray-600 flex items-center justify-center text-xs font-medium text-white"
                      title={`${trigger.minDistance}m - ${trigger.maxDistance}m: ${trigger.audioName || 'No audio assigned'}`}
                    >
                      {trigger.audioName && (
                        <span className="truncate whitespace-nowrap px-1">{trigger.audioName}</span>
                      )}
                    </div>
                  );
                })}
              </div>
              
              {/* Vertical line indicator */}
              {isPlayingSequence && (() => {
                // Calculate current position based on elapsed time
                if (!sequenceStartTimeRef.current || !totalSequenceDurationRef.current) return null;
                
                const elapsed = Date.now() - sequenceStartTimeRef.current;
                let cumulativeTime = 0;
                let currentPosition = 0; // Start position
                
                for (let i = 0; i < distanceTriggers.length; i++) {
                  const trigger = distanceTriggers[i];
                  const rangeSize = trigger.maxDistance - trigger.minDistance;
                  const durationSeconds = rangeSize * 2;
                  const triggerDuration = (durationSeconds + 0.5) * 1000; // milliseconds
                  
                  if (elapsed < cumulativeTime + triggerDuration) {
                    // We're in this trigger
                    const timeIntoTrigger = elapsed - cumulativeTime;
                    const audioPlayDuration = durationSeconds * 1000;
                    const proportionThroughTrigger = Math.min(timeIntoTrigger / audioPlayDuration, 1);
                    currentPosition = trigger.minDistance + (proportionThroughTrigger * rangeSize);
                    break;
                  }
                  
                  cumulativeTime += triggerDuration;
                }
                
                const totalRange = 4 - 0;
                const linePercent = ((currentPosition - 0) / totalRange) * 100;
                
                return (
                  <div
                    className="absolute top-0 bottom-0 w-1 bg-[#435663] shadow-lg"
                    style={{ left: `${linePercent}%`, transform: "translateX(-50%)" }}
                  />
                );
              })()}
            </div>
            
            <div className="flex justify-center mt-4">
              <Button
                onClick={playDistanceSequence}
                size="sm"
                className={`${
                  isPlayingSequence
                    ? "bg-red-600 text-white hover:bg-red-700"
                    : "bg-[#435663] text-white hover:bg-[#435663]/90"
                }`}
              >
                {isPlayingSequence ? (
                  <Pause className="mr-2 size-4" />
                ) : (
                  <Play className="mr-2 size-4" />
                )}
                {isPlayingSequence ? "Stop Sequence" : "Play Sequence"}
              </Button>
            </div>
          </div>

          {/* Create Custom Range */}
          <div className="mb-8 bg-[#A3B087]/10 border border-dashed border-[#A3B087] rounded-lg p-6">
            <h3 className="text-lg font-semibold text-[#313647] mb-4">Create Custom Range</h3>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-[#313647]">
                  Min Distance (m)
                </label>
                <input
                  type="number"
                  min="0"
                  max="4"
                  step="0.1"
                  value={newRangeMin}
                  onChange={(e) => setNewRangeMin(e.target.value)}
                  placeholder="0"
                  className="w-full px-3 py-2 border border-[#A3B087]/30 rounded-lg text-[#313647] bg-white"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-[#313647]">
                  Max Distance (m)
                </label>
                <input
                  type="number"
                  min="0"
                  max="4"
                  step="0.1"
                  value={newRangeMax}
                  onChange={(e) => setNewRangeMax(e.target.value)}
                  placeholder="4"
                  className="w-full px-3 py-2 border border-[#A3B087]/30 rounded-lg text-[#313647] bg-white"
                />
              </div>
            </div>
            <Button
              onClick={addCustomRange}
              size="sm"
              className="bg-[#435663] text-white hover:bg-[#435663]/90"
            >
              Add Custom Range
            </Button>
            <p className="text-xs text-[#A3B087] mt-3 italic">
              Ranges cannot overlap. Valid range: 0m - 4m
            </p>
          </div>

          {/* Distance Trigger Configuration */}
          <div className="space-y-4">
            {distanceTriggers.map((trigger) => (
              <div key={trigger.id} className="bg-[#FFF8D4] p-4 rounded-lg border border-[#A3B087]/20 space-y-3">
                <div className="flex justify-between items-center">
                  <h3 className="font-semibold text-[#313647]">
                    {trigger.minDistance}m - {trigger.maxDistance}m
                    {!["zone1", "zone2", "zone3", "zone4"].includes(trigger.id) && (
                      <span className="text-xs text-[#A3B087] ml-2">(Custom)</span>
                    )}
                  </h3>
                  <div className="flex items-center gap-2">
                    {trigger.audioId && (
                      <span className="text-sm text-[#A3B087] font-medium truncate max-w-xs">
                        {trigger.audioName}
                      </span>
                    )}
                    <button
                      onClick={() => deleteCustomRange(trigger.id)}
                      className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium text-[#313647]">
                    Assign Audio:
                  </label>
                  <select
                    value={trigger.audioId || ""}
                    onChange={(e) => {
                      const audioId = e.target.value || null;
                      const audio = [...PRESET_BUZZER_SOUNDS, ...uploadedAudios].find(
                        (a) => a.id === audioId
                      );
                      updateDistanceTrigger(trigger.id, audioId, audio?.name);
                    }}
                    className="w-full px-3 py-2 border border-[#A3B087]/30 rounded-lg text-[#313647] bg-white focus:outline-none focus:ring-2 focus:ring-[#435663]/50"
                  >
                    <option value="">-- Select Audio --</option>
                    <optgroup label="Preset Sounds">
                      {PRESET_BUZZER_SOUNDS.map((audio) => (
                        <option key={audio.id} value={audio.id}>
                          {audio.name}
                        </option>
                      ))}
                    </optgroup>
                    {uploadedAudios.length > 0 && (
                      <optgroup label="Uploaded Files">
                        {uploadedAudios.map((audio) => (
                          <option key={audio.id} value={audio.id}>
                            {audio.name}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
