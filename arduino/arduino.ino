#include <MFRC522.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <ESP32Servo.h>
#include <Preferences.h>
#include "SPIFFS.h"

// ---------------- PIN ASSIGNMENTS ----------------
const int trigPin = 33;
const int echoPin = 32;
const int servoPin = 25;
const int dacPin = 26;

#define RST_PIN 27
#define SS_PIN 4
#define MAX_RANGES 3

// ---------------- SYSTEM STATE ----------------
bool systemArmed = false;

// ---------------- SERVO ----------------
Servo myServo;
int servoAngle = 15;
int servoStep = 1;
unsigned long lastServoTime = 0;

// ---------------- ULTRASONIC ----------------
long duration;
int distance;
unsigned long lastDistanceTime = 0;
const unsigned long distanceIntervalMs = 60;

// ---------------- OLED ----------------
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 32
#define OLED_RESET -1
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

// ---------------- RFID ----------------
MFRC522 mfrc522(SS_PIN, RST_PIN);

// ---------------- STORAGE ----------------
Preferences preferences;

// ---------------- USER SETTINGS ----------------
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

// ---------------- SERIAL ----------------
String serialBuffer = "";
bool receivingSettings = false;
String settingsUserId = "";
String rangesData = "";
String audioData = "";

// ---------------- AUDIO RX ----------------
bool receivingAudio = false;
String audioFilename = "";
uint32_t audioExpectedBytes = 0;
uint32_t audioReceivedBytes = 0;
File audioFile;

// ---------------- AUDIO PLAYBACK ----------------
bool isPlayingAudio = false;
uint32_t audioSampleRate = 8000;
unsigned long audioLoopDelay = 1000;
unsigned long lastAudioTriggerTime = 0;

// =================================================
// SETUP
// =================================================
void setup()
{
  pinMode(trigPin, OUTPUT);
  pinMode(echoPin, INPUT);

  Serial.begin(9600);

  preferences.begin("userSettings", false);

  if (!SPIFFS.begin(true))
    Serial.println("SPIFFS Mount Failed");
  else
  {
    Serial.println("SPIFFS Mounted");
    if (!SPIFFS.exists("/sounds"))
      SPIFFS.mkdir("/sounds");
  }

  Wire.begin(21, 22);

  myServo.setPeriodHertz(50);
  myServo.attach(servoPin, 700, 2200);
  myServo.write(servoAngle);

  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C))
  {
    Serial.println("OLED not found");
    while (true);
  }

  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 0);
  display.println("Scan a card");
  display.display();

  SPI.begin(14, 12, 13, SS_PIN);
  mfrc522.PCD_Init();

  Serial.println("RFID Ready");
}

// =================================================
// LOOP
// =================================================
void loop()
{
  checkRFID();
  processSerialInput();

  if (!systemArmed)
  {
    showIdleScreen();
    return;
  }

  updateDistance();
  runRadarSweep();
  checkDistanceRanges();
}

// =================================================
// IDLE SCREEN
// =================================================
void showIdleScreen()
{
  static bool idleDisplayed = false;

  if (!idleDisplayed)
  {
    display.clearDisplay();
    display.setCursor(0, 0);
    display.println("Scan a card");
    display.display();
    idleDisplayed = true;
  }
}

// =================================================
// RFID
// =================================================
void checkRFID()
{
  if (!mfrc522.PICC_IsNewCardPresent())
    return;
  if (!mfrc522.PICC_ReadCardSerial())
    return;

  String uidString = "";
  Serial.print("UID: ");

  for (byte i = 0; i < mfrc522.uid.size; i++)
  {
    byte b = mfrc522.uid.uidByte[i];

    Serial.print(b < 0x10 ? "0" : "");
    Serial.print(b, HEX);
    Serial.print(" ");

    if (b < 0x10) uidString += "0";
    uidString += String(b, HEX);
    if (i < mfrc522.uid.size - 1) uidString += " ";
  }

  Serial.println();

  currentUserId = uidString;
  loadUserSettings(uidString);

  if (settingsLoaded)
  {
    systemArmed = true;

    display.clearDisplay();
    display.setCursor(0, 0);
    display.println("System Active");
    display.setCursor(0, 10);
    display.println(uidString.substring(0, 8));
    display.display();

    Serial.println("SYSTEM_ARMED");
  }
  else
  {
    systemArmed = false;

    display.clearDisplay();
    display.setCursor(0, 0);
    display.println("No Settings");
    display.setCursor(0, 10);
    display.println("Scan Again");
    display.display();

    Serial.println("SYSTEM_NOT_ARMED");
  }

  mfrc522.PICC_HaltA();
}

// =================================================
// SERVO SWEEP
// =================================================
void runRadarSweep()
{
  unsigned long now = millis();
  if (now - lastServoTime < 30) return;

  myServo.write(servoAngle);
  sendData(servoAngle, distance);

  servoAngle += servoStep;
  if (servoAngle >= 180 || servoAngle <= 0)
    servoStep = -servoStep;

  lastServoTime = now;
}

// =================================================
// DISTANCE
// =================================================
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

  duration = pulseIn(echoPin, HIGH, 30000);

  if (duration == 0)
    distance = 999;
  else
    distance = duration * 0.034 / 2;
}

// =================================================
// SERIAL OUTPUT
// =================================================
void sendData(int angle, int dist)
{
  Serial.print(angle);
  Serial.print(",");
  Serial.println(dist);
}

// =================================================
// SERIAL INPUT
// =================================================
void processSerialInput()
{
  while (Serial.available() > 0)
  {
    if (receivingAudio)
    {
      uint8_t buffer[64];
      int bytesToRead = min(64, (int)(audioExpectedBytes - audioReceivedBytes));
      int bytesRead = Serial.readBytes(buffer, bytesToRead);

      if (bytesRead > 0 && audioFile)
      {
        audioFile.write(buffer, bytesRead);
        audioReceivedBytes += bytesRead;

        if (audioReceivedBytes >= audioExpectedBytes)
        {
          audioFile.close();
          Serial.print("AUDIO_SAVED:");
          Serial.println(audioFilename);
          receivingAudio = false;
        }
      }
      continue;
    }

    char c = Serial.read();

    if (c == '\n')
    {
      String line = serialBuffer;
      serialBuffer = "";

      if (line.startsWith("START_SOUND "))
      {
        int firstSpace = line.indexOf(' ');
        int secondSpace = line.indexOf(' ', firstSpace + 1);

        audioFilename = line.substring(firstSpace + 1, secondSpace);
        audioExpectedBytes = line.substring(secondSpace + 1).toInt();
        audioReceivedBytes = 0;

        audioFile = SPIFFS.open("/sounds/" + audioFilename, FILE_WRITE);

        if (audioFile)
        {
          receivingAudio = true;
          Serial.println("OK:RECEIVING_AUDIO");
        }
      }
      else if (line.startsWith("SAVE_SETTINGS:"))
      {
        receivingSettings = true;
        settingsUserId = line.substring(14);
        settingsUserId.trim();
        Serial.println("OK:READY");
      }
      else if (line.startsWith("RANGES:"))
      {
        rangesData = line.substring(7);
      }
      else if (line == "END_SETTINGS")
      {
        saveUserSettings(settingsUserId, rangesData);
        receivingSettings = false;
        Serial.println("OK:SAVED");
      }
    }
    else
    {
      serialBuffer += c;
    }
  }
}

// =================================================
// SAVE SETTINGS
// =================================================
void saveUserSettings(String userId, String rangesStr)
{
  auto makePrefsKey = [](const String &uid) -> String
  {
    String s = "";
    for (char c : uid)
      if (isxdigit(c)) s += (char)toupper(c);

    if (s.length() > 12) s = s.substring(0, 12);
    return "u" + s;
  };

  String prefKey = makePrefsKey(userId);

  preferences.putString((prefKey + "r").c_str(), rangesStr);

  Serial.println("Settings saved");
}

// =================================================
// LOAD SETTINGS
// =================================================
void loadUserSettings(String userId)
{
  auto makePrefsKey = [](const String &uid) -> String
  {
    String s = "";
    for (char c : uid)
      if (isxdigit(c)) s += (char)toupper(c);

    if (s.length() > 12) s = s.substring(0, 12);
    return "u" + s;
  };

  String prefKey = makePrefsKey(userId);

  String savedRanges = preferences.getString((prefKey + "r").c_str(), "");

  if (savedRanges.length() == 0)
  {
    Serial.println("No settings found");
    settingsLoaded = false;
    return;
  }

  currentRangeCount = 0;
  int startPos = 0;

  while (startPos < savedRanges.length() && currentRangeCount < MAX_RANGES)
  {
    int pipePos = savedRanges.indexOf('|', startPos);
    if (pipePos == -1) pipePos = savedRanges.length();

    String rangeStr = savedRanges.substring(startPos, pipePos);

    int c1 = rangeStr.indexOf(',');
    int c2 = rangeStr.indexOf(',', c1 + 1);

    if (c1 > 0 && c2 > c1)
    {
      currentRanges[currentRangeCount].minDistance = rangeStr.substring(0, c1).toFloat();
      currentRanges[currentRangeCount].maxDistance = rangeStr.substring(c1 + 1, c2).toFloat();
      currentRanges[currentRangeCount].audioId = rangeStr.substring(c2 + 1);

      currentRangeCount++;
    }

    startPos = pipePos + 1;
  }

  settingsLoaded = (currentRangeCount > 0);

  Serial.print("Loaded ranges: ");
  Serial.println(currentRangeCount);
}

// =================================================
// RANGE CHECK
// =================================================
void checkDistanceRanges()
{
  if (!settingsLoaded) return;

  for (int i = 0; i < currentRangeCount; i++)
  {
    if (distance >= currentRanges[i].minDistance &&
        distance <= currentRanges[i].maxDistance)
    {
      triggerAudio(currentRanges[i].audioId);
      break;
    }
  }
}

// =================================================
// AUDIO
// =================================================
void triggerAudio(String audioId)
{
  unsigned long now = millis();
  if (now - lastAudioTriggerTime < audioLoopDelay) return;

  lastAudioTriggerTime = now;
  playAudioBlocking(audioId);
}

void playAudioBlocking(const String &audioId)
{
  String filepath = "/sounds/" + audioId + ".raw";

  if (!SPIFFS.exists(filepath))
  {
    Serial.println("Audio missing");
    return;
  }

  File file = SPIFFS.open(filepath, FILE_READ);
  if (!file) return;

  isPlayingAudio = true;

  unsigned long sampleDelayUs = 1000000UL / audioSampleRate;

  while (file.available())
  {
    uint8_t sample = file.read(); // Volume scaling (50%) 
    uint8_t scaledSample = 128 + ((int)sample - 128) * 0.3; 
    dacWrite(dacPin, scaledSample);
    delayMicroseconds(sampleDelayUs);
  }

  file.close();
  isPlayingAudio = false;
  dacWrite(dacPin, 128);
}
