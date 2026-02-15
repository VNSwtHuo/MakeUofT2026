#include <MFRC522.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <ESP32Servo.h>
#include <Preferences.h>
#include "SPIFFS.h"

// Pin assignments - CORRECTED to match actual hardware wiring
const int trigPin = 33;  // Ultrasonic trigger (GPIO33)
const int echoPin = 32;  // Ultrasonic echo (GPIO32)
const int servoPin = 25; // Servo motor (GPIO25)
const int dacPin = 26;   // DAC2 audio output (GPIO26) → Amplifier → Speaker

#define RST_PIN 27
#define SS_PIN 4
#define MAX_RANGES 3
#define MAX_USER_ID_LENGTH 32

// Servo
Servo myServo;
int servoAngle = 15; // Start angle
int servoStep = 1;   // Sweep direction

unsigned long lastServoTime = 0; // for non-blocking sweep

// Ultrasonic
long duration;
int distance;
unsigned long lastDistanceTime = 0;
const unsigned long distanceIntervalMs = 60;

// OLED
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 32
#define OLED_RESET -1
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

// RFID
MFRC522 mfrc522(SS_PIN, RST_PIN);

// Settings storage
Preferences preferences;

// Current user settings
struct DistanceRange
{
  float minDistance;
  float maxDistance;
  String audioId;
};

DistanceRange currentRanges[MAX_RANGES];
int currentRangeCount = 0;
String currentUserId = "";
bool settingsLoaded = false;

// Serial input buffer
String serialBuffer = "";
bool receivingSettings = false;
String settingsUserId = "";
String rangesData = "";
String audioData = "";

// Audio file receiving state
bool receivingAudio = false;
String audioFilename = "";
uint32_t audioExpectedBytes = 0;
uint32_t audioReceivedBytes = 0;
File audioFile;

// Audio playback state
bool isPlayingAudio = false;
File currentAudioFile;
uint32_t audioSampleRate = 8000;
uint32_t audioPosition = 0;
unsigned long lastAudioSampleTime = 0;
unsigned long audioLoopDelay = 1000; // 1 second between loops
unsigned long lastAudioTriggerTime = 0;

// Setup
void setup()
{
  pinMode(trigPin, OUTPUT);
  pinMode(echoPin, INPUT);

  Serial.begin(9600);

  // Initialize Preferences
  preferences.begin("userSettings", false);

  // Initialize SPIFFS for audio file storage
  if (!SPIFFS.begin(true))
  {
    Serial.println("SPIFFS Mount Failed");
  }
  else
  {
    Serial.println("SPIFFS Mounted Successfully");
    // Print SPIFFS info
    Serial.printf("SPIFFS Total: %d bytes\n", SPIFFS.totalBytes());
    Serial.printf("SPIFFS Used: %d bytes\n", SPIFFS.usedBytes());

    // Create /sounds directory if it doesn't exist
    if (!SPIFFS.exists("/sounds"))
    {
      SPIFFS.mkdir("/sounds");
      Serial.println("Created /sounds directory");
    }
  }

  // I2C for OLED
  Wire.begin(21, 22);

  // Servo init
  myServo.setPeriodHertz(50);
  myServo.attach(servoPin, 700, 2200);
  myServo.write(servoAngle); // Center/start position

  // OLED init
  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C))
  {
    Serial.println("OLED not found");
    while (true)
      ;
  }

  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 0);
  display.println("Scan a card");
  display.display();

  // SPI for RFID
  SPI.begin(14, 12, 13, SS_PIN);
  mfrc522.PCD_Init();
  Serial.println("RFID Reader Initialized");
  mfrc522.PCD_DumpVersionToSerial();
}

void loop()
{
  checkRFID();           // always check for RFID
  processSerialInput();  // process incoming serial commands
  updateDistance();      // update ultrasonic distance on a timer
  runRadarSweep();       // non-blocking servo sweep
  playAudioSamples();    // play audio via DAC (non-blocking)
  checkDistanceRanges(); // check if distance triggers any range
}

// RFID Check
void checkRFID()
{
  if (!mfrc522.PICC_IsNewCardPresent())
    return;
  if (!mfrc522.PICC_ReadCardSerial())
    return;

  display.clearDisplay();
  display.setCursor(0, 0);
  display.println("UID:");

  display.setCursor(0, 10);

  Serial.print("UID: ");

  String uidString = "";
  for (byte i = 0; i < mfrc522.uid.size; i++)
  {
    byte b = mfrc522.uid.uidByte[i];

    Serial.print(b < 0x10 ? "0" : "");
    Serial.print(b, HEX);
    Serial.print(" ");

    // Build UID string
    if (b < 0x10)
      uidString += "0";
    uidString += String(b, HEX);
    if (i < mfrc522.uid.size - 1)
      uidString += " ";

    display.print(b < 0x10 ? "0" : "");
    display.print(b, HEX);
    display.print(" ");
  }

  Serial.println();
  display.display();

  // Load settings for this user ID
  currentUserId = uidString;
  loadUserSettings(uidString);

  mfrc522.PICC_HaltA();
}

// Servo Sweep
void runRadarSweep()
{
  unsigned long now = millis();
  if (now - lastServoTime < 30)
    return; // 30ms between servo steps

  myServo.write(servoAngle);
  sendData(servoAngle, distance);

  // update angle
  servoAngle += servoStep;
  if (servoAngle >= 180 || servoAngle <= 0)
    servoStep = -servoStep; // reverse sweep

  lastServoTime = now;
}

// Ultrasonic Distance
int calculateDistance()
{
  digitalWrite(trigPin, LOW);
  delayMicroseconds(2);
  digitalWrite(trigPin, HIGH);
  delayMicroseconds(10);
  digitalWrite(trigPin, LOW);

  duration = pulseIn(echoPin, HIGH, 30000); // 30ms timeout
  if (duration == 0)
    return 999; // no object detected
  distance = duration * 0.034 / 2;
  return distance;
}

// Update distance periodically to avoid blocking audio playback
void updateDistance()
{
  unsigned long now = millis();
  if (now - lastDistanceTime < distanceIntervalMs)
    return;

  lastDistanceTime = now;

  digitalWrite(trigPin, LOW);
  delayMicroseconds(2);
  digitalWrite(trigPin, HIGH);
  delayMicroseconds(10);
  digitalWrite(trigPin, LOW);

  // Use shorter timeout while playing audio to reduce audio jitter
  unsigned long timeoutUs = isPlayingAudio ? 8000 : 30000;
  duration = pulseIn(echoPin, HIGH, timeoutUs);
  if (duration == 0)
  {
    distance = 999;
    return;
  }
  distance = duration * 0.034 / 2;
}

// Serial Output
void sendData(int angle, int dist)
{
  Serial.print(angle);
  Serial.print(",");
  Serial.println(dist); // one reading per line
}

// Process serial input for settings and audio files
void processSerialInput()
{
  while (Serial.available() > 0)
  {
    // If receiving audio file binary data
    if (receivingAudio)
    {
      // Read binary bytes directly
      uint8_t buffer[64];
      int bytesToRead = min(64, (int)(audioExpectedBytes - audioReceivedBytes));
      int bytesRead = Serial.readBytes(buffer, bytesToRead);

      if (bytesRead > 0 && audioFile)
      {
        audioFile.write(buffer, bytesRead);
        audioReceivedBytes += bytesRead;

        // Check if we've received all bytes
        if (audioReceivedBytes >= audioExpectedBytes)
        {
          audioFile.close();
          Serial.print("AUDIO_SAVED:");
          Serial.println(audioFilename);
          receivingAudio = false;
        }
      }
      continue; // Don't process text commands while receiving binary
    }

    char c = Serial.read();

    if (c == '\n')
    {
      String line = serialBuffer;
      serialBuffer = "";

      // Handle START_SOUND command
      if (line.startsWith("START_SOUND "))
      {
        // Parse: START_SOUND <filename> <length>
        int firstSpace = line.indexOf(' ');
        int secondSpace = line.indexOf(' ', firstSpace + 1);

        if (secondSpace > 0)
        {
          audioFilename = line.substring(firstSpace + 1, secondSpace);
          audioExpectedBytes = line.substring(secondSpace + 1).toInt();
          audioReceivedBytes = 0;

          // Create file in SPIFFS
          String filepath = "/sounds/" + audioFilename;
          audioFile = SPIFFS.open(filepath, FILE_WRITE);

          if (audioFile)
          {
            receivingAudio = true;
            Serial.println("OK:RECEIVING_AUDIO");
          }
          else
          {
            Serial.println("ERROR:FILE_OPEN_FAILED");
          }
        }
      }
      else if (line == "END_SOUND")
      {
        // Just in case - should already be closed
        if (audioFile)
        {
          audioFile.close();
        }
        receivingAudio = false;
        Serial.println("OK:AUDIO_COMPLETE");
      }
      else if (line.startsWith("SAVE_SETTINGS:"))
      {
        receivingSettings = true;
        settingsUserId = line.substring(14);
        settingsUserId.trim();
        rangesData = "";
        audioData = "";
        Serial.println("OK:READY");
      }
      else if (line.startsWith("RANGES:"))
      {
        rangesData = line.substring(7);
        Serial.println("OK:RANGES");
      }
      else if (line.startsWith("AUDIO:"))
      {
        audioData = line.substring(6);
        Serial.println("OK:AUDIO");
      }
      else if (line == "END_SETTINGS")
      {
        // Debug: Show what we're about to save
        Serial.print("DEBUG: Saving for userId: [");
        Serial.print(settingsUserId);
        Serial.println("]");
        Serial.print("DEBUG: Ranges data: [");
        Serial.print(rangesData);
        Serial.println("]");

        // Save settings
        saveUserSettings(settingsUserId, rangesData, audioData);
        receivingSettings = false;
        Serial.println("OK:SAVED");
      }
    }
    else
    {
      serialBuffer += c;
      // Prevent buffer overflow
      if (serialBuffer.length() > 512)
      {
        serialBuffer = "";
      }
    }
  }
}

// Save user settings to Preferences
void saveUserSettings(String userId, String rangesStr, String audioStr)
{
  if (userId.length() == 0)
    return;

  // Create a compact preferences key from the userId to avoid Preferences
  // maximum key length limits. Keep the prefKey short and prefix with 'u'.
  auto makePrefsKey = [](const String &uid) -> String
  {
    String s = "";
    for (unsigned int i = 0; i < uid.length(); i++)
    {
      char c = uid.charAt(i);
      // Keep hexadecimal characters only
      if ((c >= '0' && c <= '9') || (c >= 'A' && c <= 'F') || (c >= 'a' && c <= 'f'))
      {
        s += (char)toupper(c);
      }
    }
    // Truncate to 12 chars to leave room for short suffixes (max key length 15)
    if (s.length() > 12)
      s = s.substring(0, 12);
    return String("u") + s; // e.g., u0930C801
  };

  String prefKey = makePrefsKey(userId);

  // Store ranges and audio under two short keys: <prefKey>"r" and <prefKey>"a"
  preferences.putString((prefKey + "r").c_str(), rangesStr);
  preferences.putString((prefKey + "a").c_str(), audioStr);

  Serial.print("Settings saved for user (prefKey=");
  Serial.print(prefKey);
  Serial.print("): ");
  Serial.println(userId);

  // Verify by reading back
  String verify = preferences.getString((prefKey + "r").c_str(), "");
  Serial.print("Verification: ranges length = ");
  Serial.println(verify.length());
}

// Load user settings from Preferences
void loadUserSettings(String userId)
{
  if (userId.length() == 0)
    return;
  Serial.print("DEBUG: Loading settings for userId: [");
  Serial.print(userId);
  Serial.println("]");

  // Derive the same compact preferences key as used when saving
  auto makePrefsKey = [](const String &uid) -> String
  {
    String s = "";
    for (unsigned int i = 0; i < uid.length(); i++)
    {
      char c = uid.charAt(i);
      if ((c >= '0' && c <= '9') || (c >= 'A' && c <= 'F') || (c >= 'a' && c <= 'f'))
      {
        s += (char)toupper(c);
      }
    }
    if (s.length() > 12)
      s = s.substring(0, 12);
    return String("u") + s;
  };

  String prefKey = makePrefsKey(userId);

  String savedRanges = preferences.getString((prefKey + "r").c_str(), "");
  String savedAudio = preferences.getString((prefKey + "a").c_str(), "");

  if (savedRanges.length() == 0)
  {
    Serial.println("No settings found for this user");
    settingsLoaded = false;
    return;
  }

  // Parse savedRanges (same format as sent: min,max,audioId|...)
  currentRangeCount = 0;
  int startPos = 0;
  while (startPos < savedRanges.length() && currentRangeCount < MAX_RANGES)
  {
    int pipePos = savedRanges.indexOf('|', startPos);
    if (pipePos == -1)
      pipePos = savedRanges.length();

    String rangeStr = savedRanges.substring(startPos, pipePos);
    int comma1 = rangeStr.indexOf(',');
    int comma2 = rangeStr.indexOf(',', comma1 + 1);

    if (comma1 > 0 && comma2 > comma1)
    {
      float minDist = rangeStr.substring(0, comma1).toFloat();
      float maxDist = rangeStr.substring(comma1 + 1, comma2).toFloat();
      String audioId = rangeStr.substring(comma2 + 1);

      if (maxDist > minDist && audioId.length() > 0)
      {
        currentRanges[currentRangeCount].minDistance = minDist;
        currentRanges[currentRangeCount].maxDistance = maxDist;
        currentRanges[currentRangeCount].audioId = audioId;
        currentRangeCount++;
      }
    }

    startPos = pipePos + 1;
  }

  settingsLoaded = (currentRangeCount > 0);

  Serial.print("Loaded ");
  Serial.print(currentRangeCount);
  Serial.print(" ranges for user: ");
  Serial.println(userId);

  // Update display
  display.clearDisplay();
  display.setCursor(0, 0);
  display.print("User: ");
  display.println(userId.substring(0, 8));
  display.setCursor(0, 10);
  display.print("Ranges: ");
  display.print(currentRangeCount);
  display.display();
}

// Check if current distance triggers any range
void checkDistanceRanges()
{
  if (!settingsLoaded || currentRangeCount == 0)
    return;

  // Check distance against all ranges
  for (int i = 0; i < currentRangeCount; i++)
  {
    if (distance >= currentRanges[i].minDistance && distance <= currentRanges[i].maxDistance)
    {
      // Trigger audio for this range
      triggerAudio(currentRanges[i].audioId);
      break; // Only trigger one range at a time
    }
  }
}

// Trigger audio playback based on audio ID
void triggerAudio(String audioId)
{
  unsigned long now = millis();

  // Debounce - only trigger if not currently playing or delay has passed
  if (now - lastAudioTriggerTime < audioLoopDelay)
  {
    return;
  }

  lastAudioTriggerTime = now;

  // Blocking playback for cleaner timing (closer to header-based example)
  playAudioBlocking(audioId);
}

// Blocking audio playback for stable DAC timing
void playAudioBlocking(const String &audioId)
{
  String filepath = "/sounds/" + audioId + ".raw";

  if (!SPIFFS.exists(filepath))
  {
    Serial.print("AUDIO_NOT_FOUND:");
    Serial.println(filepath);
    return;
  }

  File file = SPIFFS.open(filepath, FILE_READ);
  if (!file)
  {
    Serial.print("AUDIO_OPEN_FAILED:");
    Serial.println(filepath);
    return;
  }

  Serial.print("PLAYING:");
  Serial.println(audioId);

  isPlayingAudio = true;
  unsigned long sampleDelayUs = 1000000UL / audioSampleRate;

  while (file.available())
  {
    uint8_t sample = file.read();
    dacWrite(dacPin, sample);
    delayMicroseconds(sampleDelayUs);
  }

  file.close();
  isPlayingAudio = false;
  dacWrite(dacPin, 128);

  // Wait between loops to avoid rapid retrigger
  delay(audioLoopDelay);
}

// Play audio samples via DAC (called in loop)
void playAudioSamples()
{
  // Deprecated: using blocking playback for stable DAC timing
  return;
}

// Stop audio playback
void stopAudio()
{
  if (isPlayingAudio && currentAudioFile)
  {
    currentAudioFile.close();
  }
  isPlayingAudio = false;
  dacWrite(dacPin, 128); // Set DAC to mid-level (silence)
}