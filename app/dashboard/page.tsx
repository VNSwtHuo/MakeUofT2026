"use client";

import {
  LogOut,
  Upload,
  Volume2,
  Play,
  Pause,
  Wifi,
  WifiOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { esp32Service } from "../esp32-intergrate";

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
  sourceType?: "uploaded" | "saved-tone" | "ai-voice" | "ai-sfx";
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

export default function Dashboard() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const repeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const presetRepeatIntervalsRef = useRef<Map<string, NodeJS.Timeout>>(
    new Map(),
  );

  // Serial and RFID state
  const [userId, setUserId] = useState<string>("");
  const [serialConnected, setSerialConnected] = useState(false);
  const [serialStatus, setSerialStatus] = useState<string>("Disconnected");

  // Audio state
  const [uploadedAudios, setUploadedAudios] = useState<AudioFile[]>([]);
  const [savedCustomTones, setSavedCustomTones] = useState<AudioFile[]>([]);
  const [activeSound, setActiveSound] = useState<string | null>(null);
  const [customFrequency, setCustomFrequency] = useState<number | string>(500);
  const [customPeriod, setCustomPeriod] = useState<number | string>(0.5);
  const [soundGenerationType, setSoundGenerationType] = useState<"tts" | "sfx">(
    "tts",
  );
  const [ttsText, setTtsText] = useState<string>("");
  const [selectedVoice, setSelectedVoice] = useState<string>(
    "21m00Tcm4TlvDq8ikWAM",
  );
  const [sfxStyle, setSfxStyle] = useState<string>("sound effect");
  const [sfxCustomText, setSfxCustomText] = useState<string>("");
  const [sfxCustomPeriod, setSfxCustomPeriod] = useState<number | string>(0.5);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPlayingRepeat, setIsPlayingRepeat] = useState(false);
  const [distanceTriggers, setDistanceTriggers] = useState<DistanceTrigger[]>([
    { id: "zone1", minDistance: 0, maxDistance: 0.5, audioId: null },
    { id: "zone2", minDistance: 0.5, maxDistance: 1, audioId: null },
    { id: "zone3", minDistance: 1, maxDistance: 2, audioId: null },
  ]);
  const [newRangeMin, setNewRangeMin] = useState<number | string>(0.1);
  const [newRangeMax, setNewRangeMax] = useState<number | string>(0.5);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isPlayingSequence, setIsPlayingSequence] = useState(false);
  const [playingTrigger, setPlayingTrigger] = useState<string | null>(null);
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  const sequenceIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const playbackStartTimeRef = useRef<number>(0);
  const playbackDurationRef = useRef<number>(0);
  const sequenceStartTimeRef = useRef<number>(0);
  const totalSequenceDurationRef = useRef<number>(0);

  // Initialize serial connection on mount (if port was previously selected)
  useEffect(() => {
    // No auto-connect: user must click Connect ESP32 (Web Serial requires gesture)
    return () => {};
  }, []);

  // Handler to connect to ESP32 (must be called from user click)
  const handleConnectESP32 = async () => {
    setIsConnecting(true);
    try {
      const ok = await esp32Service.connect();
      if (ok) {
        esp32Service.onRFIDScan((uid: string) => {
          setUserId(uid);
          setSerialStatus(`Connected - User: ${uid}`);
        });
        esp32Service.onRadarData((angle: number, distance: number) => {
          // optional: handle radar stream updates
        });
        setSerialConnected(true);
        setSerialStatus("Connected - Ready to scan");
      } else {
        setSerialStatus("Failed to connect");
      }
    } catch (error) {
      console.error("Connection error:", error);
      setSerialStatus("Connection failed");
    } finally {
      setIsConnecting(false);
    }
  };

  // Check if all ranges have audio assigned
  const allRangesAssigned = distanceTriggers.every(
    (trigger) => trigger.audioId !== null,
  );

  // Update playback progress animation
  useEffect(() => {
    if (!isPlayingSequence) return;

    const updateProgress = () => {
      if (sequenceStartTimeRef.current && totalSequenceDurationRef.current) {
        const elapsed = Date.now() - sequenceStartTimeRef.current;
        const progress = Math.min(
          (elapsed / totalSequenceDurationRef.current) * 100,
          100,
        );
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

  // Listen for RFID scans from esp32Service (Web Serial client)
  useEffect(() => {
    const onRfid = async (uid: string) => {
      // UID comes in as hex bytes (e.g. "04 A3 2B ...") - use as-is
      setCurrentUserId(uid);
      try {
        const resp = await fetch(
          `/api/settings?userId=${encodeURIComponent(uid)}`,
        );
        if (resp.ok) {
          const data = await resp.json();
          if (data && Array.isArray(data.ranges)) {
            const mapped = data.ranges.map((r: any, idx: number) => ({
              id: r.id || `range-${idx}`,
              minDistance: Number(r.minDistance) || 0,
              maxDistance: Number(r.maxDistance) || 0,
              audioId: r.audiofile || null,
            }));
            setDistanceTriggers(mapped);
            alert(`Loaded settings for user ${uid}`);
          }
        } else {
          // No settings found
          setDistanceTriggers([]);
          alert(`No saved settings for user ${uid}`);
        }
      } catch (err) {
        console.error("Failed to load settings for UID", uid, err);
      }
    };

    esp32Service.onRFIDScan((uid: string) => onRfid(uid));
    return () => {
      esp32Service.onRFIDScan(() => {});
    };
  }, []);

  const updateDistanceTrigger = (
    triggerId: string,
    audioId: string | null,
    audioName?: string,
  ) => {
    setDistanceTriggers((prev) =>
      prev.map((trigger) =>
        trigger.id === triggerId ? { ...trigger, audioId, audioName } : trigger,
      ),
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
    const minVal =
      typeof newRangeMin === "string" ? parseFloat(newRangeMin) : newRangeMin;
    const maxVal =
      typeof newRangeMax === "string" ? parseFloat(newRangeMax) : newRangeMax;

    if (isNaN(minVal) || isNaN(maxVal)) {
      alert("Please enter valid numbers");
      return;
    }

    if (minVal < 0 || maxVal > 2.5) {
      alert("Range must be between 0m and 2.5m");
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
        (minVal <= trigger.minDistance && maxVal >= trigger.maxDistance),
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

    setDistanceTriggers((prev) =>
      [...prev, newTrigger].sort((a, b) => a.minDistance - b.minDistance),
    );
    setNewRangeMin(0.1);
    setNewRangeMax(0.5);
  };

  const deleteCustomRange = (triggerId: string) => {
    setDistanceTriggers((prev) =>
      prev.filter((trigger) => trigger.id !== triggerId),
    );
  };

  // Handle Save and Load with complete audio workflow
  const handleSaveAndLoad = async () => {
    if (!serialConnected) {
      alert("ESP32 not connected. Please connect your device via serial port.");
      return;
    }

    if (!userId) {
      alert("No user ID detected. Please scan a card with the ESP32.");
      return;
    }

    if (!allRangesAssigned) {
      alert("Please assign a sound track to all distance ranges.");
      return;
    }

    setIsSavingSettings(true);

    try {
      // Import workflow utilities
      const { saveSettingsToESP32, getUsedAudioFiles } =
        await import("@/lib/audioWorkflow");

      // Get all audio files that are assigned to ranges
      const allAudios = [
        ...PRESET_BUZZER_SOUNDS,
        ...uploadedAudios,
        ...savedCustomTones,
      ];

      // Convert to AudioFileInfo format
      const audioFilesInfo = allAudios.map((audio) => ({
        id: audio.id,
        name: audio.name,
        sourceType:
          audio.sourceType || (audio.isPreset ? "saved-tone" : "uploaded"),
        frequency: audio.frequency,
        period: audio.period,
        url: audio.url,
      }));

      // Get only the audio files that are used in ranges
      const usedAudioFiles = getUsedAudioFiles(
        distanceTriggers,
        audioFilesInfo as any,
      );

      if (usedAudioFiles.length === 0) {
        alert("No audio files to send. Please assign audio to ranges.");
        return;
      }

      // Show progress
      console.log(`Sending ${usedAudioFiles.length} audio files to ESP32...`);

      // Execute complete workflow
      await saveSettingsToESP32(
        userId,
        distanceTriggers.map((trigger) => ({
          id: trigger.id,
          minDistance: trigger.minDistance,
          maxDistance: trigger.maxDistance,
          audioId: trigger.audioId || "default",
          audioName: trigger.audioName,
        })),
        usedAudioFiles as any,
        (stage, progress) => {
          console.log(
            `[Progress] ${stage} ${progress ? `(${progress}%)` : ""}`,
          );
        },
      );

      // Also save to MongoDB for persistence
      const settingsData = {
        userId,
        ranges: distanceTriggers.map((trigger) => ({
          id: trigger.id,
          minDistance: trigger.minDistance,
          maxDistance: trigger.maxDistance,
          soundId: trigger.audioId || "default",
        })),
      };

      const response = await fetch("/api/settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(settingsData),
      });

      if (!response.ok) {
        console.warn(
          "Failed to save settings to server (but ESP32 was updated)",
        );
      }

      alert("Settings and audio files successfully loaded to ESP32!");
    } catch (error) {
      console.error("Save settings error:", error);
      alert(`Failed to save settings: ${(error as Error).message}`);
    } finally {
      setIsSavingSettings(false);
    }
  };

  // Load user settings from database
  const handleLoadSavedSettings = async () => {
    if (!userId) {
      alert("No user ID detected. Please scan a card first.");
      return;
    }

    try {
      const response = await fetch(`/api/settings?userId=${userId}`);
      if (!response.ok) {
        alert("No saved settings found for this user.");
        return;
      }

      const data = await response.json();
      if (data.ranges && data.ranges.length > 0) {
        setDistanceTriggers(
          data.ranges.map((range: any) => ({
            id: range.id,
            minDistance: range.minDistance,
            maxDistance: range.maxDistance,
            audioId: range.audiofile,
            audioName: range.audiofile,
          })),
        );
        alert("Settings loaded from saved configuration.");
      }
    } catch (error) {
      console.error("Load settings error:", error);
      alert("Failed to load settings.");
    }
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

    // Linear progression: 1.5 seconds per 0.5m (3 seconds per meter) from 0 to 2.5m = 7.5 seconds total
    const totalRange = 2.5;
    const totalDuration = totalRange * 3 * 1000; // milliseconds

    sequenceStartTimeRef.current = Date.now();
    totalSequenceDurationRef.current = totalDuration;
    setIsPlayingSequence(true);
    
    let lastTriggerId: string | null = null;

    const allAudios = [
      ...PRESET_BUZZER_SOUNDS,
      ...uploadedAudios,
      ...savedCustomTones,
    ];

    // Update function that checks position and plays appropriate audio
    const updatePosition = () => {
      const elapsed = Date.now() - sequenceStartTimeRef.current;
      
      if (elapsed >= totalDuration) {
        // Sequence complete
        if (sequenceIntervalRef.current) {
          clearInterval(sequenceIntervalRef.current);
          sequenceIntervalRef.current = null;
        }
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
        setActiveSound(null);
        setPlaybackProgress(0);
        return;
      }

      // Calculate current position (0 to 2.5m)
      const progress = elapsed / totalDuration;
      const currentPosition = progress * totalRange;

      // Find which trigger zone we're in
      const currentTrigger = distanceTriggers.find(
        (t) => currentPosition >= t.minDistance && currentPosition <= t.maxDistance
      );

      // If we've moved to a different trigger, update audio
      if (currentTrigger?.id !== lastTriggerId) {
        // Stop previous audio
        presetRepeatIntervalsRef.current.forEach((intervalId) => {
          clearInterval(intervalId);
        });
        presetRepeatIntervalsRef.current.clear();
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current.loop = false;
        }

        if (currentTrigger) {
          lastTriggerId = currentTrigger.id;
          setPlayingTrigger(currentTrigger.id);

          const audio = currentTrigger.audioId
            ? allAudios.find((item) => item.id === currentTrigger.audioId) || null
            : null;

          if (audio) {
            setActiveSound(audio.id);
            if (audio.frequency && audio.period) {
              playTone(audio.frequency, 0.1);
              const intervalKey = `interval-${currentTrigger.id}`;
              const playInterval = setInterval(() => {
                // Check if this interval is still active
                if (!presetRepeatIntervalsRef.current.has(intervalKey)) {
                  clearInterval(playInterval);
                  return;
                }
                playTone(audio.frequency!, 0.1);
              }, audio.period * 1000);
              presetRepeatIntervalsRef.current.set(intervalKey, playInterval);
            } else if (audio.url) {
              if (audioRef.current) {
                audioRef.current.src = audio.url;
                audioRef.current.loop = true;
                audioRef.current.currentTime = 0;
                audioRef.current.play();
              }
            }
          } else {
            setActiveSound(null);
          }
        } else {
          // Not in any trigger zone
          lastTriggerId = null;
          setPlayingTrigger(null);
          setActiveSound(null);
        }
      }
    };

    // Check position every 50ms for smooth updates
    updatePosition(); // Initial call
    sequenceIntervalRef.current = setInterval(updatePosition, 50);
  };

  const getAudioForDistance = (distanceMeters: number): AudioFile | null => {
    const trigger = distanceTriggers.find(
      (t) => distanceMeters >= t.minDistance && distanceMeters <= t.maxDistance,
    );

    if (!trigger || !trigger.audioId) return null;

    const allAudios = [
      ...PRESET_BUZZER_SOUNDS,
      ...uploadedAudios,
      ...savedCustomTones,
    ];
    return allAudios.find((audio) => audio.id === trigger.audioId) || null;
  };

  const handlePlayCustomTone = () => {
    const freq =
      typeof customFrequency === "string"
        ? parseInt(customFrequency)
        : customFrequency;

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
      const freq =
        typeof customFrequency === "string"
          ? parseInt(customFrequency)
          : customFrequency;
      const period =
        typeof customPeriod === "string"
          ? parseFloat(customPeriod)
          : customPeriod;

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
    const freq =
      typeof customFrequency === "string"
        ? parseInt(customFrequency)
        : customFrequency;
    const period =
      typeof customPeriod === "string"
        ? parseFloat(customPeriod)
        : customPeriod;

    if (isNaN(freq) || isNaN(period)) {
      alert("Please enter valid frequency and period values");
      return;
    }

    const newCustomTone: AudioFile = {
      id: `custom-${Date.now()}`,
      name: `Custom ${freq}Hz, ${period.toFixed(1)}s`,
      frequency: freq,
      period: period,
      isPreset: false,
      sourceType: "saved-tone",
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
        throw new Error(
          errorData.error || `Failed to generate speech (${response.status})`,
        );
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);

      const selectedVoiceObj = ELEVENLABS_VOICES.find(
        (v) => v.id === selectedVoice,
      );
      const newAudio: AudioFile = {
        id: `tts-${Date.now()}-${Math.random()}`,
        name: `Voice: "${text.substring(0, 30)}${text.length > 30 ? "..." : ""}"`,
        url: audioUrl,
        isPreset: false,
        voiceId: selectedVoice,
        voiceName: selectedVoiceObj?.name,
        sourceType: "ai-voice",
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

  const generateSFX = async () => {
    if (!sfxCustomText.trim()) {
      alert("Please enter text for the sound effect");
      return;
    }

    setIsGenerating(true);

    try {
      const periodValue =
        typeof sfxCustomPeriod === "string"
          ? parseFloat(sfxCustomPeriod)
          : sfxCustomPeriod;
      const durationMs = Math.round(
        Math.max(0.1, Math.min(5, periodValue)) * 1000,
      );

      const response = await fetch("/api/elevenlabs/music", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: sfxCustomText,
          style: sfxStyle,
          durationMs,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `API error: ${response.status}`);
      }

      const audioBlob = await response.blob();
      const url = URL.createObjectURL(audioBlob);

      const newAudio: AudioFile = {
        id: `sfx-${Date.now()}-${Math.random()}`,
        name: `SFX: ${sfxCustomText}`,
        url: url,
        isPreset: false,
        sourceType: "ai-sfx",
      };

      setUploadedAudios((prev) => [...prev, newAudio]);
      setSfxCustomText("");
      alert("Sound effect generated and added to Custom Audio Files!");
    } catch (error) {
      console.error("SFX generation error:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      alert(`Failed to generate sound effect: ${errorMessage}`);
    } finally {
      setIsGenerating(false);
    }
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
          sourceType: "uploaded",
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
      if (
        audio.frequency &&
        audio.period &&
        presetRepeatIntervalsRef.current.has(audio.id)
      ) {
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

  const allAudios = [
    ...PRESET_BUZZER_SOUNDS,
    ...uploadedAudios,
    ...savedCustomTones,
  ];

  return (
    <div className="min-h-screen flex flex-col px-4 py-8 bg-[#FFF8D4]">
      <audio ref={audioRef} onEnded={() => setActiveSound(null)} />

      {/* HEADER WITH SERIAL STATUS */}
      <div className="flex justify-between items-center mb-8 gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            {serialConnected ? (
              <Wifi className="size-5 text-green-600" />
            ) : (
              <WifiOff className="size-5 text-red-600" />
            )}
            <span
              className={`text-sm font-semibold ${serialConnected ? "text-green-600" : "text-red-600"}`}
            >
              {serialStatus}
            </span>
          </div>
          <h1 className="text-[#313647] text-4xl font-bold">
            Audio Control Panel
          </h1>
          {userId && (
            <p className="text-[#A3B087] text-sm mt-2">User ID: {userId}</p>
          )}
        </div>
        <div className="flex gap-3 flex-wrap">
          {!serialConnected && (
            <Button
              onClick={handleConnectESP32}
              disabled={isConnecting}
              size="lg"
              className="bg-[#435663] text-white hover:bg-[#435663]/90 whitespace-nowrap"
            >
              {isConnecting ? "Connecting..." : "Connect ESP32"}
            </Button>
          )}
          <Button
            onClick={handleLogout}
            size="lg"
            variant="outline"
            className="bg-[#435663] text-white hover:bg-[#435663]/90 hover:text-white whitespace-nowrap"
          >
            <LogOut className="mr-2 size-4" />
            Logout
          </Button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto w-full space-y-8">
        {/* UPLOAD AND PRESET SOUNDS */}
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
                      ? "bg-[#435663] text-white border-[#435663]"
                      : "bg-[#A3B087]/10 hover:bg-[#A3B087]/20 text-[#313647] border border-[#A3B087]/30"
                  } rounded-lg`}
                >
                  {activeSound === audio.id ? (
                    <Pause className="size-5 mb-1" />
                  ) : (
                    <Play className="size-5 mb-1" />
                  )}
                  <span className="text-xs font-medium text-center leading-tight line-clamp-2">
                    {audio.name}
                  </span>
                  <span className="text-xs mt-1 opacity-75">
                    {audio.period && `${audio.period}s`}
                  </span>
                  {activeSound === audio.id && (
                    <span className="text-xs mt-1 font-semibold">
                      ● Playing
                    </span>
                  )}
                </Button>
              ))}
            </div>
          </div>
        </div>

        {/* Custom Audio Files */}
        {(uploadedAudios.length > 0 || savedCustomTones.length > 0) && (
          <div className="bg-white border border-[#A3B087]/30 rounded-xl p-8">
            <h2 className="text-2xl font-semibold text-[#313647] mb-6">
              Custom Audio Files
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[...uploadedAudios, ...savedCustomTones].map((audio) => {
                const isSavedTone =
                  audio.sourceType === "saved-tone" ||
                  (!audio.url &&
                    Boolean(audio.frequency) &&
                    Boolean(audio.period));
                const sourceLabel =
                  audio.sourceType === "ai-sfx"
                    ? "AI SFX"
                    : audio.sourceType === "ai-voice"
                      ? "AI Voice"
                      : isSavedTone
                        ? "Saved Tone"
                        : "Uploaded";

                return (
                  <div
                    key={audio.id}
                    className="flex items-center justify-between bg-[#FFF8D4] p-4 rounded-lg border border-[#A3B087]/20"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-[#313647] truncate">
                        {audio.name}
                      </p>
                      <p className="text-xs text-[#A3B087]">{sourceLabel}</p>
                    </div>
                    <div className="flex gap-2 ml-4">
                      <Button
                        onClick={() => playSound(audio)}
                        disabled={
                          activeSound !== null && activeSound !== audio.id
                        }
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
                        onClick={() =>
                          isSavedTone
                            ? handleDeleteCustomTone(audio.id)
                            : deleteUploadedAudio(audio.id)
                        }
                        size="sm"
                        variant="destructive"
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                );
              })}
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
                  Frequency:{" "}
                  <span className="text-[#A3B087]">{customFrequency} Hz</span>
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
                value={
                  typeof customFrequency === "string"
                    ? parseInt(customFrequency) || 500
                    : customFrequency
                }
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
                  Repeat Period:{" "}
                  <span className="text-[#A3B087]">
                    {typeof customPeriod === "string"
                      ? customPeriod
                      : customPeriod.toFixed(2)}{" "}
                    seconds
                  </span>
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
                value={
                  typeof customPeriod === "string"
                    ? parseFloat(customPeriod) || 0.5
                    : customPeriod
                }
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
                  className={`flex-1 ${isPlayingRepeat ? "bg-red-600 hover:bg-red-700" : "bg-[#435663] hover:bg-[#435663]/90"} text-white`}
                >
                  {isPlayingRepeat ? (
                    <Pause className="mr-2 size-5" />
                  ) : (
                    <Play className="mr-2 size-5" />
                  )}
                  {isPlayingRepeat ? "Stop Repeat" : "Play Repeat"}
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
                <Button
                  onClick={async () => {
                    try {
                      const ok = await esp32Service.connect();
                      if (ok) alert("ESP32 connected (browser serial)");
                      else alert("ESP32 connection failed or canceled");
                    } catch (err) {
                      console.error(err);
                      alert("ESP32 connection error");
                    }
                  }}
                  size="lg"
                  className="ml-3 bg-[#2b7a78] text-white"
                >
                  Connect ESP32
                </Button>
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

            {/* Sound Effects Section */}
            {soundGenerationType === "sfx" && (
              <>
                <div className="space-y-4 bg-[#A3B087]/10 p-4 rounded-lg border border-[#A3B087]/30">
                  <div className="space-y-3">
                    <label className="text-lg font-medium text-[#313647]">
                      Custom Sound Effect
                    </label>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-[#313647]">
                        Style
                      </label>
                      <select
                        value={sfxStyle}
                        onChange={(e) => setSfxStyle(e.target.value)}
                        className="w-full px-3 py-2 border border-[#A3B087]/30 rounded-lg text-[#313647] bg-white focus:outline-none focus:border-[#435663]"
                      >
                        <option value="sound effect">Sound Effect</option>
                        <option value="impact">Impact</option>
                        <option value="whoosh">Whoosh</option>
                        <option value="mechanical">Mechanical</option>
                        <option value="ambient">Ambient</option>
                        <option value="organic">Organic</option>
                        <option value="sci-fi">Sci-Fi</option>
                      </select>
                    </div>
                    <textarea
                      value={sfxCustomText}
                      onChange={(e) => setSfxCustomText(e.target.value)}
                      placeholder="Enter a name or description for your custom sound effect..."
                      className="w-full px-4 py-3 border border-[#A3B087]/30 rounded-lg text-[#313647] bg-white focus:outline-none focus:border-[#435663] min-h-20"
                    />
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-[#313647]">
                        Duration (seconds)
                      </label>
                      <input
                        type="number"
                        min="0.1"
                        max="5"
                        step="0.1"
                        value={sfxCustomPeriod}
                        onChange={(e) => setSfxCustomPeriod(e.target.value)}
                        className="w-full px-3 py-2 border border-[#A3B087]/30 rounded-lg text-[#313647] bg-white focus:outline-none focus:border-[#435663]"
                      />
                    </div>
                    <p className="text-sm text-[#A3B087]">
                      💡 Creates a sound effect based on your text input (0.1s -
                      5s duration)
                    </p>
                  </div>
                </div>

                <Button
                  onClick={generateSFX}
                  disabled={isGenerating || !sfxCustomText.trim()}
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
            Assign audio files to play when objects are detected within distance
            ranges (0m - 2.5m)
          </p>

          {/* Visual Range Display */}
          <div className="mb-8 p-4 bg-[#FFF8D4] rounded-lg border border-[#A3B087]/20">
            <div className="flex items-center justify-between mb-4 px-2">
              <span className="text-sm font-medium text-[#313647]">0m</span>
              <span className="text-sm font-medium text-[#313647]">2.5m</span>
            </div>
            <div className="relative h-12 bg-white rounded border border-[#A3B087]/30 overflow-hidden mb-4">
              {/* Background showing all distance ranges */}
              <div className="absolute inset-0">
                {distanceTriggers.map((trigger) => {
                  const totalRange = 2.5 - 0;
                  const startPercent =
                    ((trigger.minDistance - 0) / totalRange) * 100;
                  const widthPercent =
                    ((trigger.maxDistance - trigger.minDistance) / totalRange) *
                    100;
                  return (
                    <div
                      key={`bg-${trigger.id}`}
                      style={{
                        left: `${startPercent}%`,
                        width: `${widthPercent}%`,
                      }}
                      className="absolute top-0 bottom-0 bg-gradient-to-r from-gray-800 to-gray-300 border-r border-gray-600 flex items-center justify-center text-xs font-medium text-white"
                      title={`${trigger.minDistance}m - ${trigger.maxDistance}m: ${trigger.audioName || "No audio assigned"}`}
                    >
                      {trigger.audioName && (
                        <span className="truncate whitespace-nowrap px-1">
                          {trigger.audioName}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Vertical line indicator */}
              {isPlayingSequence &&
                (() => {
                  // Calculate current position based on elapsed time - move smoothly from 0 to 2.5m
                  if (
                    !sequenceStartTimeRef.current ||
                    !totalSequenceDurationRef.current
                  )
                    return null;

                  const elapsed = Date.now() - sequenceStartTimeRef.current;
                  const totalRange = 2.5 - 0;
                  
                  // Linear progression from 0 to 2.5m over the total duration
                  const progress = Math.min(elapsed / totalSequenceDurationRef.current, 1);
                  const currentPosition = progress * totalRange;
                  const linePercent = (currentPosition / totalRange) * 100;

                  return (
                    <div
                      className="absolute top-0 bottom-0 w-1 bg-[#435663] shadow-lg"
                      style={{
                        left: `${linePercent}%`,
                        transform: "translateX(-50%)",
                      }}
                    />
                  );
                })()}
            </div>

            <div className="flex justify-center mt-4 gap-3 flex-wrap">
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
            <h3 className="text-lg font-semibold text-[#313647] mb-4">
              Create Custom Range
            </h3>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-[#313647]">
                  Min Distance (m)
                </label>
                <input
                  type="number"
                  min="0"
                  max="2.5"
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
                  max="2.5"
                  step="0.1"
                  value={newRangeMax}
                  onChange={(e) => setNewRangeMax(e.target.value)}
                  placeholder="2.5"
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
              Ranges cannot overlap. Valid range: 0m - 2.5m
            </p>
          </div>

          {/* Distance Trigger Configuration */}
          <div className="space-y-4">
            {distanceTriggers.map((trigger) => (
              <div
                key={trigger.id}
                className="bg-[#FFF8D4] p-4 rounded-lg border border-[#A3B087]/20 space-y-3"
              >
                <div className="flex justify-between items-center">
                  <h3 className="font-semibold text-[#313647]">
                    {trigger.minDistance}m - {trigger.maxDistance}m
                    {!["zone1", "zone2", "zone3", "zone4"].includes(
                      trigger.id,
                    ) && (
                      <span className="text-xs text-[#A3B087] ml-2">
                        (Custom)
                      </span>
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
                      const audio = [
                        ...PRESET_BUZZER_SOUNDS,
                        ...uploadedAudios,
                        ...savedCustomTones,
                      ].find((a) => a.id === audioId);
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
                    {savedCustomTones.length > 0 && (
                      <optgroup label="Saved Custom Tones">
                        {savedCustomTones.map((audio) => (
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

          {/* Save and Load Buttons */}
          <div className="mt-8 border-t border-[#A3B087]/20 pt-8 space-y-4">
            <h3 className="text-lg font-semibold text-[#313647] mb-4">
              Save & Load Settings
            </h3>
            <div className="flex flex-col sm:flex-row gap-4">
              <Button
                onClick={handleSaveAndLoad}
                disabled={
                  !serialConnected || !allRangesAssigned || isSavingSettings
                }
                size="lg"
                className={`flex-1 ${
                  serialConnected && allRangesAssigned
                    ? "bg-green-600 hover:bg-green-700"
                    : "bg-gray-400 cursor-not-allowed"
                } text-white`}
              >
                {isSavingSettings ? "Saving..." : "SAVE & LOAD TO ESP32"}
              </Button>
              <Button
                onClick={handleLoadSavedSettings}
                disabled={!userId}
                size="lg"
                variant="outline"
                className="flex-1 border-[#435663] text-[#435663] hover:bg-[#435663]/10"
              >
                Load Saved Settings
              </Button>
            </div>
            <div className="text-sm text-[#A3B087] bg-[#A3B087]/10 p-3 rounded-lg">
              {serialConnected ? (
                <p>✓ Serial connected (ID: {userId})</p>
              ) : (
                <p>✗ Serial not connected. Connect ESP32 via USB.</p>
              )}
              {!allRangesAssigned && (
                <p className="text-orange-600">
                  ⚠ Assign audio to all ranges before saving.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
