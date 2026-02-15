#ifndef AUDIO_SIGNALS_CONFIG_H
#define AUDIO_SIGNALS_CONFIG_H

#include <stdint.h>
#include "audio/audio_data_warning.h"
#include "audio/audio_data_tts_1771133940211_0_7691792201524164.h"
#include "audio/audio_data_beep.h"

typedef struct {
  const char* id;
  const char* name;
  float frequency_hz;
  float period_s;
  const char* source;
  const uint8_t* data;
  uint32_t length;
  uint32_t sample_rate;
} AudioSignal;

typedef struct {
  float min_m;
  float max_m;
  const char* audio_id;
} DistanceTrigger;

#define AUDIO_SIGNAL_COUNT 3
#define DISTANCE_TRIGGER_COUNT 3

static const AudioSignal AUDIO_SIGNALS[AUDIO_SIGNAL_COUNT] = {
  {"warning", "440Hz, 1s", 440, 1, "saved-tone", AUDIO_DATA_warning, 8000, 8000},
  {"tts-1771133940211-0.7691792201524164", "Voice: \"testing\"", 0, 0, "ai-voice", AUDIO_DATA_tts_1771133940211_0_7691792201524164, 7431, 8000},
  {"beep", "1000Hz, 0.5s", 1000, 0.5, "saved-tone", AUDIO_DATA_beep, 4000, 8000}
};

static const DistanceTrigger DISTANCE_TRIGGERS[DISTANCE_TRIGGER_COUNT] = {
  {0, 1, "warning"},
  {1, 2, "tts-1771133940211-0.7691792201524164"},
  {2, 4, "beep"}
};

#endif // AUDIO_SIGNALS_CONFIG_H
