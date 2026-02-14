#include <SPI.h>
#include <MFRC522.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <ESP32Servo.h>

const int trigPin = 25;  
const int echoPin = 33;  
const int servoPin = 26; 

#define RST_PIN 27
#define SS_PIN 4

// Servo
Servo myServo;
int servoAngle = 15;       // Start angle
int servoStep = 1;         // Sweep direction

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

// Setup
void setup() {
  pinMode(trigPin, OUTPUT);
  pinMode(echoPin, INPUT);

  Serial.begin(9600);

  // I2C for OLED
  Wire.begin(21, 22);

  // Servo init
  myServo.setPeriodHertz(50);
  myServo.attach(servoPin, 700, 2200);
  myServo.write(servoAngle);  // Center/start position

  // OLED init
  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println("OLED not found");
    while(true);
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

void loop() {
  checkRFID();          // always check for RFID
  runRadarSweep();      // non-blocking servo sweep
}

// RFID Check
void checkRFID() {
  if (!mfrc522.PICC_IsNewCardPresent()) return;
  if (!mfrc522.PICC_ReadCardSerial()) return;

  display.clearDisplay();
  display.setCursor(0, 0);
  display.println("UID:");

  display.setCursor(0, 10);

  Serial.print("UID: ");

  for (byte i = 0; i < mfrc522.uid.size; i++) {
    byte b = mfrc522.uid.uidByte[i];

    Serial.print(b < 0x10 ? "0" : "");
    Serial.print(b, HEX);
    Serial.print(" ");

    display.print(b < 0x10 ? "0" : "");
    display.print(b, HEX);
    display.print(" ");
  }

  Serial.println();
  display.display();

  mfrc522.PICC_HaltA();
}

// Servo Sweep
void runRadarSweep() {
  unsigned long now = millis();
  if (now - lastServoTime < 30) return; // 30ms between servo steps

  myServo.write(servoAngle);
  distance = calculateDistance();
  sendData(servoAngle, distance);

  // update angle
  servoAngle += servoStep;
  if (servoAngle >= 180 || servoAngle <= 0) servoStep = -servoStep; // reverse sweep

  lastServoTime = now;
}

// Ultrasonic Distance
int calculateDistance() {
  digitalWrite(trigPin, LOW);
  delayMicroseconds(2);
  digitalWrite(trigPin, HIGH);
  delayMicroseconds(10);
  digitalWrite(trigPin, LOW);

  duration = pulseIn(echoPin, HIGH, 30000); // 30ms timeout
  if (duration == 0) return 999;  // no object detected
  distance = duration * 0.034 / 2;
  return distance;
}

// Serial Output
void sendData(int angle, int dist) {
  Serial.print(angle);
  Serial.print(",");
  Serial.println(dist);  // one reading per line
}