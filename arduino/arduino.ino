#include <SPI.h>
#include <MFRC522.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <ESP32Servo.h>
#include <Preferences.h>

const int trigPin = 25;
const int echoPin = 33;
const int servoPin = 26;

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

// Setup
void setup()
{
  pinMode(trigPin, OUTPUT);
  pinMode(echoPin, INPUT);

  Serial.begin(9600);

  // Initialize Preferences
  preferences.begin("userSettings", false);

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
  runRadarSweep();       // non-blocking servo sweep
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
  distance = calculateDistance();
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

// Serial Output
void sendData(int angle, int dist)
{
  Serial.print(angle);
  Serial.print(",");
  Serial.println(dist); // one reading per line
}

// Process serial input for settings
void processSerialInput()
{
  while (Serial.available() > 0)
  {
    char c = Serial.read();

    if (c == '\n')
    {
      String line = serialBuffer;
      serialBuffer = "";

      if (line.startsWith("SAVE_SETTINGS:"))
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

  // Store ranges count
  int rangeCount = 0;
  int startPos = 0;
  while (startPos < rangesStr.length() && rangeCount < MAX_RANGES)
  {
    int pipePos = rangesStr.indexOf('|', startPos);
    if (pipePos == -1)
      pipePos = rangesStr.length();

    String rangeStr = rangesStr.substring(startPos, pipePos);
    int comma1 = rangeStr.indexOf(',');
    int comma2 = rangeStr.indexOf(',', comma1 + 1);

    if (comma1 > 0 && comma2 > comma1)
    {
      float minDist = rangeStr.substring(0, comma1).toFloat();
      float maxDist = rangeStr.substring(comma1 + 1, comma2).toFloat();
      String audioId = rangeStr.substring(comma2 + 1);

      String key = userId + "_range" + String(rangeCount);
      preferences.putFloat((key + "_min").c_str(), minDist);
      preferences.putFloat((key + "_max").c_str(), maxDist);
      preferences.putString((key + "_audio").c_str(), audioId);

      rangeCount++;
    }

    startPos = pipePos + 1;
  }

  // Store range count
  preferences.putInt((userId + "_count").c_str(), rangeCount);

  // Store audio data (simplified - just store the string)
  preferences.putString((userId + "_audio").c_str(), audioStr);

  preferences.end();
  preferences.begin("userSettings", false);

  Serial.print("Settings saved for user: ");
  Serial.println(userId);
}

// Load user settings from Preferences
void loadUserSettings(String userId)
{
  if (userId.length() == 0)
    return;

  currentRangeCount = 0;
  int savedCount = preferences.getInt((userId + "_count").c_str(), 0);

  if (savedCount == 0)
  {
    Serial.println("No settings found for this user");
    settingsLoaded = false;
    return;
  }

  for (int i = 0; i < savedCount && i < MAX_RANGES; i++)
  {
    String key = userId + "_range" + String(i);
    float minDist = preferences.getFloat((key + "_min").c_str(), 0);
    float maxDist = preferences.getFloat((key + "_max").c_str(), 0);
    String audioId = preferences.getString((key + "_audio").c_str(), "");

    if (maxDist > minDist && audioId.length() > 0)
    {
      currentRanges[currentRangeCount].minDistance = minDist;
      currentRanges[currentRangeCount].maxDistance = maxDist;
      currentRanges[currentRangeCount].audioId = audioId;
      currentRangeCount++;
    }
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

// Trigger audio (placeholder - implement based on your audio system)
void triggerAudio(String audioId)
{
  // This is a placeholder - implement audio playback based on your system
  // For now, just print to serial
  static unsigned long lastTriggerTime = 0;
  unsigned long now = millis();

  // Debounce - only trigger once per second
  if (now - lastTriggerTime > 1000)
  {
    Serial.print("TRIGGER:");
    Serial.println(audioId);
    lastTriggerTime = now;
  }
}