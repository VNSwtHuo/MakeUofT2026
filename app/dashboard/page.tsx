"use client";

import { LogOut, Upload, Volume2, Play } from "lucide-react";
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
    name: "Warning Buzz (440Hz)",
    frequency: 440,
    duration: 0.5,
    period: 1,
    isPreset: true,
  },
  {
    id: "alert",
    name: "Alert Tone (800Hz)",
    frequency: 800,
    duration: 0.3,
    period: 0.8,
    isPreset: true,
  },
  {
    id: "beep",
    name: "Simple Beep (1000Hz)",
    frequency: 1000,
    duration: 0.2,
    period: 0.5,
    isPreset: true,
  },
  {
    id: "chime",
    name: "Chime Sound (1200Hz)",
    frequency: 1200,
    duration: 0.4,
    period: 1.2,
    isPreset: true,
  },
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

  oscillator.start(audioContext.currentTime);
  oscillator.stop(audioContext.currentTime + duration);
};

export default function Dashboard() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const repeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const presetRepeatIntervalsRef = useRef<Map<string, NodeJS.Timeout>>(
    new Map(),
  );
  const [uploadedAudios, setUploadedAudios] = useState<AudioFile[]>([]);
  const [activeSound, setActiveSound] = useState<string | null>(null);
  const [customFrequency, setCustomFrequency] = useState<number | string>(500);
  const [customPeriod, setCustomPeriod] = useState<number | string>(0.5);
  const [isPlayingRepeat, setIsPlayingRepeat] = useState(false);
  const [distanceTriggers, setDistanceTriggers] = useState<DistanceTrigger[]>([
    { id: "zone1", minDistance: 0.03, maxDistance: 1, audioId: null },
    { id: "zone2", minDistance: 1, maxDistance: 2, audioId: null },
    { id: "zone3", minDistance: 2, maxDistance: 3, audioId: null },
    { id: "zone4", minDistance: 3, maxDistance: 4, audioId: null },
  ]);
  const [newRangeMin, setNewRangeMin] = useState<number | string>(0.1);
  const [newRangeMax, setNewRangeMax] = useState<number | string>(0.5);
  const [isPlayingSequence, setIsPlayingSequence] = useState(false);
  const [playingTrigger, setPlayingTrigger] = useState<string | null>(null);
  const [playbackProgress, setPlaybackProgress] = useState(0); // 0-100
  const sequenceIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const playbackStartTimeRef = useRef<number>(0);
  const playbackDurationRef = useRef<number>(0);

  // Update playback progress animation
  useEffect(() => {
    if (!isPlayingSequence) return;

    const updateProgress = () => {
      if (playbackStartTimeRef.current && playbackDurationRef.current) {
        const elapsed = Date.now() - playbackStartTimeRef.current;
        const progress = Math.min(
          (elapsed / playbackDurationRef.current) * 100,
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

  async function saveUserSettings(userId: string, settings: any) {
    await fetch("/user", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        userId,
        settings,
      }),
    });
  }

  const addCustomRange = () => {
    const minVal =
      typeof newRangeMin === "string" ? parseFloat(newRangeMin) : newRangeMin;
    const maxVal =
      typeof newRangeMax === "string" ? parseFloat(newRangeMax) : newRangeMax;

    if (isNaN(minVal) || isNaN(maxVal)) {
      alert("Please enter valid numbers");
      return;
    }

    if (minVal < 0.03 || maxVal > 4) {
      alert("Range must be between 0.03m and 4m");
      return;
    }

    if (minVal >= maxVal) {
      alert("Min distance must be less than max distance");
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
      setIsPlayingSequence(false);
      setPlayingTrigger(null);
      setPlaybackProgress(0);
      setActiveSound(null);
      return;
    }

    // Get triggers that have audio assigned
    const triggersWithAudio = distanceTriggers.filter((t) => t.audioId);
    if (triggersWithAudio.length === 0) {
      alert("No audio assigned to any distance triggers");
      return;
    }

    setIsPlayingSequence(true);
    let currentIndex = 0;

    const playNextTrigger = () => {
      if (currentIndex >= triggersWithAudio.length) {
        // Sequence complete
        setIsPlayingSequence(false);
        setPlayingTrigger(null);
        setActiveSound(null);
        return;
      }

      const trigger = triggersWithAudio[currentIndex];
      setPlayingTrigger(trigger.id);
      const audio = [...PRESET_BUZZER_SOUNDS, ...uploadedAudios].find(
        (a) => a.id === trigger.audioId,
      );

      if (audio) {
        setActiveSound(audio.id);
        // Calculate duration: 2 seconds per meter
        const rangeSize = trigger.maxDistance - trigger.minDistance;
        const durationSeconds = rangeSize * 2; // 2 seconds per meter
        const duration = durationSeconds * 1000;

        // Set playback timing for progress animation
        playbackStartTimeRef.current = Date.now();
        playbackDurationRef.current = duration;
        setPlaybackProgress(0);

        if (audio.isPreset && audio.frequency && audio.period) {
          // Play preset tone with its original period repeated for proportional duration
          const startTime = Date.now();
          playTone(audio.frequency!, 0.1); // Play immediately

          const playInterval = setInterval(() => {
            if (Date.now() - startTime >= duration) {
              clearInterval(playInterval);
            } else {
              playTone(audio.frequency!, 0.1);
            }
          }, audio.period * 1000);
        } else if (audio.url) {
          // Play uploaded file
          if (audioRef.current) {
            audioRef.current.src = audio.url;
            audioRef.current.play();
          }
        }
      }

      currentIndex++;
      const rangeSize = trigger.maxDistance - trigger.minDistance;
      const durationSeconds = rangeSize * 2; // 2 seconds per meter
      sequenceIntervalRef.current = setTimeout(
        playNextTrigger,
        (durationSeconds + 0.5) * 1000,
      ); // Add 0.5s gap
    };

    playNextTrigger();
  };

  const getAudioForDistance = (distanceMeters: number): AudioFile | null => {
    const trigger = distanceTriggers.find(
      (t) => distanceMeters >= t.minDistance && distanceMeters <= t.maxDistance,
    );

    if (!trigger || !trigger.audioId) return null;

    const allAudios = [...PRESET_BUZZER_SOUNDS, ...uploadedAudios];
    return allAudios.find((audio) => audio.id === trigger.audioId) || null;
  };

  const handlePlayCustomTone = () => {
    const freq =
      typeof customFrequency === "string"
        ? parseInt(customFrequency)
        : customFrequency;

    if (!isNaN(freq)) {
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
      if (audio.isPreset && presetRepeatIntervalsRef.current.has(audio.id)) {
        const intervalId = presetRepeatIntervalsRef.current.get(audio.id);
        if (intervalId) {
          clearInterval(intervalId);
        }
        presetRepeatIntervalsRef.current.delete(audio.id);
      }
      setActiveSound(null);
      return;
    }

    // Stop any other preset that's playing
    presetRepeatIntervalsRef.current.forEach((intervalId) => {
      clearInterval(intervalId);
    });
    presetRepeatIntervalsRef.current.clear();

    setActiveSound(audio.id);

    if (audio.isPreset && audio.frequency && audio.period) {
      // Play preset tone with repetition
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
        audioRef.current.play();
      }
    }
  };

  const deleteUploadedAudio = (id: string) => {
    setUploadedAudios((prev) => prev.filter((audio) => audio.id !== id));
  };

  const allAudios = [...PRESET_BUZZER_SOUNDS, ...uploadedAudios];

  return (
    <div className="min-h-screen flex flex-col px-4 py-8 bg-[#FFF8D4]">
      <audio ref={audioRef} onEnded={() => setActiveSound(null)} />

      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div className="text-center flex-1">
          <h1 className="text-[#313647] text-4xl font-bold">
            Audio Control Panel
          </h1>
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
                  className={`h-24 flex flex-col items-center justify-center transition-colors ${
                    activeSound === audio.id
                      ? "bg-[#435663] text-white border-[#435663]"
                      : "bg-[#A3B087]/10 hover:bg-[#A3B087]/20 text-[#313647] border border-[#A3B087]/30"
                  } rounded-lg`}
                >
                  <Play className="size-5 mb-1" />
                  <span className="text-xs font-medium text-center leading-tight">
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
                    <p className="font-medium text-[#313647] truncate">
                      {audio.name}
                    </p>
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
                      <Play className="size-4" />
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
                <Play className="mr-2 size-5" />
                {isPlayingRepeat ? "Stop Repeat" : "Play Repeat"}
              </Button>
            </div>
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
            ranges (3cm - 4m)
          </p>

          {/* Visual Range Display */}
          <div className="mb-8 p-4 bg-[#FFF8D4] rounded-lg border border-[#A3B087]/20">
            <div className="flex items-center justify-between mb-4 px-2">
              <div className="flex-1">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-[#313647]">
                    3cm
                  </span>
                  <span className="text-sm font-medium text-[#313647]">4m</span>
                </div>
              </div>
              <Button
                onClick={playDistanceSequence}
                size="sm"
                className={`ml-4 ${
                  isPlayingSequence
                    ? "bg-red-600 text-white hover:bg-red-700"
                    : "bg-[#435663] text-white hover:bg-[#435663]/90"
                }`}
              >
                <Play className="mr-2 size-4" />
                {isPlayingSequence ? "Stop Sequence" : "Play Sequence"}
              </Button>
            </div>
            <div className="relative h-12 bg-white rounded border border-[#A3B087]/30 overflow-hidden">
              {/* Background showing all distance ranges */}
              <div className="absolute inset-0 flex gap-0">
                {distanceTriggers.map((trigger) => {
                  const rangeSize = trigger.maxDistance - trigger.minDistance;
                  const totalRange = 4 - 0.03;
                  const widthPercent = (rangeSize / totalRange) * 100;
                  return (
                    <div
                      key={`bg-${trigger.id}`}
                      style={{ width: `${widthPercent}%` }}
                      className="bg-gradient-to-r from-[#A3B087]/20 to-[#A3B087]/10 border-r border-[#A3B087]/20 flex items-center justify-center text-xs font-medium text-[#313647]"
                      title={`${trigger.minDistance}m - ${trigger.maxDistance}m: ${trigger.audioName || "No audio assigned"}`}
                    >
                      {trigger.audioName && (
                        <span className="truncate px-2">
                          {trigger.audioName.length > 15
                            ? trigger.audioName.substring(0, 15) + "..."
                            : trigger.audioName}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Vertical line indicator */}
              {playingTrigger &&
                (() => {
                  const trigger = distanceTriggers.find(
                    (t) => t.id === playingTrigger,
                  );
                  if (!trigger) return null;
                  const rangeSize = trigger.maxDistance - trigger.minDistance;
                  const totalRange = 4 - 0.03;
                  const rangeStartPercent =
                    ((trigger.minDistance - 0.03) / totalRange) * 100;
                  const rangeWidth = (rangeSize / totalRange) * 100;
                  const linePercent =
                    rangeStartPercent + (rangeWidth * playbackProgress) / 100;
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
                  min="0.03"
                  max="4"
                  step="0.1"
                  value={newRangeMin}
                  onChange={(e) => setNewRangeMin(e.target.value)}
                  placeholder="0.03"
                  className="w-full px-3 py-2 border border-[#A3B087]/30 rounded-lg text-[#313647] bg-white"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-[#313647]">
                  Max Distance (m)
                </label>
                <input
                  type="number"
                  min="0.03"
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
              Ranges cannot overlap. Valid range: 0.03m - 4m
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
